package pl.kamil.voxelgame;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.net.ConnectivityManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.plugin.WebView;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

// ------------------------------------------------------------
// AKTUALIZACJE APLIKACJI NA TELEFON
//
// Wtyczka Capacitora "Aktualizacje" - gra (src/app/AndroidUpdates.js)
// woła ją przez window.Capacitor.nativePromise('Aktualizacje', ...).
// Wydania są w repozytorium z wydaniami na GitHubie (to samo co dla
// komputera); w każdym wydaniu jest android-latest.json:
//   { version, native, www: { file, size, sha256 }, apk: { ... } }
//
// Dwa rodzaje aktualizacji:
//   - PLIKI GRY (index.html, src/, assets/, lib/ - paczka .zip, kilka
//     MB): pobrane i sprawdzone (SHA-256) trafiają do folderu
//     files/gra/<wersja>/, a przy następnym uruchomieniu (albo od razu -
//     uruchomTeraz) Capacitor podaje grę z tego folderu zamiast z plików
//     wbudowanych w aplikację. Działa tylko, gdy część na telefon (ten
//     kod, Capacitor...) się nie zmieniła - "native" w wydaniu to jej
//     odcisk (tools/android-www.mjs), porównywany z odciskiem
//     zainstalowanej aplikacji (assets/public/wersja.json).
//   - APLIKACJA (.apk) - gdy zmieniła się część na telefon: pobrana
//     do cache/aktualizacja/, instaluje się po zgodzie gracza (Android
//     nie pozwala instalować po cichu; za pierwszym razem trzeba
//     zezwolić grze na instalowanie aplikacji). Nowa aplikacja zaczyna
//     od swoich wbudowanych plików (Capacitor sam zapomina folder
//     z poprzedniej wersji).
//
// Bezpieczeństwo przy zepsutej aktualizacji: nowe pliki gry są "na
// próbę", dopóki gra nie potwierdzi, że wystartowała (gotowe). Gdy
// dwa uruchomienia z rzędu się nie udadzą, przedStartem wraca do
// plików wbudowanych, a ta wersja nie będzie już pobierana.
//
// Wersja testowa ("Voxel Game (test)", pakiet .test) się nie
// aktualizuje - nowe testowe .apk są w Actions. Opis: docs/telefon.md.
// ------------------------------------------------------------

@CapacitorPlugin(name = "Aktualizacje")
public class AktualizacjePlugin extends Plugin {

    // Stan aktualizacji (SharedPreferences):
    //   gotowa - wersja pobranych plików gry, czeka na uruchomienie,
    //   proba, proby - wersja włączona na próbę, ile razy uruchomiona
    //                  bez potwierdzenia,
    //   zla    - wersja, z której trzeba było wrócić,
    //   apk    - wersja pobranej aplikacji (.apk).

    private static final String PREFS = "VoxelAktualizacje";

    private static final String GOTOWA = "gotowa";
    private static final String PROBA = "proba";
    private static final String PROBY = "proby";
    private static final String ZLA = "zla";
    private static final String APK = "apk";

    // Ile uruchomień bez potwierdzenia, zanim wrócimy do plików wbudowanych.
    private static final int MAX_PROB = 2;

    private static final int TIMEOUT_MS = 20000;

    private static final String LATEST = "android-latest.json";

    private static final Pattern VERSION = Pattern.compile("^[0-9]+\\.[0-9]+\\.[0-9]+$");
    private static final Pattern FILE_NAME = Pattern.compile("^[A-Za-z0-9._-]+$");

    // Pobieranie po kolei, poza wątkiem wtyczek.
    private final ExecutorService executor = Executors.newSingleThreadExecutor();


    // --------------------------------------------------------
    // Przed startem gry (MainActivity.onCreate, zanim Capacitor
    // wczyta stronę): pobrane pliki gry - włącz na próbę; próba bez
    // potwierdzenia za długo - wróć do plików wbudowanych.
    // --------------------------------------------------------

    static void przedStartem(Context context) {

        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        SharedPreferences web = context.getSharedPreferences(WebView.WEBVIEW_PREFS_NAME, Context.MODE_PRIVATE);

        String gotowa = prefs.getString(GOTOWA, null);

        if (gotowa != null) {

            File dir = gameDir(context, gotowa);

            if (new File(dir, "index.html").isFile()) {
                web.edit().putString(WebView.CAP_SERVER_PATH, dir.getAbsolutePath()).commit();
                prefs.edit().remove(GOTOWA).putString(PROBA, gotowa).putInt(PROBY, 0).commit();
            }
            else {
                prefs.edit().remove(GOTOWA).commit();
            }

        }

        String proba = prefs.getString(PROBA, null);

        if (proba != null) {

            int proby = prefs.getInt(PROBY, 0) + 1;

            if (proby > MAX_PROB) {

                web.edit().putString(WebView.CAP_SERVER_PATH, "").commit();
                prefs.edit().remove(PROBA).remove(PROBY).putString(ZLA, proba).commit();

                deleteRecursive(gameDir(context, proba));

            }
            else {
                prefs.edit().putInt(PROBY, proby).commit();
            }

        }

    }


    // --------------------------------------------------------
    // Metody dla gry
    // --------------------------------------------------------

    // Co jest zainstalowane i jaki jest stan aktualizacji.

    @PluginMethod
    public void info(PluginCall call) {

        Context context = getContext();

        JSObject result = new JSObject();

        result.put("apk", apkVersion(context));
        result.put("pakiet", context.getPackageName());

        // Wersja testowa się nie aktualizuje.

        result.put("wylaczone", context.getPackageName().endsWith(".test"));

        JSONObject bundled = bundledInfo(context);

        result.put("native", bundled != null ? bundled.optString("native", "") : "");
        result.put("repo", bundled != null ? bundled.optString("repo", "") : "");

        SharedPreferences prefs = prefs();

        result.put("gotowa", prefs.getString(GOTOWA, null));
        result.put("proba", prefs.getString(PROBA, null));
        result.put("zla", prefs.getString(ZLA, null));
        result.put("pobranaApk", prefs.getString(APK, null));

        result.put("platne", isMetered(context));
        result.put("zgoda", canInstall(context));

        call.resolve(result);

    }


    // Gra wystartowała - pliki na próbę są dobre. Przy okazji: stare
    // foldery z plikami gry i niedokończone pobrania do kosza.

    @PluginMethod
    public void gotowe(PluginCall call) {

        prefs().edit().remove(PROBA).remove(PROBY).apply();

        String active = bridge.getServerBasePath();
        String gotowa = prefs().getString(GOTOWA, null);

        File[] dirs = new File(getContext().getFilesDir(), "gra").listFiles();

        if (dirs != null) {

            for (File dir : dirs) {

                boolean keep =
                    dir.getAbsolutePath().equals(active) ||
                    (gotowa != null && dir.getName().equals(gotowa));

                if (!keep) {
                    deleteRecursive(dir);
                }

            }

        }

        File[] files = downloadDir(getContext()).listFiles();

        if (files != null) {

            for (File file : files) {

                if (file.getName().endsWith(".part")) {
                    file.delete();
                }

            }

        }

        call.resolve();

    }


    // Opis najnowszego wydania (android-latest.json).

    @PluginMethod
    public void sprawdz(PluginCall call) {

        executor.execute(() -> {

            try {

                String text = downloadText(releaseUrl("latest/download/" + LATEST));

                call.resolve(new JSObject(text));

            }
            catch (Exception error) {
                call.reject("Nie udało się sprawdzić wydań: " + error.getMessage());
            }

        });

    }


    // Pobiera pliki gry wersji version (paczka file), sprawdza i
    // rozpakowuje - będą użyte przy następnym uruchomieniu.

    @PluginMethod
    public void pobierzGre(PluginCall call) {

        String version = call.getString("version", "");
        String file = call.getString("file", "");
        String sha256 = call.getString("sha256", "");
        long size = call.getData().optLong("size", -1L);

        if (!VERSION.matcher(version).matches() || !FILE_NAME.matcher(file).matches()) {
            call.reject("Zła wersja albo nazwa pliku.");
            return;
        }

        executor.execute(() -> {

            Context context = getContext();

            File zip = new File(downloadDir(context), file);
            File target = gameDir(context, version);
            File temp = new File(target.getParentFile(), version + ".tmp");

            try {

                download(releaseUrl("download/v" + version + "/" + file), zip, size, sha256, version, "gra");

                deleteRecursive(temp);
                unzip(zip, temp);

                // Czy to na pewno pliki gry tej wersji?

                JSONObject info = new JSONObject(readText(new FileInputStream(new File(temp, "wersja.json"))));

                if (!new File(temp, "index.html").isFile() || !version.equals(info.optString("version"))) {
                    throw new IOException("w paczce nie ma gry w wersji " + version);
                }

                deleteRecursive(target);

                if (!temp.renameTo(target)) {
                    throw new IOException("nie da się zapisać plików gry");
                }

                prefs().edit().putString(GOTOWA, version).apply();

                JSObject result = new JSObject();
                result.put("version", version);
                call.resolve(result);

            }
            catch (Exception error) {
                deleteRecursive(temp);
                call.reject("Nie udało się pobrać aktualizacji: " + error.getMessage());
            }
            finally {
                zip.delete();
            }

        });

    }


    // Pobrane pliki gry - od razu (strona wczytuje się od nowa).

    @PluginMethod
    public void uruchomTeraz(PluginCall call) {

        Context context = getContext();

        String gotowa = prefs().getString(GOTOWA, null);

        File dir = gotowa != null ? gameDir(context, gotowa) : null;

        if (dir == null || !new File(dir, "index.html").isFile()) {
            call.reject("Nie ma pobranej aktualizacji.");
            return;
        }

        context.getSharedPreferences(WebView.WEBVIEW_PREFS_NAME, Context.MODE_PRIVATE)
            .edit().putString(WebView.CAP_SERVER_PATH, dir.getAbsolutePath()).commit();

        // To uruchomienie liczy się jako pierwsza próba.

        prefs().edit().remove(GOTOWA).putString(PROBA, gotowa).putInt(PROBY, 1).commit();

        call.resolve();

        getActivity().runOnUiThread(() -> bridge.setServerBasePath(dir.getAbsolutePath()));

    }


    // Z powrotem do plików gry wbudowanych w aplikację (gdyby
    // aktualizacja coś zepsuła - /aktualizacja wroc).

    @PluginMethod
    public void wroc(PluginCall call) {

        Context context = getContext();

        context.getSharedPreferences(WebView.WEBVIEW_PREFS_NAME, Context.MODE_PRIVATE)
            .edit().putString(WebView.CAP_SERVER_PATH, "").commit();

        String current = prefs().getString(PROBA, null);

        SharedPreferences.Editor editor = prefs().edit().remove(GOTOWA).remove(PROBA).remove(PROBY);

        if (current != null) {
            editor.putString(ZLA, current);
        }

        editor.commit();

        call.resolve();

        getActivity().runOnUiThread(() -> bridge.setServerAssetPath("public"));

    }


    // Pobiera aplikację (.apk) wersji version.

    @PluginMethod
    public void pobierzApk(PluginCall call) {

        String version = call.getString("version", "");
        String file = call.getString("file", "");
        String sha256 = call.getString("sha256", "");
        long size = call.getData().optLong("size", -1L);

        if (!VERSION.matcher(version).matches() || !FILE_NAME.matcher(file).matches() || !file.endsWith(".apk")) {
            call.reject("Zła wersja albo nazwa pliku.");
            return;
        }

        executor.execute(() -> {

            try {

                download(releaseUrl("download/v" + version + "/" + file), new File(downloadDir(getContext()), file), size, sha256, version, "apk");

                prefs().edit().putString(APK, version).apply();

                JSObject result = new JSObject();
                result.put("version", version);
                call.resolve(result);

            }
            catch (Exception error) {
                call.reject("Nie udało się pobrać aplikacji: " + error.getMessage());
            }

        });

    }


    // Instalacja pobranej aplikacji: Android pyta gracza o zgodę.
    // Bez zgody na instalowanie aplikacji z gry - najpierw ustawienia
    // (wynik zgoda: false; potem trzeba stuknąć Zainstaluj jeszcze raz).

    @PluginMethod
    public void zainstalujApk(PluginCall call) {

        Context context = getContext();

        String file = call.getString("file", "");

        File apk = new File(downloadDir(context), file);

        if (!FILE_NAME.matcher(file).matches() || !apk.isFile()) {
            call.reject("Nie ma pobranej aplikacji.");
            return;
        }

        JSObject result = new JSObject();

        if (!canInstall(context)) {

            Intent settings = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + context.getPackageName())
            );

            getActivity().startActivity(settings);

            result.put("zgoda", false);
            call.resolve(result);

            return;

        }

        Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", apk);

        Intent install = new Intent(Intent.ACTION_VIEW);

        install.setDataAndType(uri, "application/vnd.android.package-archive");
        install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

        getActivity().startActivity(install);

        result.put("zgoda", true);
        call.resolve(result);

    }


    // --------------------------------------------------------
    // Pomocnicze
    // --------------------------------------------------------

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }


    private static File gameDir(Context context, String version) {
        return new File(new File(context.getFilesDir(), "gra"), version);
    }


    private static File downloadDir(Context context) {

        File dir = new File(context.getCacheDir(), "aktualizacja");

        dir.mkdirs();

        return dir;

    }


    // Adres w repozytorium z wydaniami (z wbudowanego wersja.json).

    private String releaseUrl(String path) throws IOException {

        JSONObject bundled = bundledInfo(getContext());

        String repo = bundled != null ? bundled.optString("repo", "") : "";

        if (!repo.matches("^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$")) {
            throw new IOException("aplikacja nie zna repozytorium z wydaniami");
        }

        return "https://github.com/" + repo + "/releases/" + path;

    }


    // wersja.json wbudowany w aplikację (tools/android-www.mjs):
    // { version, native, repo }.

    private static JSONObject bundledInfo(Context context) {

        try {
            return new JSONObject(readText(context.getAssets().open("public/wersja.json")));
        }
        catch (Exception error) {
            return null;
        }

    }


    private static String apkVersion(Context context) {

        try {

            PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);

            return info.versionName;

        }
        catch (Exception error) {
            return "";
        }

    }


    // Płatne połączenie (dane komórkowe) - duża aplikacja nie pobiera
    // się sama.

    private static boolean isMetered(Context context) {

        ConnectivityManager manager = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);

        return manager == null || manager.isActiveNetworkMetered();

    }


    private static boolean canInstall(Context context) {

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return true;
        }

        return context.getPackageManager().canRequestPackageInstalls();

    }


    private static HttpURLConnection open(String url) throws IOException {

        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();

        connection.setConnectTimeout(TIMEOUT_MS);
        connection.setReadTimeout(TIMEOUT_MS);
        connection.setInstanceFollowRedirects(true);
        connection.setRequestProperty("User-Agent", "VoxelGame-Android");

        int code = connection.getResponseCode();

        if (code != HttpURLConnection.HTTP_OK) {
            connection.disconnect();
            throw new IOException("HTTP " + code);
        }

        return connection;

    }


    private static String downloadText(String url) throws IOException {

        HttpURLConnection connection = open(url);

        try {
            return readText(connection.getInputStream());
        }
        finally {
            connection.disconnect();
        }

    }


    // Pobiera plik (najpierw jako .part), sprawdza rozmiar i SHA-256;
    // postęp - zdarzenie "postep" { rodzaj, version, percent }.

    private void download(String url, File target, long size, String sha256, String version, String kind) throws Exception {

        File part = new File(target.getAbsolutePath() + ".part");

        HttpURLConnection connection = open(url);

        MessageDigest digest = MessageDigest.getInstance("SHA-256");

        long total = size > 0 ? size : connection.getContentLengthLong();

        long done = 0;

        int lastPercent = -1;

        try (InputStream in = new BufferedInputStream(connection.getInputStream()); OutputStream out = new FileOutputStream(part)) {

            byte[] buffer = new byte[64 * 1024];

            int read;

            while ((read = in.read(buffer)) > 0) {

                out.write(buffer, 0, read);

                digest.update(buffer, 0, read);

                done += read;

                int percent = total > 0 ? (int) Math.min(100, done * 100 / total) : 0;

                if (percent != lastPercent) {

                    lastPercent = percent;

                    JSObject progress = new JSObject();
                    progress.put("rodzaj", kind);
                    progress.put("version", version);
                    progress.put("percent", percent);

                    notifyListeners("postep", progress);

                }

            }

        }
        finally {
            connection.disconnect();
        }

        if (size > 0 && done != size) {
            part.delete();
            throw new IOException("plik ma " + done + " bajtów zamiast " + size);
        }

        if (!sha256.isEmpty() && !hex(digest.digest()).equalsIgnoreCase(sha256)) {
            part.delete();
            throw new IOException("plik jest uszkodzony (inna suma SHA-256)");
        }

        target.delete();

        if (!part.renameTo(target)) {
            throw new IOException("nie da się zapisać pliku");
        }

    }


    // Rozpakowanie (bez wychodzenia poza folder docelowy).

    private static void unzip(File zip, File target) throws IOException {

        String root = target.getCanonicalPath() + File.separator;

        target.mkdirs();

        try (ZipInputStream in = new ZipInputStream(new BufferedInputStream(new FileInputStream(zip)))) {

            byte[] buffer = new byte[64 * 1024];

            ZipEntry entry;

            while ((entry = in.getNextEntry()) != null) {

                File file = new File(target, entry.getName());

                if (!file.getCanonicalPath().startsWith(root)) {
                    throw new IOException("zła ścieżka w paczce: " + entry.getName());
                }

                if (entry.isDirectory()) {
                    file.mkdirs();
                    continue;
                }

                file.getParentFile().mkdirs();

                try (OutputStream out = new FileOutputStream(file)) {

                    int read;

                    while ((read = in.read(buffer)) > 0) {
                        out.write(buffer, 0, read);
                    }

                }

            }

        }

    }


    private static String readText(InputStream stream) throws IOException {

        try (InputStream in = stream; ByteArrayOutputStream out = new ByteArrayOutputStream()) {

            byte[] buffer = new byte[8192];

            int read;

            while ((read = in.read(buffer)) > 0) {
                out.write(buffer, 0, read);
            }

            return new String(out.toByteArray(), StandardCharsets.UTF_8);

        }

    }


    private static String hex(byte[] bytes) {

        StringBuilder text = new StringBuilder();

        for (byte value : bytes) {
            text.append(String.format("%02x", value));
        }

        return text.toString();

    }


    private static void deleteRecursive(File file) {

        if (file == null || !file.exists()) {
            return;
        }

        File[] children = file.listFiles();

        if (children != null) {

            for (File child : children) {
                deleteRecursive(child);
            }

        }

        file.delete();

    }

}

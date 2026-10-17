package pl.kamil.voxelgame;

import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

// ------------------------------------------------------------
// APLIKACJA NA TELEFON (Android)
//
// Gra to ta sama strona co w przeglądarce (index.html, src/...),
// a Capacitor (BridgeActivity) pokazuje ją w okienku przeglądarki
// (WebView) bez paska adresu. Tu jest tylko to, czego strona sama
// nie zrobi:
//   - pełny ekran (bez paska stanu i przycisków nawigacji - wysuwają
//     się na chwilę po przeciągnięciu palcem od krawędzi),
//   - ekran nie gaśnie w trakcie gry,
//   - przycisk "wstecz" trafia do gry (pauza / zamknięcie czatu -
//     main.js, guardBackButton), a na ekranie tytułowym chowa grę,
//   - wyjście z aplikacji = pauza i zapis świata (zdarzenie
//     "apppause" w main.js).
// Opis: docs/telefon.md.
// ------------------------------------------------------------

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {

        super.onCreate(savedInstanceState);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {

            @Override
            public void handleOnBackPressed() {

                WebView webView = bridge != null ? bridge.getWebView() : null;

                // W trakcie gry strona ma zawsze wpis do cofnięcia
                // (main.js dokłada go z powrotem) - cofnięcie = pauza.

                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                    return;
                }

                // Nie ma czego cofać (ekran tytułowy) - zwykłe "wstecz".

                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);

            }

        });

    }


    @Override
    public void onResume() {

        super.onResume();

        hideSystemBars();

    }


    @Override
    public void onWindowFocusChanged(boolean hasFocus) {

        super.onWindowFocusChanged(hasFocus);

        if (hasFocus) {
            hideSystemBars();
        }

    }


    @Override
    public void onPause() {

        // Zanim aplikacja zniknie: pauza i zapis świata (main.js).

        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().evaluateJavascript("window.dispatchEvent(new Event('apppause'))", null);
        }

        super.onPause();

    }


    private void hideSystemBars() {

        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());

        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);

        controller.hide(WindowInsetsCompat.Type.systemBars());

    }

}

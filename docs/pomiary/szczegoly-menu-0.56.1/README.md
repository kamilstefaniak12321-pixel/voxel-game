# Szczegóły menu i zasięg 800 — 0.56.1

Pomiar 2026-11-03 na NVIDIA GeForce RTX 3050 Laptop GPU, zasilacz
(Win32_Battery.BatteryStatus=2), Electron 44.4.5, WebGL2 / ANGLE D3D11.
Okno 1920×1057, domyślna najwyższa jakość grafiki, ruch menu „Płynny”.
Próba korzysta z odrębnego profilu i testowego świata; nie modyfikuje
zapisów ani ustawień zainstalowanej gry.

## Wynik

[`wyniki-menu.json`](wyniki-menu.json) zawiera ostatnie 1800 klatek
każdego kadru po ustabilizowaniu kamery i co najmniej 6 s od gotowości.
Są to czasy klatek aplikacji z aktywnym oknem, nie pomiar GPU timer query.

| Kadr | Średnie FPS | P95 klatki | Średni czas update + render na CPU |
|---|---:|---:|---:|
| Główny | 59,96 | 21,0 ms | 12,91 ms |
| Góry / osiągnięcia | 59,64 | 21,1 ms | 12,05 ms |
| Las / ustawienia | 59,03 | 21,2 ms | 13,90 ms |
| Rzeka / graj | 59,85 | 21,0 ms | 13,19 ms |

Menu ma limit 60 FPS. Średnie są bliskie temu limitowi, ale nie każda
klatka mieściła się w 16,67 ms. W przejazdach P95 wyniosło 26,9 ms,
a najdłuższa pojedyncza klatka 114,1 ms. Pomiar obejmuje nawigację UI;
nie jest gwarancją takiego wyniku na innych urządzeniach lub w rozgrywce.

Gotowość od startu dokumentu: **9,65 s**. Przyciski działają w tym czasie.
Po przygotowaniu wszystkie cztery kadry korzystają z tych samych 1257
chunków, 1101 meshy i 1219 kafli horyzontu; kolejki danych, geometrii
i horyzontu są puste. Pełna geometria ma 5,33 mln trójkątów / 518 MiB
buforów, horyzont 1,85 mln trójkątów. Nie wszystkie są rysowane w kadrze.

Pełny teren sięga 256 bloków z zapasem na ruch kamery. Horyzont pozostaje
uproszczony: krok 1 do 512, 2 do 800 i 4 do 1024. Nie jest to pełna
geometria świata do 1024 bloków. Bezpośrednia próba koła pełnego terenu
384, nawet po poprawie cullingu, dawała około 53–55 FPS i 893 MiB buforów
geometrii — [`proba-384-culling.json`](proba-384-culling.json).
Wcześniejsza próba 256 jest w [`proba-256.json`](proba-256.json);
oba pliki dotyczą konfiguracji porównawczych, a nie finalnego preloadu.

## Sprawdzenie wizualne i cykl życia

- Obejrzano główny kadr, góry, las i rzekę w aplikacji, wraz z powrotami.
- Sceneria jest odsłaniana dopiero po przygotowaniu wszystkich zasobów;
  podczas zmiany zakładek nie pojawiają się kolejne pasy chunków.
- W ustawieniach suwak pokazał **800 bloków**, następnie przywrócono 48.
  Zapis i ponowny odczyt wartości 800 sprawdza test `sprawdz_sceny.mjs`.
- Uruchomiono testowy świat i wrócono do menu. Scena menu była zwolniona
  przed `Game.start`; jej zasoby nie współistniały ze światem gry.
- Raporty nie zawierają błędów JavaScript. Testy jednostkowe obejmują
  również brak renderu przed gotowością, zmianę wariantu shadera, większy
  obszar po wyłączeniu potato i przywracanie uniformów gry.

Limit 800 w ustawieniach dotyczy pełnych chunków rozgrywki i pozostaje
wyborem użytkownika. Domyślne 48/32 (PC/telefon) nie zostały zwiększone.
Pomiar menu nie potwierdza 60 FPS w świecie ustawionym na 800 bloków.

## Powtórzenie

Lokalne sprawdzenia: pełne `npm test` zakończone kodem 0 (199 kontroli
menu, 293 scen i ustawień) oraz `tools/sprawdz_swiatlo_webgl.mjs` — PASS,
44 warianty shaderów. Test WebGL w bezokienkowym Chrome / SwiftShader
sprawdza obraz materiałów, zachowanie atmosfery i powrót ustawień gry;
nie jest źródłem powyższych wyników wydajności.

Uruchom `native-launcher.cjs` binarnym Electronem 44.4.5. Launcher
korzysta z rzeczywistego protokołu plików gry, w tym strumieniowania MP3;
`qa.js` jedynie narzuca odrębne ustawienia testowe, dodaje pomiar i zapis
raportu przez ograniczony most IPC. Nawigacja odbywa się normalnymi
przyciskami. Raport jest zapisywany obok checkoutu, w katalogu
`voxel-menu-detail-proof/native.json`. Ctrl+R odświeża próbę,
Ctrl+Shift+Q zamyka jej okno.

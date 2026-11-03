# Próba żywego menu — 0.56.0

Test wykonano 3 listopada 2026 r. w natywnym Electronie 44.4.5, na NVIDIA GeForce RTX 3050 Laptop GPU (ANGLE / D3D11), przy podłączonym zasilaniu. Okno 1920 × 1057, oryginalne tekstury, najwyższa domyślna jakość grafiki, pełny teren 48, horyzont 1024, ruch menu Płynny. Menu ogranicza renderowanie do 60 FPS. Równolegle była otwarta zainstalowana gra; nie zamykano jej w tym teście.

## Wynik

Końcowe próbki i konfiguracja sceny: [native-final.json](native-final.json).
Każdy kadr zbierano po co najmniej 4 sekundach na uspokojenie przejazdu; raport zachowuje ostatnie 1800 klatek danego kadru (około 30 s).
Czas CPU obejmuje update/render sceny po stronie JavaScript, nie jest pomiarem GPU.

W ustalonych kadrach uzyskano około 60 FPS. P95 odstępu klatek wynosi około 22 ms; na ekranie o odświeżaniu innym niż limit 60 FPS odstępy nie są równe 16,7 ms. Pierwsze przejścia miały pojedyncze dłuższe klatki (najdłuższa około 96 ms w tej sesji). To pomiar na tym komputerze, nie gwarancja minimum 60 FPS na każdej klatce ani wynik telefonu.

Sprawdzono ręcznie w aplikacji:

- główny widok doliny, wejście nad rzekę, do lasku i widok gór;
- łagodne przejazdy i powroty, także przekierowanie podczas ruchu;
- start izolowanego świata, zwykłe menu pauzy, zapis i powrót do odtworzonej sceny;
- ustawienie Ruch menu: Płynny → Wył., brak dryfu i natychmiastowy wybór kadru;
- menu dostępne w trakcie przygotowywania sceny, brak błędów JavaScript/shaderów.

`native-lifecycle.json` oraz `native-motion-off.json` dokumentują wcześniejsze iteracje kadrów i sprawdzenie cyklu życia / wyłączenia ruchu. Nie służą do porównywania końcowej kompozycji.

## Testy automatyczne

- Pełne `npm test`: sukces, w tym 138 sprawdzeń kamery i sceny menu.
- [kolizje-kamer.json](kolizje-kamer.json): 4 pozycje, 6 tras oraz 1292 zmiany zakładek podczas animacji, zero wykrytych kolizji przy promieniu 0,5 bloku i dryfie ±0,18. Próba używa prawdziwych wygenerowanych chunków.
- Sprawdzenia awarii: częściowo utworzona scena, anulowany start, spóźniona kompilacja wody, błąd renderowania, zwolnienie zasobów i przywrócenie framebufferu.
- Tryby System / Płynny / Wył. dla obu preferencji systemowych, zmiana trybu w trakcie ruchu i zapamiętywanie ustawienia.

## Powtórzenie

Z katalogu repozytorium:

```sh
npm test
node docs/pomiary/zywe-menu-0.56.0/sprawdz-kolizje.mjs
npx electron docs/pomiary/zywe-menu-0.56.0/native-launcher.cjs
```

Launcher zapisuje raport i osobny profil w sąsiednim katalogu `voxel-living-menu-proof`. Nie czyta profilu zainstalowanej gry. `qa.js` ustawia wyłącznie ustawienia próby, tworzy płaski świat testowy i mierzy rzeczywiste wywołania kontrolera; nawigacja jest wykonywana przyciskami gry. Ctrl+R odświeża próbę, Ctrl+Shift+Q ją zamyka. Pliki JS/CSS są w próbie podawane bez pamięci podręcznej, a multimedia korzystają z tego samego handlera plików co aplikacja.

Pakiety Windows i Android zawierają kod i CSS sceny, ale nie ten launcher ani dane próby. Stan prób kompilacji jest widoczny w PR #89; publikacja następuje dopiero po scaleniu.

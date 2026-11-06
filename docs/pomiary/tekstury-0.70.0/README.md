# Tekstury 0.70.0 — sprawdzenie wyglądu i działania

Sprawdzono autorski atlas Kamila w rzeczywistych `Game`, `InventoryScreen`
i modelu przedmiotu w ręce. Próba uruchamia odizolowany świat deweloperski
w Chrome/SwiftShader, przy 1280 × 800. Nie czyta zapisów użytkownika.
To kontrola wyglądu i poprawności, nie pomiar FPS na RTX 3050.

Kadry z gry:

- [Deski sześciu gatunków, ciemne deski oraz słoje pni](wood.png).
- [Trzy nakładki kory na tym samym pomarańczowym bloku sosny](pine.png).
- [Trzy warianty mchu dywanowego](moss.png).
- [18 narzędzi i wybrany przez Kamila ciągły patyk w ekwipunku](tools.png).
- [Granitowa siekiera w ręce](tools-hand.png).

Obejrzano wszystkie kadry. Deski zachowują układ łączeń także na większej
ścianie i podłodze; odcienie rozróżniają gatunki. Kora przechodzi od brązu
do pomarańczu przez trzy etapy bez przezroczystych dziur. Mech miesza trzy
autorskie wzory. Materiały głowic narzędzi różnią się, a ich trzonki,
wiązania i sylwetki pozostają zgodne z atlasem.

Przeszło pełne `npm test`, w tym 3201 kontroli narzędzi i craftingu oraz
422 kontrole powierzchni. Generator przyszłych desek przeszedł 28 kontroli
wzorca, palety i ochrony obecnych PNG. Test przeglądarkowy potwierdził
433 warunki: dokładne składanie nakładek, niezmienione piksele patyka,
przezroczystość mchu, trzonki i głowice narzędzi, warianty atlasu 32 px,
zachowanie jawnych nadpisań paczki, rzeczywisty ekwipunek i rękę.
Nie wykryto błędów gry, shaderów ani WebGL.

Odtworzenie próby:

```sh
npm test
python tools/sprawdz_styl_desek.py
node tools/sprawdz_tekstury_drewna_webgl.mjs
```

Pełny raport i eksport 320 pojedynczych kafelków trafiają do
`test-results/wood-textures/`. Skopiowane kadry są oryginalnymi zrzutami
tej próby. Wzorce i pochodzenie tekstur opisuje
[styl-tekstur.md](../../styl-tekstur.md).

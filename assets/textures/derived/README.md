# Tekstury pochodne atlasu

Te 23 kafelki to kopie pikseli przygotowanych przez grę: trzy złożenia
autorskich nakładek kory sosny oraz pięć materiałów kamiennych dla każdego
z czterech narzędzi (siekiera, kilof, łopata i - od 0.100.0 - nóż). Wiki i szablon paczki tekstur używają tych samych
obrazków co gra. Runtime składa je podczas wczytywania atlasu, również
z tekstur użytkownika; nie dokłada geometrii ani pracy w każdej klatce.

Po zmianie wzorców lub sposobu składania odśwież kopie:

```sh
node tools/sprawdz_tekstury_drewna_webgl.mjs
node tools/synchronizuj_pochodne_tekstury.mjs
python tools/paczka_tekstur.py
python tools/wiki.py
```

Reguły stylu i pochodzenie: [docs/styl-tekstur.md](../../../docs/styl-tekstur.md).

Same warianty noża można też odświeżyć bez przeglądarki:
`node tools/tekstury_noza_skaly.mjs` (ta sama funkcja barwienia co w grze).

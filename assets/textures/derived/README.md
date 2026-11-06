# Tekstury pochodne atlasu

Te 18 kafelków to kopie pikseli przygotowanych przez grę: trzy złożenia
autorskich nakładek kory sosny oraz pięć materiałów kamiennych dla każdego
z trzech narzędzi. Wiki i szablon paczki tekstur używają tych samych
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

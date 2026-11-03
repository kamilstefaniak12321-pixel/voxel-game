# Izolowana kontrola menu i wyjścia HDR

Z katalogu repozytorium, na Windowsie:

```powershell
& .\node_modules\electron\dist\electron.exe .\docs\pomiary\swiatlo-0.57.0\native-launcher.cjs --menu --size=1920x1080
```

Ekran musi mieć 1920×1080; na mniejszym użyj `--size=1600x900`.
Launcher tworzy **nowy profil Chromium dla każdej próby**, w sąsiednim
`lighting-update-proof/native/profile-menu-…`. Nie uruchamia głównej
aplikacji, nie otwiera bazy światów, a ustawienia pozostają w pamięci.
Korzysta z prawdziwego `MenuBackdrop`, `MenuWorld`, `MenuCamera`,
aktualnych tekstur i generatora. To próba scenerii; przyciski są panelem
kontrolnym, nie pełnym interfejsem menu.

Przyciski kamer uruchamiają zwykłe przejazdy. „Obie palety × cztery
kamery” automatycznie odwiedza główny kadr, rzekę, las i góry, z powrotem
do głównego kadru po każdej zakładce, kolejno w Naturalnej i Poprzedniej.
Czeka na przygotowanie terenu i co najmniej 6 s uspokojenia kamery.
Zapisuje osiem czystych PNG z raportami i końcowy raport całej serii.
„Odtwórz menu” zwalnia i tworzy ponownie scenerię w tym samym rendererze.

Raporty trafiają do `lighting-update-proof/native/menu-…-*.json/png`.
Obejmują błędy JS/shaderów, gotowość, pamięć renderera, konfigurację HDR,
przywracanie celu renderowania i przejazdy. Czasy klatek dotyczą
aplikacji/CPU, **nie są pomiarem GPU**. Automatyczne zdjęcia wymagają
osobnej oceny wyglądu; brak błędów w raporcie jej nie zastępuje.
Pętla zachowuje limit docelowy 60 FPS i resztę czasu między terminami
klatek, jak główne menu. Raport liczy wynik z rzeczywistych odstępów
między narysowanymi callbackami, nie z wartości limitu; nie mierzy chwili
fizycznej prezentacji obrazu na monitorze.

F8 ukrywa/przywraca panel, Ctrl+R odświeża, Ctrl+Shift+Q zamyka próbę.
Opcji `--menu` nie łącz z `--baseline`: obie palety tej próby pochodzą
z obecnego checkoutu i są przełączane w panelu.

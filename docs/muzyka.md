# Muzyka w menu i świecie

Muzyka pojawia się od czasu do czasu w menu głównym i podczas gry.
Między utworami zostaje cisza, dzięki której nadal słychać otoczenie.
Przejście z menu do świata lub powrót do menu nie przerywa bieżącego
utworu ani nie zaczyna go od początku.

## Pierwsze pięć utworów

| Tytuł | Plik w `assets/music/` |
|---|---|
| Świat czeka | `swiat-czeka.mp3` |
| First Light Meadow | `first-light-meadow.mp3` |
| Pierwszy dom | `pierwszy-dom.mp3` |
| Za następnym wzgórzem | `za-nastepnym-wzgorzem.mp3` |
| Ostatnie światło | `ostatnie-swiatlo.mp3` |

Każdy utwór trwa około trzech minut. Oryginalne MP3 zajmują razem
21 688 995 bajtów, czyli około **20,68 MiB**. Nie były ponownie kodowane.
[Opis plików, pochodzenie i sumy kontrolne](../assets/music/README.md)
znajdują się przy nagraniach.

## Kiedy gra muzyka

- Dźwięk odblokowuje pierwszy gest gracza, np. kliknięcie lub naciśnięcie
  klawisza. Gra respektuje ograniczenia automatycznego odtwarzania
  przeglądarki; jeśli odtwarzanie zostało zablokowane, czeka na kolejny gest.
- Kolejność jest losowana. Każdy dostępny utwór zagra raz przed ponownym
  losowaniem całej listy. Gdy dostępny jest więcej niż jeden utwór, ostatni
  z poprzedniej kolejki nie będzie pierwszym następnej.
- Po zakończeniu utworu przerwa trwa **45–90 sekund w menu** albo
  **150–300 sekund w świecie**. Przedział wybierany jest według stanu
  gry w momencie zakończenia nagrania.
- Początek i wznowienie łagodnie narastają przez **5 sekund**. Ostatnie
  **6 sekund** utworu stopniowo cichnie. Utwory nie nakładają się na siebie.
- W menu pauzy muzyka gra dalej, z poziomem obniżonym do **45%**
  bieżącej głośności. Po powrocie do gry odzyskuje normalny poziom.

## Głośność i przejście do tła

W ustawieniach dźwięku suwak **Muzyka** (`volumeMusic`) domyślnie ma
wartość **60** w skali 0–100. Działa niezależnie od suwaków efektów,
otoczenia i interfejsu, a głośność całej gry (`volumeMaster`) reguluje
również muzykę.

Ustawienie muzyki lub głośności całej gry na 0 wstrzymuje odtwarzanie,
zachowując miejsce w utworze. Tak samo dzieje się po utracie aktywności
okna lub przejściu aplikacji do tła. Przerwy między utworami również
nie są wtedy odliczane. Po powrocie lub przywróceniu głośności muzyka
jest wznawiana od zachowanego miejsca, z łagodnym narastaniem.

## Sposób odtwarzania

`src/audio/MusicManager.js` korzysta z jednego `HTMLAudioElement`
połączonego przez Web Audio ze wspólną regulacją głośności gry.
Odtwarzany i buforowany jest tylko bieżący strumień MP3; cała kolekcja
nie jest dekodowana do obiektów `AudioBuffer` ani wczytywana z góry
razem z krótkimi efektami dźwiękowymi.

Lista utworów jest w `src/audio/musicTracks.js`. Nagrania są dołączone
do gry, więc odtwarzanie nie korzysta z zewnętrznego serwisu muzycznego.

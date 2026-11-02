# Pierwsza muzyka Voxel Game

Pliki dostarczone przez Kamila do włączenia do gry 2026-11-02.
Nazwy plików uproszczono na potrzeby ścieżek w grze; zawartość MP3 jest
identyczna z przekazanymi oryginałami. Lista odtwarzania znajduje się
w `src/audio/musicTracks.js`.

| Utwór | Plik | Rozmiar |
|---|---|---:|
| Świat czeka | `swiat-czeka.mp3` | 4 337 799 B |
| First Light Meadow | `first-light-meadow.mp3` | 4 337 799 B |
| Pierwszy dom | `pierwszy-dom.mp3` | 4 337 799 B |
| Za następnym wzgórzem | `za-nastepnym-wzgorzem.mp3` | 4 337 799 B |
| Ostatnie światło | `ostatnie-swiatlo.mp3` | 4 337 799 B |

Łącznie: 21 688 995 B, około 20,68 MiB.

## Parametry plików

Pełny odczyt nagłówków ramek każdego pliku potwierdził:

- MPEG-1 Layer III, 192 kbit/s (CBR), 44 100 Hz, stereo;
- 6892 kompletne ramki, po 1152 próbek, bez przerw w synchronizacji
  ani uciętej ostatniej ramki;
- czas wynikający z ramek: 180,035918 s (około 3 minuty); odtwarzacz
  może skorygować długość o opóźnienie kodera;
- nagłówek ID3v2.4 o rozmiarze 16 937 B razem z nagłówkiem głównym.

Jednakowe rozmiary wynikają z tego samego czasu i parametrów kodowania.
Wszystkie pięć plików ma różne sumy SHA-256 zarówno całego pliku, jak
i samego strumienia audio po pominięciu ID3. Szczegóły i sumy kontrolne:
[`metadata.json`](metadata.json).

## Pochodzenie

Zachowane metadane C2PA wskazują `Eleven Labs Inc.` oraz źródło
`trainedAlgorithmicMedia`. Jest to odczyt informacji zapisanej w plikach,
bez weryfikacji podpisów C2PA. Sama ta informacja nie określa licencji
utworów ani warunków planu użytego do ich wygenerowania.

Informacje o zasadach udostępniania projektu: [`docs/licencja.md`](../../docs/licencja.md).

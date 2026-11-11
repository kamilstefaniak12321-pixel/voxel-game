# Licencja gry

Voxel Game - kod, tekstury, modele, dźwięki, paczki roślin i drzew,
dokumentacja - jest udostępniona na licencji **PolyForm Noncommercial
License 1.0.0**. Wiążący jest oficjalny tekst po angielsku w
[`LICENSE.md`](../LICENSE.md) (bez zmian, z
<https://polyformproject.org/licenses/noncommercial/1.0.0>) razem z linią
`Required Notice:` na jego początku. Ta strona to tylko streszczenie po
polsku - przy wątpliwościach liczy się `LICENSE.md`.

## W skrócie

**Wolno, bez pytania autora** - w celach niekomercyjnych (prywatnie, dla
zabawy, do nauki, hobbystycznie, w szkole, w organizacji non-profit):

- grać, oglądać i czytać kod, uczyć się z niego,
- zmieniać grę i robić na jej podstawie nowe rzeczy - mody, paczki
  tekstur (`paczka-tekstur-szablon/`), paczki roślin i drzew,
- udostępniać grę i swoje zmiany innym, **za darmo** - pod warunkiem, że
  każdy, kto dostaje kopię (całości albo części), dostaje też tekst
  licencji albo link do niej i linię `Required Notice:` z `LICENSE.md`
  (informacja o autorze).

**Nie wolno bez osobnej zgody autora:**

- sprzedawać gry ani jej części, ani zarabiać na nich w inny sposób
  (np. płatna wersja, sprzedaż paczek tekstur zrobionych z tekstur gry,
  użycie kodu w komercyjnym produkcie),
- przekazywać licencji dalej (każdy dostaje ją bezpośrednio od autora).

Gra jest udostępniona **"tak jak jest"** - bez gwarancji, autor nie
odpowiada za szkody (część *No Liability*).

Autor (Kamil) może w każdej chwili dać komuś inną licencję albo zgodę
na coś więcej - np. na wydanie komercyjne.

## Części na innych licencjach

Te pliki nie są objęte PolyForm - zostają na licencjach swoich autorów
(teksty licencji leżą obok nich):

| pliki | co to | licencja |
|---|---|---|
| `lib/three/` | three.js - silnik grafiki 3D | MIT (`lib/three/LICENSE`) |
| `lib/peerjs/` | PeerJS 1.5.5 - połączenie z innymi graczami (gra ze znajomymi, WebRTC) | MIT (`lib/peerjs/LICENSE`) |
| `assets/fonts/pixelify-sans/` | czcionka Pixelify Sans | SIL Open Font License 1.1 (`OFL.txt`) |
| `assets/models/torch/` | tekstury i źródłowe modele pochodni z Reactive Torch, Copyright (c) 2026 ktulman8; przekazane przez Kamila | MIT (`assets/models/torch/LICENSE`) |
| `android/gradlew`, `android/gradlew.bat`, `android/gradle/wrapper/` | Gradle Wrapper (budowanie aplikacji na Androida) | Apache License 2.0 |
| zależności z `package.json` (Electron, Capacitor, electron-builder...) | pobierane przez `npm`, nie leżą w repozytorium | każda swoja (w `node_modules/`) |

`android/app/klucz-testowy.keystore` to **celowo publiczny** klucz do
wersji testowej "Voxel Game (test)" (hasło `android`, `docs/telefon.md`).
Prawdziwy klucz wydań jest tylko w sekretach GitHuba i u autora - nigdy
w repozytorium.

## Tekstury nowych drzew

Paczki `acacia.zip`, `bald_cypress.zip` i `cherry.zip` zostały przekazane
przez Kamila 9 listopada 2026 r. do dodania do gry. Oryginalne tekstury
przeniesiono do `assets/textures/drzewa.png`. Historyczne pliki
`source.json` w `docs/zrodla/drzewa-0.79/` dokumentują archiwa i ich
sumy kontrolne; testy migracji sprawdzają zgodność pikseli regionów. Materiał nie zawierał
osobnego dokumentu licencyjnego; zapis dokumentuje przekazanie przez
autora gry, bez przypisywania dodatkowej licencji źródłom botanicznym.
Geometrię oraz brakujące tekstury sadzonek, okorowanego drewna i opału
przygotowano w repozytorium. Strony botaniczne służą jedynie jako
odniesienie wymiarów — nie pobierano z nich grafiki.

Paczki `maple_autumn.zip`, `mugo.zip`, `olive.zip`,
`rainbow_eucalyptus.zip` i `sequoia.zip` Kamil przekazał 10 listopada
2026 r. (0.83.0). Oryginalne tekstury (pień, słoje, deski, liście,
odmiana liści) są w `assets/textures/drzewa.png` piksel w piksel - sumy
kontrolne sprawdza `tools/sprawdz_drzewa_083.mjs`. Sylwetki i wymiary
z `render_info.json` paczek i podglądów; okorowane drewno, sadzonki,
opał, oliwki, szyszki i opadłe liście klonu rysuje
`tools/tekstury_drzew_083.py`.

Paczki `ginkgo.zip` i `jacaranda.zip` Kamil przekazał do włączenia do gry
(0.85.0, potwierdzenie 11 listopada 2026 r.). Pięć oryginalnych kafelków
każdego drzewa zachowuje swoje piksele w `assets/textures/drzewa.png`.
Archiwa zawierały tekstury, podgląd i wymiary, bez siatki modelu ani
osobnego dokumentu licencyjnego. Sumy kontrolne i metadane zapisano
w `docs/zrodla/drzewa-0.85/`. Proceduralne sylwetki, sadzonki, okorowane
drewno i opał przygotowano w repozytorium; źródła botaniczne posłużyły
wyłącznie do porównania skali, bez kopiowania ich ilustracji.

## Źródło muzyki


Poniższe pięć plików zostało dostarczonych przez Kamila 2 listopada
2026 r. do włączenia do gry. Zachowano oryginalną zawartość MP3,
zmieniając tylko nazwy plików.

| Plik w `assets/music/` | Tytuł |
|---|---|
| `swiat-czeka.mp3` | Świat czeka |
| `first-light-meadow.mp3` | First Light Meadow |
| `pierwszy-dom.mp3` | Pierwszy dom |
| `za-nastepnym-wzgorzem.mp3` | Za następnym wzgórzem |
| `ostatnie-swiatlo.mp3` | Ostatnie światło |

Metadane C2PA zawarte w plikach wskazują `Eleven Labs Inc.` oraz
`trainedAlgorithmicMedia`. Odczyt tych metadanych nie jest weryfikacją
podpisów C2PA ani dowodem licencji utworów lub warunków planu, w którym
powstały. Ten zapis dokumentuje przekazane pliki i ich źródło; nie
przypisuje autorstwa ani dodatkowej licencji na podstawie metadanych.
[Opis nagrań i sumy kontrolne](../assets/music/README.md) znajdują się
w katalogu muzyki.

## Źródło efektów dźwiękowych

Wszystkie 159 plików dźwięków w `assets/sounds/` (kroki, bloki,
zbieranie owoców, woda, meteoryt, kosmos, menu, ekwipunek,
osiągnięcia) Kamil wygenerował w ElevenLabs Sound Effects
(elevenlabs.io) z listy opisów przygotowanej do gry i dostarczył
2 listopada 2026 r. (od wersji 0.54.0 zastępują dawne dźwięki
syntetyczne z `tools/dzwieki.py`). Pliki zostały obrobione skryptem
`tools/nagrania.py`: zamiana na mono 44,1 kHz `.ogg`, przycięcie ciszy
i długości, wyrównanie głośności, pętle połączone przenikaniem. Lista
plików i z którego nagrania powstał każdy z nich:
`assets/sounds/nagrania.json`.

Pliki źródłowe nie zawierały metadanych o pochodzeniu (C2PA). Warunki
użycia efektów zależą od planu ElevenLabs, w którym powstały (plan
darmowy - tylko użytek niekomercyjny i podpis "elevenlabs.io"; plany
płatne - także komercyjny). Ten zapis dokumentuje przekazane pliki
i ich źródło: **Efekty dźwiękowe: ElevenLabs (elevenlabs.io).**

## Tekstury motywu Szare drewno

Tekstury `assets/ui/themes/grey-wood/` powstały na potrzeby gry z kodu
`tools/szare_drewno.py`, w oparciu o koncepcję szarego, surowego drewna
uzgodnioną z Kamilem. Do gry nie dołączono cudzej ilustracji referencyjnej
ani wyciętych z niej elementów. Te tekstury i ich generator podlegają
licencji projektu opisanej wyżej.

## Dodawanie cudzych plików

Nowy plik od kogoś innego (dźwięk, tekstura, biblioteka) może trafić do
gry tylko na licencji, która na to pozwala (np. CC0, MIT, OFL, CC BY -
z podpisem autora). Licencję i źródło trzeba dopisać do tabeli wyżej,
a tekst licencji (jeśli jest) położyć obok pliku.

> To streszczenie licencji wybranej przez autora, nie porada prawna.
> Przy planach komercyjnych warto sprawdzić szczegóły u prawnika od
> prawa autorskiego.

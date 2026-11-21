# Drewno, ogień i ścinanie drzew - projekt

> **Stan: projekt uzgodniony z Kamilem 21.11.2026 (odpowiedzi w rozdziale
> 12).** Zarys jest Kamila; tu jest ułożony tak, żeby pasował do tego,
> co gra już ma (ognisko, kora, nóż, pory roku, pogoda, zimno, glina,
> meteoryty). Moje dodatki są oznaczone *(dodatek)*. Wszystkie liczby to
> punkt wyjścia do strojenia w grze.
>
> **W grze:** od **1.32.0** cechy gatunków (rozdział 1) i ognisko
> z temperaturą (rozdział 2, bez deszczu i pochodni); od **1.33.0**
> wilgotność polan i schnięcie; od **1.34.0** drewutnia (stos polan);
> od **1.35.0** wypalające się pochodnie, łuczywo i deszcz gaszący
> ognisko - **część A jest w grze cała**. Opis tego, co działa:
> [ogniska.md](ogniska.md). Reszta czeka - kolejność w rozdziale 11.

## W skrócie

1. **Każde drewno ma charakter**: twardość, wilgotność, temperaturę
   zapłonu, żar (najwyższą temperaturę) i czas palenia. Od tego zależy
   ognisko, narzędzia i pożar.
2. **Ognisko ma temperaturę.** Rozpala się je stopniowo: podpałka →
   łatwe drewno → twarde drewno. Mokrym drewnem się nie rozpali.
3. **Drzewo jest jednym bytem.** Kołysze się na wietrze, ścina się je
   ciosami siekiery i **pada w całości**. Leżący pień tnie się na
   kozłach.
4. **Narzędzia mają twardość** i widać na nich zużycie. Skała, z której
   jest siekiera, zaczyna mieć znaczenie. Na końcu jest **metal
   meteorytowy**, który na drewnie się nie zużywa.
5. **Pień daje coś od siebie**: sok, żywicę, gumę, łyko - nacinany nożem.
6. **Drzewa mogą płonąć**: małe spalają się na popiół, średnie zostają
   zwęglonym kikutem, stare z grubą korą przeżywają.

---

## 1. Charakter drewna

Pięć cech każdego gatunku (dla suchego drewna):

| Cecha | Co znaczy w grze |
|---|---|
| **Twardość** (1-10) | ile ciosów trzeba, jak szybko tępi się narzędzie, czy narzędzie w ogóle je ruszy |
| **Zapłon** (°C) | jak gorący musi być ogień, żeby polano się zajęło |
| **Żar** (°C) | najwyższa temperatura, jaką to drewno daje - ciepło przy ognisku, szybkość gotowania, a później wypalanie gliny i wytop metalu |
| **Polano** (s) | jak długo pali się jedno polano (dziś każde 80 s) |
| **Świeże** | ile wody ma drewno prosto z drzewa i jak długo schnie |

### Tabela gatunków

Liczby wzięte z prawdziwych cech drewna (twardość, gęstość, żywica)
i zaokrąglone pod grę.

**Iglaste** - łatwo się zapalają, palą krótko, strzelają iskrami.

| Drzewo | Twardość | Świeże | Zapłon | Żar | Polano | Co wyróżnia |
|---|---|---|---|---|---|---|
| Świerk | 2 | średnie | 240° | 700° | 55 s | iskry; drewno na początek gry |
| Sosna | 3 | średnie | 220° | 740° | 60 s | żywica (już jest), kopci; łuczywo |
| Jodła | 2 | średnie | 250° | 680° | 50 s | żywica z pęcherzy kory |
| Modrzew | 4 | średnie | 250° | 780° | 85 s | najmocniej strzela iskrami; gruba kora |
| Kosodrzewina | 3 | średnie | 215° | 720° | 50 s | krzew - nie pada, rąbie się na gałęzie |
| Sosna oścista | 5 | suche | 230° | 800° | 100 s | martwe drewno suche od razu |
| Cedr | 4 | średnie | 245° | 760° | 80 s | pachnący dym |
| Araukaria | 3 | średnie | 250° | 720° | 70 s | gruba kora chroni przed ogniem |
| Sekwoja | 2 | mokre | 330° | 640° | 60 s | kora ogniotrwała; pień 3-4 bloki |
| Cypryśnik | 3 | bardzo mokre | 280° | 700° | 70 s | rośnie w wodzie |
| Miłorząb | 3 | mokre | 300° | 680° | 65 s | opiera się ogniowi |

**Liściaste** - trudniej je rozpalić, ale grzeją mocno i długo.

| Drzewo | Twardość | Świeże | Zapłon | Żar | Polano | Co wyróżnia |
|---|---|---|---|---|---|---|
| Buk | 7 | mokre | 300° | 900° | 135 s | równy żar, mało dymu |
| Dąb | 7 | mokre, schnie najdłużej | 320° | 920° | 150 s | żar trzyma do rana |
| Brzoza | 5 | bardzo mokre (sok) | 270° | 860° | 100 s | jasny płomień bez iskier; kora-podpałka |
| Lipa | 2 | mokre | 260° | 650° | 50 s | łyko na sznur; najlepszy starter ognia |
| Olcha | 3 | bardzo mokre | 275° | 720° | 65 s | dużo dymu |
| Wierzba | 2 | bardzo mokre | 280° | 620° | 45 s | słabe ciepło |
| Osika | 2 | mokre | 270° | 640° | 45 s | pali się czysto, prawie bez dymu |
| Jabłoń | 7 | średnie | 300° | 880° | 130 s | pachnący dym |
| Wiśnia | 5 | średnie | 290° | 840° | 110 s | guma wiśniowa |
| Klon | 7 | mokre (sok) | 300° | 890° | 130 s | sok klonowy |

**Ciepłych krajów**

| Drzewo | Twardość | Świeże | Zapłon | Żar | Polano | Co wyróżnia |
|---|---|---|---|---|---|---|
| Akacja | 8 | suche | 310° | 950° | 150 s | gorący, długi żar |
| Oliwka | 9 | suche | 290° | 960° | 165 s | najtwardsza; pali się nawet świeża |
| Eukaliptus | 4 | średnie | 225° | 880° | 80 s | olejki - płonie gwałtownie |
| Jakaranda | 3 | średnie | 280° | 700° | 65 s | - |
| Baobab | 1 | nasiąknięty wodą | 380° | 520° | 40 s | prawie się nie pali; pień 5-7 bloków |
| Palma kokosowa | 5 | mokre | 300° | 720° | 90 s | włókna tępią narzędzia |
| Namorzyn | 8 | bardzo mokre | 320° | 940° | 155 s | najlepszy na węgiel drzewny |
| Puchowiec | 1 | średnie | 250° | 600° | 35 s | lekki jak korek |
| Jukka | 1 | suche | 240° | 600° | 35 s | włókniste, pali się chwilę |
| Figowiec (banian) | 3 | mokre | 290° | 700° | 65 s | stoi na wielu pniach |
| Dracena | 2 | mokre | 300° | 640° | 55 s | czerwona żywica |

### Wilgotność

- **Świeżo ścięte drewno jest mokre** - tym bardziej, im więcej soku ma
  gatunek. Brzoza, olcha, wierzba i namorzyn są bardzo mokre; sosna
  oścista, akacja, oliwka i jukka prawie suche.
- **Żywica nie przeszkadza w paleniu, tylko pomaga**: sosna jest
  wilgotna, ale ma niski zapłon, więc zajmuje się mimo to. Brzoza ma
  sok (wodę), więc świeża pali się słabo - ale jej **kora** zapala się
  nawet mokra.
- Mokre drewno: zapłon wyższy (w grze do +100° - przy +120° świeżego
  dębu nie dałoby się rozpalić zwykłą korą i patykami), żar niższy (do
  30%), syczy i mocno dymi.
- *(w grze od 1.33.0)* Wilgotność mają **polana**, nie pnie: drewno
  schnie dopiero porąbane, a polano prosto spod siekiery jest świeże.
- **Schnie** na stosie: pod dachem albo w słoneczne dni; przy ognisku
  szybciej. Deszcz moczy drewno leżące pod gołym niebem.
- Wilgotność stosu działa jak świeżość jedzenia (1.29.0): **niebieski
  pasek** na ikonce, opis po najechaniu, stosy o różnej wilgotności się
  uśredniają.
- *(dodatek, w grze od 1.34.0)* **Drewutnia**: polana ułożone w stos
  (kucnięcie i polano w ziemię, 16 polan na blok) - schną i nie zajmują
  ekwipunku; pod dachem nie mokną.

---

## 2. Ognisko z temperaturą

Dziś każde polano pali się 80 s i grzeje tak samo. Po zmianie:

- **Ogień ma temperaturę.** Podpałka daje temperaturę na start:

  | Podpałka | Temperatura | Uwagi |
  |---|---|---|
  | trawa, słoma | 260° | krótko |
  | kora | 280° | |
  | kora żywiczna (sosna, świerk, kosodrzewina, eukaliptus) | 300° | |
  | kora brzozowa | 330° | zapala się nawet mokra |
  | huba | 280° | tli się trzy razy dłużej |
  | łuczywo *(dodatek)* | 350° | szczapa z żywicznego drewna |

- **Polano zajmuje się, gdy ogień jest gorętszy niż jego zapłon.**
  Najpierw łapią łatwe (świerk, sosna, lipa), podnoszą temperaturę
  i wtedy zajmuje się dąb czy buk. Samego dębu trawą się nie rozpali.
- *(dodatek, w grze od 1.32.0)* **Rozpałka z patyków**: patyk dołożony
  do ułożonego stosu podnosi temperaturę podpałki o 60° (najwyżej dwa).
  Dzięki temu nikt nie utknie z samym twardym drewnem - samouczek uczy
  rozpalać tym, co rośnie obok. Podpałka → rozpałka → opał.
- **Temperatura ogniska** = żar palących się polan. Od niej zależy:
  - **ciepło** przy ognisku (dziś zawsze +22°): lipa ok. +14°, sosna
    +18°, brzoza +22°, dąb +25°, oliwka +26°,
  - **szybkość gotowania** w garnku,
  - później: **wypalanie gliny** (od 800°) i **wytop metalu** (od 1200° -
    tylko węgiel drzewny w dymarce).
- **Czas**: polano pali się od 35 s (puchowiec) do 165 s (oliwka).
- **Żar po ognisku** (do 1.31.0 zawsze 90 s): po twardym drewnie trzyma
  kilka minut, po miękkim kilkadziesiąt sekund. Na żar łatwo dołożyć
  i rozpalić od nowa - w grze polano na gorącym żarze zajmuje się samo,
  a nad żarem da się piec.
- **Dym i iskry**: mokre drewno - gęsty biały dym; żywiczne - ciemny dym
  i iskry; osika i buk - prawie bez dymu.
- **Zima i lato**: zimą dąb, buk, akacja - gorąco i żar do rana. Latem
  lipa, osika, wierzba - szybko ugotować i po sprawie, mało dymu, bez
  iskier, które w suszę mogą zapalić trawę (rozdział 7).
- **Deszcz** (to "Pogoda, część 6" z planu): mżawka chłodzi ogień, ulewa
  gasi słabe ognisko; gorące ognisko z twardego drewna przetrwa
  przelotny deszcz.
- PPM pustą ręką na ognisku mówi (jak dziś) ile polan zostało,
  a dodatkowo jaką ma temperaturę.

**Pochodnie się wypalają** (decyzja Kamila). Patyk jest wspólny dla
wszystkich gatunków, więc w pochodni liczy się paliwo:

- Pochodnia pali się ograniczony czas: **łuczywo** krótko, pochodnia
  z **żywicą** dłużej, z **olejem** najdłużej (rząd wielkości: od kilku
  minut do doby-dwóch gry - do strojenia, żeby nie męczyło).
- **Przygasa etapami**: światło słabnie, na końcu zostaje sam żar
  i wypalony ogarek.
- Ogarek **odnawia się** żywicą albo olejem (PPM) i rozpala starterem
  ognia. Deszcz gasi pochodnie pod gołym niebem.
- **Lampy** (lepidolit, olej, kora brzozowa) nie gasną - to nagroda za
  trudniejszy przepis.
- *(dodatek)* **Łuczywo**: żywiczne polano (sosna, kosodrzewina, świerk,
  modrzew, sosna oścista) → 4 łuczywa - pochodnia bez zbierania żywicy,
  jasna, ale na krótko.

---

## 3. Drzewo jako jeden byt

Gra wie, które pnie, konary i liście należą do jednego drzewa.

### Kołysanie

Całe drzewo - pień z koroną - lekko wygina się z wiatrem: przy ziemi
wcale, im wyżej, tym bardziej. Siła zależy od lokalnego wiatru (pogoda)
i gatunku:

| Jak mocno | Drzewa |
|---|---|
| mocno | palma, brzoza, osika, eukaliptus, wysoki świerk i jodła, modrzew |
| średnio | sosna, lipa, olcha, wierzba, klon, wiśnia, jakaranda, miłorząb |
| ledwo | dąb, buk, oliwka, akacja, cedr, araukaria |
| tylko liście | baobab, sekwoja, puchowiec, banian |

To sam wygląd: kolizje zostają na miejscu, więc po drzewie chodzi się
jak dotąd.

### Ścinanie

- **LPM siekierą w pień żywego drzewa to cios**, nie kopanie bloku.
  Zamach jest wolniejszy (ok. 0,6 s) i kosztuje energię. W pniu rośnie
  **karb** - widać go na tej stronie, w którą bijesz. Lecą wióry, drzewo
  drży, sypią się liście.
- **Ile ciosów**: twardość × grubość pnia. Kamienną siekierą:

  | Drzewo | Ciosów |
  |---|---|
  | świerk, pień 1 blok | 3 |
  | sosna | 5 |
  | brzoza | 8 |
  | dąb, pień 1 blok | 11 |
  | dąb, pień 2 × 2 | 21, z dwóch stron |
  | oliwka 2 × 2 | 27, z dwóch stron |

- **Grubość pnia**:
  - 1 blok - wystarczy jedna strona,
  - 2 × 2 - karb z jednej strony dochodzi tylko do połowy, trzeba obejść
    drzewo i ciąć z drugiej,
  - 3 × 3 i 4 × 4 (sekwoja, puchowiec) - ze wszystkich czterech stron
    i **tylko siekierą z metalu**,
  - baobab (5-7 bloków) - nie do ścięcia; daje wodę, owoce i włókno.
- **Za twarde drewno** dla danej siekiery: ostrze odbija się, karb nie
  rośnie, a siekiera się szczerbi (rozdział 5).
- **Kierunek**: drzewo pada **od ciebie** - w stronę, w którą patrzysz
  przy ostatnim ciosie. Stajesz więc po przeciwnej stronie, niż chcesz
  je położyć. Tuż przed upadkiem pień trzeszczy i przez sekundę się
  przechyla - widać, dokąd poleci.
- **Upadek**: wszystko powyżej karbu obraca się jak jedna bryła przez
  2-4 sekundy (wysokie drzewo dłużej). Na końcu huk, wstrząs obrazu,
  chmura liści i kurzu.
- **Cięcie wyżej** działa tak samo: spada to, co trzymało się na ciętym
  miejscu. Ucięty konar spada sam, drzewo stoi dalej.

### Co zostaje

| Co | Co z tym robić |
|---|---|
| **Pniak** | zostaje w ziemi; *(dodatek)* u wierzby, olchy, lipy, brzozy, dębu i eukaliptusa po jakimś czasie wypuszcza odrośl - nowe drzewo bez sadzenia |
| **Leżący pień** | bloki na ziemi wzdłuż linii upadku; do pocięcia na kozłach |
| **Konary** (grube gałęzie korony) | przedmioty: na kozły, na opał, na patyki |
| **Gałęzie** | patyki |
| **Liście** | znikają w chmurze liści; zostają sadzonki, szyszki, owoce |

- Pień układa się na terenie. Na uskoku albo przeszkodzie **pęka** na
  krótsze odcinki.
- Padające drzewo łamie rośliny i liście, ale **nie niszczy budowli** -
  opiera się o nie.
- Kłoda położona ręką (ściana domu) niszczy się jak zwykły blok, tak
  jak dziś. Stare budowle z pni zostają bez zmian.
- W trybie twórczym pień znika od razu, jak dotąd.

### Wyjątki

- **Kosodrzewina** nie ma prostego pnia - rąbie się ją na gałęzie.
- **Banian** stoi na wielu pniach z korzeni. Podpory ścina się osobno,
  a całość pada dopiero po głównym pniu.
- **Namorzyn** rośnie w wodzie - do ustalenia, czy jego pień ma pływać.
- **Palma** ma krzywy pień - leżąc, prostuje się.

---

## 4. Kozły - obróbka leżącego pnia

Pomysł Kamila: dwie stacje robocze na dwóch końcach pnia. Proponuję
nazwać je **kozłami** (jak stół stolarski i krawiecki - praca w świecie,
bez okna).

- **Kozioł**: 3 konary (albo 4 patyki i sznur). Konary daje każde
  ścięte drzewo, więc pierwsze drzewo samo daje materiał na kozły.
- Postaw po jednym koźle **na obu końcach leżącego pnia**. Odcinek
  między nimi staje się stanowiskiem.
- **LPM siekierą w pień**: co kilka ciosów (zależnie od twardości)
  odpada **kłoda** - z tego końca, przy którym stoisz. Jeden metr pnia
  to jedna kłoda; z pnia 2 × 2 cztery.
- **Kucanie + LPM**: łupanie na **opał** (metr pnia → 4 polana). To
  zastępuje dzisiejszy przepis "pień + siekiera" w siatce.
- **PPM siekierą**: okorowanie, daje korę (jak dziś).
- Kozły zabiera się i stawia przy następnym pniu.
- *(dodatek)* **Bez kozłów też się da, ale źle**: trzy razy wolniej,
  a siekiera zużywa się dwa razy szybciej (bije w ziemię). Dzięki temu
  pierwsze drzewo nie blokuje gry, a kozły szybko się opłacają.
- Później: **piła** - deski prosto z pnia, więcej niż z kłody.

---

## 5. Twardość i narzędzia

Dziś skała, z której jest narzędzie, to tylko wygląd. Po zmianie:

| Narzędzie z | Twardość | Tnie drewno do twardości |
|---|---|---|
| piaskowca | 2 | 3 - tylko miękkie |
| wapienia | 3 | 4 |
| łupka | 4 | 6 |
| kamienia | 5 | 7 - wszystko oprócz akacji, namorzynu i oliwki |
| bazaltu | 6 | 9 - wszystko |
| granitu | 7 | 10 - wszystko |
| **metalu meteorytowego** | 20 | wszystko, także pnie 3 × 3 i 4 × 4 |

Trzy zasady:

1. Narzędzie tnie drewno najwyżej **półtora raza twardsze** od siebie.
2. **Zużycie** rośnie z twardością drewna: kamienna siekiera wystarcza
   na dwa dęby albo sześć brzóz.
3. Gdy narzędzie jest **co najmniej dwa razy twardsze** od drewna, nie
   zużywa się wcale. Kamienna siekiera na świerku, granitowa na sośnie -
   bez śladu. Metal meteorytowy - na żadnym drewnie.

**Zużycie widać**: narzędzie ma trzy wyglądy (ikonka i w dłoni) - całe,
wyszczerbione, pęknięte - i cienki pasek pod ikonką, jak pasek
świeżości. Gdy pęknie, w ręce zostaje patyk.

Na początek dotyczy to siekiery. Kilof (twardość skał), łopata i nóż
mogą dostać to samo później.

**Metal meteorytowy.** Meteoryt już spada w nocy i zostaje w kraterze.
*(dodatek)* Droga do metalu łączy się z drewnem:

1. **węgiel drzewny** - z mielerza (stos drewna przysypany ziemią, tli
   się powoli) albo ze zwęglonych pni po pożarze,
2. **dymarka** z gliny - tylko węgiel drzewny daje 1200°,
3. meteoryt → kęs metalu → głowica siekiery, kilofa, łopaty, noża.

Rzadkie: jeden meteoryt to jedno narzędzie. Siekiera meteorytowa tnie
trzy razy szybciej i jako jedyna bierze olbrzymy.

---

## 6. Co daje pień

Tak jak dziś żywica na sośnie: **PPM nożem w pień** robi nacięcie, po
jakimś czasie pojawia się w nim sok albo żywica, PPM zbiera. Pora roku
ma znaczenie.

| Drzewo | Co daje | Kiedy | Do czego |
|---|---|---|---|
| brzoza | sok brzozowy | wiosna | napój |
| klon | sok klonowy | koniec zimy, wiosna | w garnku: syrop klonowy (nie psuje się) |
| sosna, świerk, jodła, modrzew, kosodrzewina, sosna oścista, cedr, araukaria | żywica | cały rok, latem najszybciej | pochodnie, podpałka |
| wiśnia, akacja | guma | lato | klej, jadalna |
| banian | lateks | cały rok | klej, uszczelnianie |
| dracena | "smocza krew" | cały rok | czerwony barwnik |
| eukaliptus | czerwona żywica | lato | brązowy barwnik |
| baobab | woda | cały rok | napój na sawannie |
| lipa | łyko (z okorowanego pnia) | wiosna, lato | sznur - jak włókno lnu |
| wierzba | kora wierzbowa | cały rok | zioło do naparu |
| dąb, namorzyn, sekwoja | garbnik z kory | cały rok | ciemny barwnik |
| palma | sok palmowy | cały rok | napój |

Bez soku: buk, olcha, osika, jabłoń, oliwka, jakaranda, miłorząb,
cypryśnik, puchowiec, jukka (te dają owoce, włókno albo samo drewno).

Do czego dokładnie służy klej i lateks - do ustalenia, gdy do nich
dojdziemy.

---

## 7. Pożar

Ogień **nie chodzi po pojedynczych blokach, tylko po drzewach** i płatach
suchej trawy. Jest czytelniejszy i nie obciąża gry.

### Jak płonie drzewo

1. **Zajmuje się** - od suchej trawy pod nim, od sąsiedniej korony, od
   pioruna.
2. **Płonie korona**: 20-60 sekund płomieni, dymu i światła. W nocy
   widać łunę z daleka.
3. **Wynik** zależy od grubości pnia i kory:

| Wynik | Kiedy | Drzewa |
|---|---|---|
| **Popiół** - drzewo znika, na ziemi zostaje popiół | cienki pień, żywica, młode drzewka | kosodrzewina, jukka, cienkie brzozy, osiki i wierzby, każde młode drzewo |
| **Zwęglony kikut** - liście spalone, stoi czarny pień | średnie drzewa | świerk, jodła, buk, lipa, klon, jabłoń, wiśnia, olcha, jakaranda, sosna oścista |
| **Przeżywa** - osmalony dół pnia, liście odrastają wiosną | gruba kora, pień 2 × 2 i grubszy | sekwoja, baobab, stara sosna i dąb, modrzew, araukaria, cedr, palma, akacja, eukaliptus (odrasta), oliwka, miłorząb |

Zwęglony pień ma własną, czarną teksturę. Ścięty daje **węgiel
drzewny** zamiast kłód.

### Jak się szerzy

- Łatwo: iglaste, eukaliptus, sucha trawa, sawanna i półpustynia latem.
- Trudno: po deszczu, zimą, w lesie deszczowym, na mokradłach
  i w namorzynach.
- **Z wiatrem**: ogień idzie tam, gdzie wieje, tym szybciej, im mocniej.
- Zatrzymują go: deszcz, woda, skała, piasek, pas bez drzew.

### Skąd się bierze

- **piorun** (burze dziś dają tylko światło i dźwięk),
- **iskry z ogniska** z żywicznym drewnem, w suszę i na wietrze -
  chyba że ognisko stoi na kamieniu, piasku albo w kręgu z kamieni,
- **meteoryt**,
- gracz - starterem ognia na suchej trawie.

### Bezpieczniki

- **Budowle gracza na początek nie płoną** (deski, płoty, skrzynie).
- Ustawienie świata: *Pożary: wyłączone / tylko od gracza / pełne*.
- Najwyżej kilkadziesiąt płonących drzew naraz.
- Zwierzętom nic się nie dzieje - uciekają (zasada gry).

### Po pożarze

- **Popiół** zbiera się łopatą - nawóz jak kompost (1.24.0).
- Spalona ziemia po kilku dniach zarasta żyzną trawą.
- Sosna, sekwoja i eukaliptus **wysiewają się po pożarze** - na
  pogorzelisku wschodzą ich sadzonki.

---

## 8. Dodatki, które tu pasują

- **Wędzenie**: dym z olchy, buka, jabłoni i wiśni nad ogniskiem
  utrwala jedzenie - wolniej się psuje (psucie z 1.24.0).
- **Lipa i jukka do startera ognia**: starter z miękkiego drewna rozpala
  szybciej.
- **Karpina**: wykopany pniak sosny to najlepsze łuczywo.
- **Puchowiec na tratwę**: najlżejsze drewno - szybsza tratwa.
- **Cedr na skrzynię**: ubrania i jedzenie w cedrowej skrzyni trzymają
  się dłużej.

---

## 9. Początek gry po zmianie

Dziś pierwszy krok to "rozbij pień ręką". Gołą ręką drzewa się już nie
zetnie, więc **pierwsze drewno bierze się z powalonego drzewa** (pomysł
Kamila): starego pnia, który kiedyś sam upadł i leży w lesie.

**Powalone drzewo**

- Leży w każdym lesie co jakiś czas: pień miejscowego gatunku na ziemi,
  kilka sterczących konarów, trochę mchu i hub. Przy miejscu startu
  zawsze jedno jest w zasięgu wzroku.
- To ten sam leżący pień, który gracz później sam położy siekierą -
  najpierw poznaje obróbkę na bezpiecznym przykładzie, dopiero potem
  ścinanie.
- **Gołą ręką** (decyzja Kamila): odłamuje się gałęzie (patyki), zdziera
  korę (podpałka) i wyłamuje **spróchniałe drewno** - puste w środku,
  lekkie. **Siekierą**: tnie się zdrową część pnia na kłody.
- Drewno jest **suche** (leżało latami), więc pierwsze ognisko rozpala
  się łatwo. Świeżo ścięte drzewo będzie mokre - gracz sam zobaczy
  różnicę.
- Drewna jest tyle, żeby starczyło na narzędzia, kozły i pierwsze
  ognisko. Potem trzeba już ścinać.
- **Spróchniałe drewno** (pomysł Kamila; do czego służy - moja
  propozycja):
  - **polano na start**: zajmuje się od byle czego (zapłon 200°, niżej
    niż każde zdrowe drewno), ale grzeje słabo (ok. 450°), pali się pół
    minuty i mocno dymi. Położone na wierzchu stosu rozpala resztę -
    pierwsze ognisko da się zrobić bez siekiery, a prawdziwe ciepło daje
    dopiero zdrowe drewno,
  - **próchno** (kłoda rozkruszona w dłoniach): podpałka, która się tli.
    Przytknięta do płonącego ogniska **niesie żar** do następnego - bez
    startera; po kilku minutach gaśnie,
  - **próchno do ziemi**: nawóz jak kompost,
  - *(później)* **pusta kłoda jako blok**: kryjówka dla jeży i koryto na
    kwiaty.
- *(dodatek, później)* **Wichura** powala stare drzewa, więc leżące pnie
  pojawiają się też w trakcie gry.

**Kolejność na początku**

1. **Patyki, kora i spróchniałe drewno**: z powalonego drzewa, gołą ręką
   - wystarczy na pierwsze ognisko.
2. **Skały**: jak dziś.
3. **Siekiera**: 3 skały i patyk, jak dziś.
4. **Kłody z powalonego pnia**: siekierą.
5. **Pierwsze stojące drzewo**: cienki świerk, sosna albo brzoza - kilka
   ciosów.
6. Konary → **kozły** → kłody → deski.

Samouczek dostaje nowe kroki: znajdź powalone drzewo, zbierz patyki
i korę, zrób siekierę, potnij pień, zetnij drzewo.

---

## 10. Wydajność

- **Drzewo-byt nic nie kosztuje, póki stoi.** Gra ustala, co należy do
  drzewa, dopiero przy pierwszym ciosie albo zapłonie - raz.
- **Upadek**: bloki drzewa znikają ze świata jednym ruchem, a spada
  jedna bryła (jeden model). Po upadku jedna aktualizacja świata.
  Olbrzymy przygotowuje się przez kilka klatek.
- **Kołysanie** liczy karta graficzna (jak kołysanie trawy) - procesor
  nic nie robi.
- **Pożar**: krótka lista płonących drzew z limitem, krok co sekundę.
- **Wilgotność drewna**: ten sam mechanizm co świeżość jedzenia.
- Przed każdą częścią i po niej pomiary w tych samych scenach.

---

## 11. Kolejność (propozycja)

Każda część to osobna wersja, grywalna sama.

| Wersja | Część | Co wchodzi |
|---|---|---|
| A1 | **Charakter drewna** - **1.32.0, w grze** | cechy gatunków, ognisko z temperaturą: rozpalanie etapami, rozpałka z patyków, czas palenia, ciepło, gotowanie, żar, dym i iskry |
| A2 | **Wilgotność** - **1.33.0, w grze** | świeże polana mokre (pasek, opis), mokre drewno w ognisku, schnięcie (plecak, skrzynia, ziemia, słońce, ogień), deszcz moczy |
| A2b | **Drewutnia** - **1.34.0, w grze** | stos 16 polan: schną jak na powietrzu i nie zajmują ekwipunku; pod dachem nie mokną |
| A3 | **Pochodnie i deszcz** - **1.35.0, w grze** | wypalające się pochodnie (przygasanie, ogarek, dolewanie paliwa), łuczywo, deszcz chłodzi i gasi ognisko, gasi pochodnie |
| B | **Ścinanie** | drzewo-byt, ciosy i karb, upadek, leżący pień, konary, kozły, **powalone drzewa na start** (rozdział 9), nowy samouczek |
| C | **Narzędzia i kołysanie** | twardość skał, widoczne zużycie, kołysanie drzew |
| D | **Dary pnia** | soki, żywice, guma, łyko - nacinanie nożem |
| E | **Pożar** | płonące drzewa i trawa, piorun, popiół, zwęglone pnie |
| F | **Metal meteorytowy** | węgiel drzewny, dymarka, narzędzia z meteorytu, olbrzymy |

A jest najbezpieczniejsza (nie zmienia sposobu gry, od razu daje
głębię), dlatego jest podzielona na trzy mniejsze wersje - każdą da się
sprawdzić osobno. B jest największa i najtrudniejsza.

---

## 12. Odpowiedzi Kamila (21.11.2026)

Kamil wybrał wszystkie polecane warianty, a pochodnie mają się wypalać.

1. **Kierunek upadku**: drzewo pada **od gracza**.
2. **Kozły**: **nieobowiązkowe** - bez nich da się ciąć pień, ale trzy
   razy wolniej i z dwa razy szybszym zużyciem siekiery.
3. **Gracz pod padającym drzewem**: **ogłuszenie jak pod wodą, tylko
   urwane** (decyzja Kamila). Bez powolnego ściemniania: nagle widok
   skupia się na padającym drzewie, „ciach" i od razu ciemność. Dalej
   jak przy utracie przytomności (świat nadrabia czas, gracz budzi się
   obok).
4. **Olbrzymy**: sekwoja i puchowiec tylko siekierą z metalu, baobabu
   nie da się ściąć.
5. **Pożar a budowle**: na początek **nie płoną**; jest ustawienie
   świata (wyłączone / tylko od gracza / pełne).
6. **Pochodnie**: **wypalają się** (rozdział 2), do tego łuczywo.
7. **Kiedy**: najpierw fasola i groch (1.31.0), potem drewno - od
   części A.
8. **Pierwsze drewno z powalonego drzewa** (pomysł Kamila, 21.11.2026):
   opis w rozdziale 9. Wchodzi razem ze ścinaniem (część B). **Gołą ręką
   tylko gałęzie, kora i spróchniałe drewno** (puste w środku); zdrowe
   kłody - siekierą.

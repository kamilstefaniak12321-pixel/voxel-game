// ------------------------------------------------------------
// PORADNIK (0.99.0) - notatka w Ustawienia → Poradnik
//
// Krótkie rozdziały o tym, jak grać w trybie przygody - to samo, czego
// uczy samouczek (game/Tutorial.js), i to, na co w nim nie ma miejsca.
// Sam tekst, bez kodu: ekran rysuje ui/Menu.js (showSettings, zakładka
// 'guide'). Rozdział rozwija się po kliknięciu nagłówka.
//
// Nowy rozdział: wpis w GUIDE. Pola:
//   id     - nazwa (do testów i zapamiętania, który jest otwarty),
//   title  - nagłówek,
//   intro  - zdanie pod nagłówkiem (opcjonalnie),
//   lines  - punkty; { keys: 'E', text: '...' } - punkt z klawiszem
//            na początku; sam napis - zwykły punkt,
//   touch  - punkty pokazywane zamiast lines na telefonie (opcjonalnie).
//
// Liczby w tekście muszą zgadzać się z grą - pilnuje tego
// tools/sprawdz_samouczek.mjs (sekcja "Poradnik").
// ------------------------------------------------------------

export const GUIDE = [
    {
        id: 'controls',
        title: 'Sterowanie',
        lines: [
            { keys: 'W A S D', text: 'chodzenie; dwa razy W albo R - bieg' },
            { keys: 'Mysz', text: 'rozglądanie się' },
            { keys: 'Spacja', text: 'skok; w wodzie - płyń w górę' },
            { keys: 'Shift', text: 'kucanie (nie spadasz z krawędzi); w wodzie - nurkuj' },
            { keys: 'LPM', text: 'przytrzymaj - kopanie, aż blok pęknie' },
            { keys: 'PPM', text: 'postaw blok, zbierz owoce, użyj tego, co trzymasz' },
            { keys: '1-9, kółko', text: 'wybór miejsca na pasku' },
            { keys: 'E', text: 'ekwipunek i wytwarzanie' },
            { keys: 'F', text: 'zjedz albo wypij to, co trzymasz' },
            { keys: 'C', text: 'okno statusu (samopoczucie)' },
            { keys: 'M', text: 'mapa terenu' },
            { keys: 'L', text: 'księga osiągnięć' },
            { keys: 'F5', text: 'widok z oczu, zza pleców, z przodu' },
            { keys: 'T', text: 'czat; /pomoc - lista komend' },
            { keys: 'Esc', text: 'pauza, ustawienia, zapis i wyjście' }
        ],
        touch: [
            { keys: 'Lewa strona', text: 'joystick - chodzenie; do samego brzegu w przód - bieg' },
            { keys: 'Reszta ekranu', text: 'przesuwaj palcem - rozglądanie się' },
            { keys: 'Stuknięcie', text: 'postaw blok, zbierz owoce, użyj tego, co trzymasz' },
            { keys: 'Przytrzymanie', text: 'kopanie, aż blok pęknie' },
            { keys: '▲ ▼', text: 'skok i kucanie; w wodzie - w górę i nurkowanie' },
            { keys: 'Skrzynka', text: 'ekwipunek i wytwarzanie' },
            { keys: 'Serce', text: 'okno statusu; z jedzeniem w ręce jest w nim przycisk Zjedz' },
            { keys: '☰', text: 'pauza, ustawienia, zapis i wyjście' }
        ]
    },
    {
        id: 'first-day',
        title: 'Pierwszy dzień',
        intro: 'Kolejność, która zwykle się sprawdza.',
        lines: [
            'Zetnij drzewo gołą ręką i zrób z pnia deski (1 pień → 4 deski), a z desek patyki (2 deski → 4 patyki).',
            'Wykop trzy skały i zrób siekierę - drewno pójdzie trzy razy szybciej.',
            'Zbieraj jedzenie po drodze: owoce z krzaków, jabłka, orzechy, żołędzie.',
            'Przed wieczorem ułóż ognisko: upieczesz przy nim jedzenie i będziesz widzieć w nocy.',
            'O 19:00 zaczyna się noc. Prześpij ją - choćby na ziemi, lepiej na posłaniu ze słomy.'
        ]
    },
    {
        id: 'crafting',
        title: 'Wytwarzanie i narzędzia',
        lines: [
            'W ekwipunku jest siatka 2 × 2. Połóż w niej składniki i zabierz wynik.',
            'Przycisk Przepisy pokazuje wszystko, co da się zrobić. Kliknięcie przepisu samo układa składniki; szary przepis - czegoś brakuje.',
            'Siekiera: 3 skały i patyk. Kilof: 2 skały i patyk. Łopata: skała i patyk.',
            'Narzędzie przyspiesza kopanie trzy razy: siekiera - drewno, kilof - skały, łopata - ziemię i piasek.',
            'Skrzynia: 4 deski z jednego drzewa w kwadracie. Trzyma rzeczy, których nie nosisz przy sobie.',
            'Stół stolarski: 2 deski z jednego drzewa nad 2 patykami. Deski położone na blacie zamieniasz na schody, półbloki, płoty i furtki.',
            'Dwa stoły obok siebie robią drzwi i klapy, trzy w rzędzie - stelaż łóżka.'
        ]
    },
    {
        id: 'food',
        title: 'Jedzenie i energia',
        intro: 'Serce w rogu ekranu pokazuje samopoczucie; szczegóły są w oknie statusu.',
        lines: [
            'Energii ubywa cały czas, szybciej przy biegu, kopaniu i pływaniu. Wraca tylko z jedzenia.',
            'Zmęczony gracz biega i kopie wolniej. Wyczerpany ledwo chodzi, ale nie umiera - wystarczy coś zjeść.',
            'Owoce i orzechy to przekąski. Pieczone jedzenie to porządny posiłek - syci dużo dłużej.',
            'Trzy posiłki dziennie podnoszą kondycję: następnego dnia masz więcej energii. Głodowanie ją obniża.',
            'Z pełnym żołądkiem energii ubywa wolniej.'
        ]
    },
    {
        id: 'fire',
        title: 'Ognisko',
        lines: [
            'Opał: pień i siekiera w siatce wytwarzania dają 4 polana (siekiera zostaje).',
            'Opałem kliknij ziemię i dokładaj, aż będzie 6 polan. Potem dołóż podpałkę.',
            'Podpałka: trawa, słoma, kora brzozowa albo huba. Huba rozpala dwa razy szybciej niż trawa.',
            'Starter ognia to 2 patyki. Wyceluj w ognisko i trzymaj prawy przycisk przez 5 sekund.',
            'Pieczenie: trzymaj jabłko, orzechy albo żołędzie nad płomieniem przez 4 sekundy.',
            'Ognisko świeci i grzeje przez 8 minut, potem się dopala - zostaje popiół.'
        ]
    },
    {
        id: 'sleep',
        title: 'Noc i sen',
        lines: [
            'Spać można od 19:00 do 5:00. Sen przesuwa noc do 6:00 rano.',
            'Bez snu robisz się senny, a potem niewyspany: wolniejszy bieg i kopanie.',
            'Goła ziemia (kucnij i kliknij ją pustą ręką) - słabe wyspanie.',
            'Posłanie: 2 trawy → słoma, 4 słomy → pościel; połóż pościel na ziemi. Dobre wyspanie.',
            'Łóżko: stelaż z trzech stołów stolarskich (8 desek), postaw go i kliknij pościelą. Pełne wyspanie i premia na następny dzień.',
            'Lniana pościel (4 wiązki lnu) daje większą premię niż słomiana.'
        ]
    },
    {
        id: 'herbs',
        title: 'Zioła i napary',
        lines: [
            'Gliniany kubek: 2 gliny → 2 kubki. Kubek + dwa zioła z jednej grupy = kubek ziół.',
            'Kubek ziół trzymaj nad płonącym ogniskiem - powstaje napar. Po wypiciu kubek wraca.',
            'Napar na sen (kwiat lipy, lawenda): następny sen jest głębszy.',
            'Napar leczniczy (rumianek, babka, szałwia, nagietek): stłuczona noga goi się 3 razy szybciej.',
            'Napar wzmacniający (pokrzywa, gorczyca): energii ubywa wolniej.',
            'Każdy kwiat daje też barwnik, a cztery dowolne kwiaty - wianek na ścianę.'
        ]
    },
    {
        id: 'farming',
        title: 'Uprawa',
        lines: [
            'Łopatą kliknij ziemię albo trawę prawym przyciskiem - powstaje rozgrzebana ziemia.',
            'Na rozgrzebanej ziemi posadzisz owoc, orzech, żołądź albo szyszkę. Gdzie indziej prawy przycisk zjada owoc.',
            'Krzak rośnie etapami i owocuje; zebrane owoce odrastają. Drzewo wyrasta po kilku minutach.',
            'Puste pole po pewnym czasie zarasta z powrotem.'
        ]
    },
    {
        id: 'danger',
        title: 'Upadki i woda',
        lines: [
            'Upadek z wysokości kończy się stłuczoną nogą: przez jakiś czas utykasz. Odpoczynek i pełny żołądek przyspieszają gojenie.',
            'Pod wodą ubywa powietrza (bąbelki przy sercu). Gdy się skończy, tracisz przytomność i budzisz się na brzegu - wyczerpany.',
            'W tej grze się nie umiera. Każdy błąd kosztuje czas i siły, nie rzeczy.'
        ]
    },
    {
        id: 'more',
        title: 'Co jeszcze warto wiedzieć',
        lines: [
            'Pochodnia: patyk i żywica (z pnia sosny) albo oliwki → 4 pochodnie. Barwnikiem zmienisz kolor płomienia.',
            'Tratwa: 2 deski obok siebie. Postaw ją na wodzie i wsiądź prawym przyciskiem.',
            'Mapa (M) pokazuje teren z góry. Księga osiągnięć (L) podpowiada, co jeszcze można zrobić.',
            'W pauzie możesz otworzyć świat dla znajomych - dostaniesz kod zaproszenia.',
            'Samouczek można powtórzyć przyciskiem na górze tej zakładki.'
        ]
    }
];

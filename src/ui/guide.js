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
//   lines  - punkty; sam napis - zwykły punkt;
//            { keys: '[inventory]', text: '...' } - punkt z klawiszem
//            na początku; { text, touch } - punkt z innym tekstem na
//            telefonie,
//   touch  - punkty pokazywane zamiast lines na telefonie (opcjonalnie).
//
// Klawisze pisz nazwą czynności z input/bindings.js w nawiasach
// kwadratowych: [eat] -> 'F', [use] -> 'PPM'. Gracz może je przypisać
// inaczej (Ustawienia → Gracz → Klawisze) - poradnik pokazuje wtedy jego
// klawisze. Na telefonie nawiasów nie ma: tam jest touch.
//
// Liczby w tekście muszą zgadzać się z grą - pilnuje tego
// tools/sprawdz_samouczek.mjs (sekcja "Poradnik").
// ------------------------------------------------------------

export const GUIDE = [
    {
        id: 'controls',
        title: 'Sterowanie',
        lines: [
            { keys: '[forward] [left] [back] [right]', text: 'chodzenie; dwa razy [forward] albo [sprint] - bieg' },
            { keys: 'Mysz', text: 'rozglądanie się' },
            { keys: '[jump]', text: 'skok; w wodzie - płyń w górę' },
            { keys: '[crouch]', text: 'kucanie (nie spadasz z krawędzi); w wodzie - nurkuj' },
            { keys: '[break]', text: 'przytrzymaj - kopanie, aż blok pęknie' },
            { keys: '[use]', text: 'postaw blok, zbierz owoce, użyj tego, co trzymasz' },
            { keys: '1-9, kółko', text: 'wybór miejsca na pasku' },
            { keys: '[inventory]', text: 'ekwipunek i wytwarzanie' },
            { keys: '[eat]', text: 'zjedz albo wypij to, co trzymasz (trwa chwilę)' },
            { keys: '[drop]', text: 'wyrzuć to, co trzymasz; z kucaniem - cały stos' },
            { keys: '[status]', text: 'okno statusu: samopoczucie i pora dnia' },
            { keys: '[map]', text: 'mapa terenu' },
            { keys: '[achievements]', text: 'księga osiągnięć' },
            { keys: '[view]', text: 'widok z oczu, zza pleców, z przodu' },
            { keys: '[chat]', text: 'czat; /pomoc - lista komend' },
            { keys: '[debug]', text: 'napisy debugowania: współrzędne, godzina, na co patrzysz' },
            { keys: 'Esc', text: 'pauza, ustawienia, zapis i wyjście' },
            'Każdy klawisz i przycisk myszy możesz zmienić: Ustawienia → Gracz → Klawisze.'
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
            'Zrób też nóż (skała i patyk na ukos): tylko nim zetniesz trawę, kwiaty i zioła.',
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
            'Siekiera: 3 skały i patyk. Kilof: 2 skały i patyk. Łopata: skała nad patykiem. Nóż: skała i patyk na ukos.',
            'Narzędzie przyspiesza kopanie trzy razy: siekiera - drewno, kilof - skały, łopata - ziemię i piasek.',
            'Nóż ścina trawę, kwiaty i zioła - zerwane gołą ręką przepadają.',
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
            'Z pełnym żołądkiem energii ubywa wolniej.',
            'Jedzenie trwa chwilę. Przerywa je kopanie i zmiana miejsca na pasku - wtedy nic nie ubywa.'
        ]
    },
    {
        id: 'fire',
        title: 'Ognisko',
        lines: [
            'Opał: pień i siekiera w siatce wytwarzania dają 4 polana (siekiera zostaje).',
            'Opałem kliknij ziemię i dokładaj, aż będzie 6 polan. Potem dołóż podpałkę.',
            { text: 'Podpałka: kora (kliknij pień siekierą: [use]), trawa, słoma albo huba. Huba rozpala dwa razy szybciej niż trawa, kora brzozowa - półtora raza.',
                touch: 'Podpałka: kora (stuknij pień siekierą), trawa, słoma albo huba. Huba rozpala dwa razy szybciej niż trawa, kora brzozowa - półtora raza.' },
            'Podpałka daje temperaturę na start: trawa i słoma 260°, kora 280°, kora sosny i świerka 300°, kora brzozy 330°.',
            'Polano z wierzchu zajmie się tylko od podpałki gorętszej niż jego zapłon: sosna 220°, świerk 240°, brzoza 270°, buk 300°, dąb 320°.',
            { text: 'Za słaba podpałka? Dołóż patyk jako rozpałkę ([use] patykiem na stosie): każdy dodaje 60°, mieszczą się dwa. Albo połóż na wierzchu łatwiejsze drewno.',
                touch: 'Za słaba podpałka? Dołóż patyk jako rozpałkę (stuknij stos patykiem): każdy dodaje 60°, mieszczą się dwa. Albo połóż na wierzchu łatwiejsze drewno.' },
            { text: 'Starter ognia to 2 patyki. Wyceluj w ognisko i trzymaj [use] przez 5 sekund.',
                touch: 'Starter ognia to 2 patyki. Wyceluj w ognisko i trzymaj przycisk z kostką przez 5 sekund.' },
            { text: 'Pieczenie: jabłkiem, orzechami albo żołędziami wyceluj w płomień i trzymaj [use] przez 4 sekundy.',
                touch: 'Pieczenie: jabłkiem, orzechami albo żołędziami wyceluj w płomień i trzymaj przycisk z kostką przez 4 sekundy.' },
            'Każde drewno pali się inaczej: pełny stos świerka starcza na 5,5 minuty, brzozy na 10 minut, dębu na 15 minut. Polana spalają się po kolei - do płonącego możesz dokładać.',
            'Twarde drewno grzeje mocniej: przy ognisku z lipy jest o 14°C cieplej, z sosny o 18, z brzozy o 22, z dębu o 25. Nad gorętszym ogniem szybciej się piecze i gotuje.',
            'Po ognisku zostaje żar: po świerku na minutę, po dębie na kilka minut. Polano dołożone na gorący żar zajmuje się samo, a nad żarem da się piec.',
            'Zapłon, żar i czas palenia polana widać po najechaniu na nie w ekwipunku. Iglaste strzelają iskrami, sosna i olcha dymią, buk i osika prawie nie.',
            'Polana prosto spod siekiery są mokre (niebieski pasek na ikonce): trudniej je zapalić i słabiej grzeją. Brzoza i olcha są bardzo mokre, oliwka i akacja prawie suche.',
            'Drewno schnie: w plecaku i skrzyni powoli, rzucone na ziemię w słońcu szybciej, przy płonącym ognisku w kilka minut. Deszcz moczy polana pod gołym niebem.',
            'Mokre polano dołożone do płonącego ogniska przeschnie od ciepła - najpierw syczy i dymi na biało.',
            { text: 'Stos drewna: kucnij ([crouch]) i kliknij ziemię polanem ([use]), potem dokładaj - mieści 16 polan. Schną na nim jak na powietrzu i nie zajmują plecaka; pod dachem nie zmokną.',
                touch: 'Stos drewna: trzymaj ▼ i stuknij ziemię polanem, potem dokładaj - mieści 16 polan. Schną na nim jak na powietrzu i nie zajmują plecaka; pod dachem nie zmokną.' },
            { text: 'Pusta ręka ([use]) zdejmuje polano ze stosu, z kucnięciem - wszystkie z wierzchu naraz. Ciemniejsze polana na stosie są jeszcze mokre.',
                touch: 'Pusta ręka zdejmuje polano ze stosu, z ▼ - wszystkie z wierzchu naraz. Ciemniejsze polana na stosie są jeszcze mokre.' }
        ]
    },
    {
        id: 'sleep',
        title: 'Noc i sen',
        lines: [
            'Spać można od 19:00 do 5:00. Sen przesuwa noc do 6:00 rano - świat nie czeka: ogniska się dopalają, rośliny rosną.',
            'Bez snu robisz się senny, a potem niewyspany: wolniejszy bieg i kopanie.',
            { text: 'Goła ziemia (kucnij - [crouch] - i kliknij ją pustą ręką: [use]) - słabe wyspanie.',
                touch: 'Goła ziemia (trzymaj ▼ i stuknij ją pustą ręką) - słabe wyspanie.' },
            'Posłanie: 2 trawy (ścięte nożem) → słoma, 4 słomy → pościel; połóż pościel na ziemi. Dobre wyspanie.',
            'Łóżko: stelaż z trzech stołów stolarskich (8 desek), postaw go i kliknij pościelą. Pełne wyspanie i premia na następny dzień.',
            'Lniana pościel (4 wiązki lnu) daje większą premię niż słomiana.'
        ]
    },
    {
        id: 'herbs',
        title: 'Zioła i napary',
        lines: [
            { text: 'Kwiaty i zioła ścina się nożem ([use] na kwitnącej roślinie): bierzesz kwiat, łodyga zostaje i kwitnie od nowa.',
                touch: 'Kwiaty i zioła ścina się nożem (stuknij nim kwitnącą roślinę): bierzesz kwiat, łodyga zostaje i kwitnie od nowa.' },
            'Gliniany kubek: 2 gliny → 2 mokre kubki. Wysusz je na słońcu (niżej: Glina i cegły). Suchy kubek + dwa zioła z jednej grupy = kubek ziół.',
            'Kubek ziół trzymaj nad płonącym ogniskiem - powstaje napar. Po wypiciu kubek wraca.',
            'Napar na sen (kwiat lipy, lawenda, płatki róży): następny sen jest głębszy.',
            'Napar leczniczy (rumianek, babka, szałwia, nagietek, kwiat czarnego bzu): stłuczona noga goi się 3 razy szybciej.',
            'Napar wzmacniający (pokrzywa, gorczyca): energii ubywa wolniej.',
            'Niektóre owoce działają same, słabiej niż napar: dzika róża, żurawina i brusznica goją, aronia, rokitnik, czarna porzeczka i czarny bez krzepią, chili rozgrzewa.',
            'Każdy kwiat daje też barwnik, a cztery dowolne kwiaty - wianek na ścianę.'
        ]
    },
    {
        id: 'clay',
        title: 'Glina i cegły',
        lines: [
            'Zwykła glina leży płatami na brzegach rzek i jezior, najwięcej na mokradłach. Kopie się ją jak ziemię (łopatą szybciej).',
            'Czerwona glina: gaje oliwne i lasy eukaliptusowe. Biała: skaliste góry, hale i kosodrzewina.',
            '2 gliny → 2 mokre kubki. 1 glina → 2 mokre cegły.',
            { text: 'Mokre rzeczy muszą wyschnąć: wyrzuć je ([drop]) w dzień pod gołym niebem. Po 2 minutach leżenia na słońcu są suche - podnieś je.',
                touch: 'Mokre rzeczy muszą wyschnąć: w ekwipunku weź je i stuknij obok okna - w dzień, pod gołym niebem. Po 2 minutach na słońcu są suche.' },
            'Nocą, pod dachem i w wodzie glina nie schnie.',
            'Z suchego kubka da się pić napary. 4 suche cegły w kwadracie → blok cegieł w kolorze swojej gliny.'
        ]
    },
    {
        id: 'cooking',
        title: 'Gotowanie w garnku',
        lines: [
            '3 gliny i patyk → mokry garnek. 3 gliny → 2 mokre miski. Wysusz je na słońcu jak kubki.',
            { text: 'Nabierz wody: z pustym garnkiem w ręce kliknij [use] na wodę.', touch: 'Nabierz wody: z pustym garnkiem w ręce stuknij wodę.' },
            { text: 'Garnek z wodą postaw na ognisku ([use]). Potem wrzuć 2 albo 3 surowe składniki - [use] z jedzeniem w ręce.',
                touch: 'Garnek z wodą postaw na ognisku (stuknij je). Potem wrzuć 2 albo 3 surowe składniki - stuknij ognisko z jedzeniem w ręce.' },
            'Nad płonącym ogniem potrawa gotuje się 45 sekund - nie trzeba przy niej stać. Dorzucony składnik zaczyna gotowanie od nowa.',
            'Gotową potrawę nabierz glinianą miską: tyle porcji, ile było składników. Zjedzona potrawa oddaje miskę.',
            'Dynia i cukinia → gulasz warzywny. Dwie dynie → zupa dyniowa. Dwie cukinie → duszona cukinia. Orzechy, żołędzie, pestki → polewka orzechowa. Same owoce → kompot. Cokolwiek innego → polewka.',
            'Potrawa z garnka to najlepszy posiłek w grze - dużo lepszy niż to samo upieczone.',
            { text: 'Pusty garnek zdejmij pustą ręką ([use]) i nabierz wody od nowa. Z garnkiem na ogniu nie da się piec.',
                touch: 'Pusty garnek zdejmij pustą ręką (stuknij ognisko) i nabierz wody od nowa. Z garnkiem na ogniu nie da się piec.' }
        ]
    },
    {
        id: 'farming',
        title: 'Uprawa',
        lines: [
            { text: 'Łopatą kliknij ziemię albo trawę ([use]) - powstaje rozgrzebana ziemia.',
                touch: 'Łopatą stuknij ziemię albo trawę - powstaje rozgrzebana ziemia.' },
            { text: 'Na rozgrzebanej ziemi posadzisz owoc, orzech, żołądź albo szyszkę. Gdzie indziej [use] zjada owoc.',
                touch: 'Na rozgrzebanej ziemi posadzisz owoc, orzech, żołądź albo szyszkę. Gdzie indziej stuknięcie zjada owoc.' },
            'Krzak rośnie etapami i owocuje; zebrane owoce odrastają. Drzewo wyrasta po kilku minutach.',
            'Ziemia ma znaczenie: na czarnoziemie rośliny rosną szybciej, na ziemi kamienistej wolniej. Jedną i drugą też da się rozgrzebać łopatą.',
            'Pole blisko wody (do 3 bloków) rośnie o jedną czwartą szybciej. Pole z kompostem przy wodzie to najlepsze miejsce na grządkę.',
            'Puste pole po pewnym czasie zarasta z powrotem.'
        ]
    },
    {
        id: 'seasons',
        title: 'Pory roku i zapasy',
        lines: [
            'Rok ma cztery pory po 8 dni. Każda roślina owocuje w swojej: wiosną truskawki i poziomki, latem maliny, porzeczki, agrest i borówki, jesienią aronia, leszczyna, żurawina i oliwki.',
            'Poza swoją porą roślina wygląda jak bez owoców i nie rośnie. Zimą nie rośnie nic - także sadzonki drzew.',
            'Na zimę zostają tylko owoce dzikiej róży, rokitnika i żurawiny: da się je zebrać, ale nowe nie urosną do następnej pory.',
            'Palma kokosowa, baobab i figowiec owocują cały rok.',
            { text: 'Owoce da się ususzyć: wyrzuć je ([drop]) w dzień pod gołe niebo. Po 2 minutach na słońcu cały stos to suszone owoce - syte i dobre do garnka.',
                touch: 'Owoce da się ususzyć: w ekwipunku weź je i stuknij obok okna - w dzień, pod gołym niebem. Po 2 minutach na słońcu cały stos to suszone owoce.' },
'Świeże jedzenie się psuje - tym szybciej, im cieplej. W plecaku miękkie owoce leżą 5 dni, jabłka i warzywa 12, pieczone 6, a potrawy 3. Na mrozie prawie nic się nie psuje.',
            'Ile jeszcze poleży, widać w opisie stosu w ekwipunku. Zbiory z różnych dni leżą osobno; gdy sam położysz stos na stos, świeżość wyjdzie ze średniej.',
            'W skrzyni jedzenie psuje się 2 razy wolniej, a w piwniczce (skrzynia pod dachem albo pod ziemią) 4 razy wolniej - i latem jest tam chłodniej.',
            'Nie psują się: suszone owoce, orzechy, żołędzie, pestki i cała dynia. Z nich rób zapasy na zimę.',
            { text: 'Zepsuty stos zamienia się w kompost, a potrawa - w kompost w misce: z nią w ręce kliknij [use], a kompost się wysypie i odzyskasz miskę.',
                touch: 'Zepsuty stos zamienia się w kompost, a potrawa - w kompost w misce: z nią w ręce stuknij ekran, a kompost się wysypie i odzyskasz miskę.' },
            { text: 'Kompostem kliknij rozgrzebaną ziemię ([use]) - na polu z kompostem rośliny rosną półtora raza szybciej. Zwykłą ziemię albo trawę kompost zamienia w czarnoziem.',
                touch: 'Z kompostem w ręce stuknij rozgrzebaną ziemię - na polu z kompostem rośliny rosną półtora raza szybciej. Zwykłą ziemię albo trawę kompost zamienia w czarnoziem.' },
            'Owoce, których nie zbierzesz, po swojej porze spadają na ziemię. Przez zimę gniją: ziemia pod nimi może zamienić się w czarnoziem, a wiosną z części wyrasta sadzonka.',
            'Po zimie roślina może dawać o jeden owoc więcej przy każdym zbiorze (najwyżej o 3). Pomaga jej to, że w zeszłym roku zbierałeś z niej owoce, i czarnoziem pod spodem.',
            'Żurawina, brusznica, truskawki i poziomki po zimie rozrastają się na wolne miejsce obok.'
        ]
    },
    {
        id: 'cold',
        title: 'Zimno',
        lines: [
            'Zimą i w górach robi się zimno. Odczuwalną temperaturę zmienia wiatr na otwartym terenie, woda (w wodzie jest zimniej) i dach nad głową (pod dachem cieplej).',
            'Najlepiej grzeje płonące ognisko - przy nim nawet w mróz jest ciepło. Pochodnie i lampy grzeją trochę. Ciepła potrawa z garnka, napar i chili grzeją od środka.',
            'Na mrozie najpierw robi się chłodno (płatek śniegu przy sercu), potem marzniesz: coraz wolniej chodzisz, a brzegi obrazu pokrywa szron.',
            'Kto nie zadba o ciepło, zamarza na kość w bryle lodu. Lód puszcza dopiero, gdy zrobi się cieplej - zimą bywa, że dopiero na wiosnę. Budzisz się wyczerpany i głodny.',
            'W grze ze znajomymi zamarznięty czeka w lodzie, aż ktoś rozpali obok ognisko albo postawi pochodnię.',
            'Na mrozie lepiej spać pod dachem, w łóżku albo na posłaniu - na gołej ziemi budzisz się zmarznięty.'
        ]
    },
    {
        id: 'clothes',
        title: 'Włókna i ubrania',
        lines: [
            { text: 'Wiązkę lnu, pokrzywę albo korę lipową wrzuć do wody ([drop]). Po półtorej minuty w wodzie len i pokrzywa są moczone, a kora daje łyko.',
                touch: 'Wiązkę lnu, pokrzywę albo korę lipową wyrzuć do wody (w ekwipunku weź ją i stuknij obok okna). Po półtorej minuty len i pokrzywa są moczone, a kora daje łyko.' },
            'Moczony len i moczona pokrzywa w siatce wytwarzania dają włókno. Trzy dowolne włókna to sznur, a dwie deski na dwóch sznurach - stół krawiecki.',
            { text: 'Stół krawiecki ma dwa bloki, jak stolarski. Połóż włókno na lewej części ([use]), a [use] w prawą część tka płótno: lniane, pokrzywowe (cieplejsze) albo z łyka.',
                touch: 'Stół krawiecki ma dwa bloki, jak stolarski. Połóż włókno na lewej części (stuknij), a stuknięcie w prawą część tka płótno: lniane, pokrzywowe (cieplejsze) albo z łyka.' },
            'Na płótnie po prawej leżą cztery wykroje: z tyłu na głowę i tułów, z przodu na nogi i stopy. Kliknij wykrój - uszyjesz go; z kucaniem - zmienisz krój (np. czapka, chusta, opaska).',
            'Barwnik na płótno to kolor ubrań, z kucaniem - kolor wzoru. Kucanie i pusta ręka na płótnie zmienia wzór: paski, krata, haft. Gotowe ubranie położone na stole barwisz tak samo.',
            'Ubrania zakłada się w miejsca obok postaci: głowa, tułów, nogi, stopy. Każde grzeje - im więcej na sobie, tym mniej marzniesz.'
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
            { text: 'Tratwa: 2 deski obok siebie. Postaw ją na wodzie i wsiądź ([use]).',
                touch: 'Tratwa: 2 deski obok siebie. Postaw ją na wodzie i wsiądź stuknięciem.' },
            { text: 'Mapa ([map]) pokazuje teren z góry. Księga osiągnięć ([achievements]) podpowiada, co jeszcze można zrobić.',
                touch: 'Mapa (komenda /mapa) pokazuje teren z góry. Księga osiągnięć podpowiada, co jeszcze można zrobić.' },
            { text: 'Niepotrzebną rzecz wyrzuć ([drop]) - leży na ziemi, dopóki ktoś jej nie podniesie.',
                touch: 'Niepotrzebną rzecz wyrzuć: w ekwipunku weź ją i stuknij obok okna. Leży na ziemi, dopóki ktoś jej nie podniesie.' },
            'W pauzie możesz otworzyć świat dla znajomych - dostaniesz kod zaproszenia.',
            'Samouczek można powtórzyć przyciskiem na górze tej zakładki.'
        ]
    }
];

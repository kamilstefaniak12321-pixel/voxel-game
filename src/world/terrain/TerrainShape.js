// ------------------------------------------------------------
// KSZTAŁT TERENU REALISTYCZNEGO - wszystkie liczby do strojenia
//
// Teren powstaje z kilku "pól" - gładkich map szumu, każda o innej
// skali (wielkości plam w blokach):
//
//   kontynent    - morze ↔ ląd; im dalej w głąb lądu, tym wyżej,
//   wypiętrzenie - gdzie są niziny, wyżyny i góry,
//   erozja       - teren wygładzony (równiny, łagodne góry)
//                  ↔ poszarpany (pagórki, ostre góry),
//   grzbiety     - linie grzbietów górskich i doliny między nimi,
//   + mniejsze pola do konkretnych form: kotliny, płaskowyże,
//     żleby, turnie, depresje,
//   + klimat (temperatura, wilgotność) - na razie tylko na mapie,
//     pod przyszłe biomy.
//
// Wysokości poniżej są liczone WZGLĘDEM POZIOMU MORZA (SEA_LEVEL
// w config.js): 0 = brzeg morza, 10 = 10 bloków nad morzem.
// Plan rozdziału: docs/generator-terenu.md
// ------------------------------------------------------------

// Skale pól w blokach (większa = większe plamy, łagodniejsze zmiany).

export const SCALES = {
    continent: 2600,
    relief: 1500,
    erosion: 650,
    ridges: 260,
    peaks: 900,
    hills: 90,
    bumps: 24,
    basins: 650,
    plateaus: 520,
    gullies: 34,
    crags: 9,
    depressions: 420,
    warp: 520,
    temperature: 3200,
    humidity: 1900
};

// Jak mocno wykrzywiamy pola kontynentu i wypiętrzenia (w blokach) -
// dzięki temu brzegi i pasma górskie nie są "okrągłymi plamami".
export const WARP_STRENGTH = 160;


// PROFIL KONTYNENTU: wysokość nad morzem zależnie od kontynentalności
// (-1 = otwarte morze, 1 = środek lądu). Między wierszami - płynnie.

export const CONTINENT_PROFILE = [
    [-1.00, -30],
    [-0.60, -26],   // głębokie morze
    [-0.42, -14],
    [-0.32, -5],    // szelf (płytkie morze przy brzegu)
    [-0.26, -1],
    [-0.22, 1],     // wybrzeże
    [-0.10, 3],
    [0.20, 6],      // niziny
    [0.60, 9],
    [1.00, 11]      // niziny w głębi lądu
];


// MAKROFORMY: gdzie zaczynają się wyżyny i góry (wartość pola
// wypiętrzenia, -1..1; w głębi lądu trochę łatwiej o wypiętrzenie).

export const UPLAND_FROM = 0.05;      // wyżyny od ...
export const UPLAND_FULL = 0.30;      // ... do pełnej wysokości wyżyny
export const MOUNTAINS_FROM = 0.35;   // góry od ...
export const MOUNTAINS_FULL = 0.62;   // ... do pełnych gór

// Ile bloków ponad niziny podnoszą się wyżyny.
export const UPLAND_HEIGHT = 17;

// Góry: podnóże (ponad wyżyny/niziny) i grzbiety ponad podnóże.
// Najwyższe szczyty: około CONTINENT + UPLAND + MOUNTAIN_BASE + MOUNTAIN_RIDGE.
export const MOUNTAIN_BASE = 12;
export const MOUNTAIN_RIDGE = 46;


// FORMY WYPUKŁE

// Wzgórza: wysokość falowania na nizinach, wyżynach i w górach.
export const HILLS = { lowland: 3, upland: 6, mountains: 9 };

// Pagórki: drobne garby (głównie na nizinach).
export const HILLOCK_HEIGHT = 1.6;

// Turnie: skalne iglice na najwyższych grzbietach.
export const CRAG_HEIGHT = 9;


// FORMY WKLĘSŁE

// Kotliny: płaskie, obniżone dno otoczone górami. Próg pola kotlin
// (0-1; wyżej = rzadziej).
export const BASIN_FROM = 0.40;
export const BASIN_FULL = 0.62;

// Żleby: rynny na stromych zboczach gór.
export const GULLY_DEPTH = 3;
export const GULLY_EDGE = 0.90;

// Depresje: suche obniżenia poniżej poziomu morza na nizinach,
// z dala od morza (jak Żuławy). Głębokość pod poziomem morza.
export const DEPRESSION_DEPTH = 3;
export const DEPRESSION_FROM = 0.45;
export const DEPRESSION_FULL = 0.70;


// FORMY PŁASKIE

// Równiny: im większa erozja, tym bardziej płasko (od / do).
export const PLAIN_FROM = 0.05;
export const PLAIN_FULL = 0.45;

// Płaskowyże: wyżyny o płaskim wierzchu i stromych krawędziach
// (jak Góry Stołowe) - teren układa się w stopnie o tej wysokości.
export const PLATEAU_FROM = 0.25;
export const PLATEAU_FULL = 0.45;
export const PLATEAU_STEP = 7;


// POWIERZCHNIA

// Powyżej tej wysokości (nad morzem, ± kilka bloków) - goła skała.
export const ROCK_LINE = 46;

// Od jakiej różnicy wysokości między sąsiednimi kolumnami zbocze
// jest skalne (urwiska, strome zbocza).
export const ROCK_SLOPE = 3;

// Plaża: piasek do tylu bloków nad morzem (pas tuż przy morzu).
export const BEACH_HEIGHT = 2;

// Wydmy: piaszczyste pagórki na niektórych płaskich wybrzeżach (biom
// "Plaża i wydmy"). Pas wybrzeża, w którym mogą być: profil kontynentu
// (wysokość nad morzem bez wzgórz) od zone[0] do zone[1] bloków; plamy
// wybrzeży z wydmami - pole o skali patchScale, powyżej patch;
// wysokość wydm do height bloków, pojedyncza wydma ~scale bloków.
export const DUNES = {
    zone: [0.4, 3.2],
    patchScale: 900,
    patch: 0.15,
    height: 5,
    scale: 22
};


// PODZIAŁ WYSOKOŚCIOWY (do opisu i mapy; bloki nad morzem):
// nizina < RELIEF_UPLAND <= wyżyna < RELIEF_MOUNTAINS <= góry
export const RELIEF_UPLAND = 15;
export const RELIEF_MOUNTAINS = 32;


// ------------------------------------------------------------
// BUDOWA GEOLOGICZNA (Geology.js) - jakie skały są pod ziemią.
//
// Tu wysokości to zwykłe y w świecie (0 = dno świata), chyba że
// opis mówi "pod powierzchnią". Od dołu:
//
//   bazalt  - najgłębsze podłoże,
//   granit  - podłoże pod całym lądem; pod górami podchodzi pod samą
//             powierzchnię (granitowe szczyty i turnie),
//   kamień  - zwykła skała między granitem a warstwami,
//   warstwy - skały osadowe pod glebą; jakie, zależy od miejsca
//             (STRATA): wapień na wyżynach, piaskowiec na nizinach
//             i wybrzeżach, łupek w górach, bazalt pod głębokim morzem.
// ------------------------------------------------------------

// Bazalt: do tej wysokości (± 2).
export const BASALT_TOP = 4;

// Wierzch granitu pod nizinami i pod wyżynami (± GRANITE_VARIATION).
export const GRANITE_LOW = 16;
export const GRANITE_UPLAND = 24;
export const GRANITE_VARIATION = 6;

// Pod górami granit jest tyle bloków pod powierzchnią
// (± GRANITE_MOUNTAIN_VARIATION). Gdzie wychodzi mniej niż 0 -
// granit jest na wierzchu.
export const GRANITE_MOUNTAIN_DEPTH = 2;
export const GRANITE_MOUNTAIN_VARIATION = 8;

// Warstwy skał osadowych sięgają tyle bloków pod powierzchnię
// (± COVER_VARIATION); niżej jest zwykły kamień.
export const COVER_DEPTH = 22;
export const COVER_VARIATION = 8;

// Grubość jednej warstwy (bloki) i jak bardzo warstwy są pofalowane
// (o ile bloków w górę i w dół).
export const STRATA_THICKNESS = 4;
export const STRATA_WARP = 6;

// W górach warstwy są pofałdowane - o tyle bloków w górę i w dół.
export const STRATA_FOLDS = 30;

// Z jakich skał są warstwy w danym miejscu (udziały, sumują się do 1).
// Między miejscami (np. nizina -> wyżyna) skały zmieniają się płynnie,
// warstwa po warstwie.
export const STRATA = {
    lowland: { stone: 0.55, sandstone: 0.45 },
    coast: { sandstone: 0.8, stone: 0.2 },
    upland: { limestone: 0.65, stone: 0.2, sandstone: 0.15 },
    plateau: { sandstone: 0.5, limestone: 0.5 },
    mountains: { slate: 0.6, stone: 0.4 },
    ocean: { basalt: 0.55, stone: 0.45 }
};

// Lepidolit: rzadkie żyły (cienkie, powyginane płyty) tylko w granicie.
//   SCALE        - jak bardzo żyły się wyginają (bloki),
//   WIDTH        - grubość żyły (więcej = grubsze),
//   POCKET_SCALE - wielkość obszarów, w których żyły w ogóle są,
//   POCKET       - próg tych obszarów (więcej = rzadziej),
//   MIN_DEPTH    - płycej niż tyle bloków pod powierzchnią żyła jest
//                  tylko tam, gdzie pole wychodni > OUTCROP (rzadko).
export const LEPIDOLITE = {
    SCALE: 11,
    WIDTH: 0.045,
    POCKET_SCALE: 48,
    POCKET: 0.45,
    MIN_DEPTH: 3,
    OUTCROP: 0.3
};


// ROŚLINY NA TRAWIE (trawa, kwiaty, paprocie, zioła). Szanse to część
// kolumn z trawą, na których coś rośnie (0.3 = 30%). [a, b] - od
// najrzadszego do najgęstszego miejsca pola.

export const PLANTS = {

    // Łąki: pole o plamach `meadowScale` bloków - od rzadkiej trawy
    // do gęstej łąki; część trawy jest wysoka (więcej na gęstej łące).
    meadowScale: 36,
    grass: [0.08, 0.55],
    tallGrass: [0.08, 0.5],

    // Kępy kwiatów: tam, gdzie pole kwiatów > flowerThreshold. Gatunek
    // zmienia się wolno (plamy flowerSpeciesScale), więc kępa jest
    // zwykle jednego koloru.
    flowerScale: 22,
    flowerThreshold: 0.3,
    flowerDensity: 0.85,
    flowerSpeciesScale: 80,
    flowerMix: 0.12,

    // Paprocie - w wilgotnym klimacie (wilgotność > fernHumidity)
    // i wyżej, na pogórzach.
    fern: 0.12,
    fernHumidity: -0.1,

    // Pojedyncze zioła i mniszki - wszędzie po trochu.
    clover: 0.02,
    plantain: 0.01,
    nettle: 0.012,
    dandelion: 0.006,

    // Krzaki owocowe (truskawka, jeżyna, papryczka chili, leszczyna): zarośla
    // tam, gdzie pole krzaków > bushThreshold (plamy bushScale
    // bloków); w środku zarośli najwyżej bushDensity kolumn ma krzak.
    // Gatunek zmienia się co ~bushSpeciesScale bloków.
    bushScale: 26,
    bushThreshold: 0.45,
    bushDensity: 0.13,
    bushSpeciesScale: 140,

    // Etap dzikiego krzaka: losowa liczba 0-1 poniżej pierwszej
    // granicy = sadzonka, poniżej drugiej = krzak bez owoców, poniżej
    // trzeciej = kilka owoców, wyżej = pełen owoców.
    bushStages: [0.06, 0.3, 0.65]

};


// BIOMY (src/world/terrain/Biomes.js, docs/biomy.md) - gdzie jest
// który biom. Wysokości - bloki nad morzem.
//   edge, edgeScale  - poszarpanie granic biomów: o ile bloków (i jak
//                      drobno) przesuwa się miejsce sprawdzania klimatu,
//   duneBiome        - od jakiej "siły" pasa wydm jest biom plaży,
//   snowLine         - granica śniegu (bloki nad morzem); w ciepłym
//                      klimacie wyżej o snowWarm, pofalowana o snowWobble;
//                      snowCover bloków niżej śnieg leży już płatami,
//   rockyBelow       - skaliste góry od tylu bloków pod granicą gołej
//                      skały (ROCK_LINE),
//   mountainAbove, mountainField - od jakiej wysokości (albo pola gór)
//                      są góry: hala albo świerczyna,
//   alpineBelow      - hala zaczyna się tyle bloków pod granicą lasu,
//   alpineForest     - poniżej tej wartości pola lasów w górach jest
//                      hala (polana), wyżej las,
//   wetland...       - mokradła na nizinach (do wetlandAbove): przy
//                      rzece i jeziorze w pasie wetlandReach bloków (od
//                      suchego do wilgotnego klimatu), w depresjach
//                      i w wilgotnych plamach (pole o skali wetlandScale),
//   forestFrom, forestHumid - las tam, gdzie pole lasów > forestFrom -
//                      forestHumid x wilgotność (inaczej łąka),
//   forestMix, forestScale - jak bardzo przeplatają się rodzaje lasu
//                      (plamy szumu o tej skali).
export const BIOME_SHAPE = {
    edge: 10,
    edgeScale: 40,
    duneBiome: 0.35,
    snowLine: 58,
    snowWarm: 6,
    snowWobble: 3,
    snowCover: 5,
    rockyBelow: 2,
    mountainAbove: 30,
    mountainField: 0.55,
    alpineBelow: 2,
    alpineForest: -0.25,
    wetlandAbove: 12,
    wetlandReach: [4, 16],
    wetlandScale: 90,
    wetlandDepression: 0.3,
    wetlandHumidity: 0.35,
    wetlandPatch: 0.45,
    forestFrom: 0.02,
    forestHumid: 0.12,
    forestMix: 0.35,
    forestScale: 420
};


// LASY I DRZEWA (src/world/trees/Forests.js, docs/drzewa.md).
//
// Drzewa stoją na siatce co `grid` bloków (najwyżej jedno w kratce,
// w losowym miejscu kratki). Kratka ma drzewo z szansą = gęstość lasu
// w tym miejscu:
//   - pole lasów (plamy `scale` bloków): poniżej `from` - łąki
//     (tylko pojedyncze drzewa: `lone`), powyżej `full` - gęsty las
//     (`dense` kratek z drzewem),
//   - w suchym klimacie lasy są rzadsze (`dry` - mnożnik przy
//     najsuchszym), w wilgotnym gęstsze (`wet`),
//   - drzewa rosną do `treeLine` bloków poniżej granicy gołej skały,
//     ostatnie `treeLineFade` bloków coraz rzadziej,
//   - tylko na trawie i na zboczach o nachyleniu najwyżej `maxSlope`.
// Gatunek: z gatunków biomu (Biomes.js - trees) i plam gatunków
// (`speciesScale` bloków - w lesie przeważa jeden, dwa gatunki; `patches`
// - jak bardzo plamy zmieniają udziały gatunków biomu).
export const FORESTS = {
    grid: 4,
    scale: 190,
    from: -0.15,
    full: 0.4,
    dense: 0.5,
    lone: 0.012,
    dry: 0.45,
    wet: 1.1,
    treeLine: 4,
    treeLineFade: 10,
    maxSlope: 2,
    speciesScale: 150,
    patches: 0.9
};
// RZEKI I JEZIORA (src/world/terrain/Rivers.js, docs/rzeki.md).
//
// Rzeki spływają po makrorzeźbie (teren bez wzgórz i pagórków) na
// zgrubnej siatce co `cell` bloków: z każdej kratki do najniższej
// sąsiedniej (najbardziej stromo w dół). Zaczynają się w źródłach
// (najwyżej jedno na `sourceSpacing` x `sourceSpacing` bloków, szansa
// rośnie z wysokością: `sourceChance` - od nizin do gór) i kończą
// w morzu albo w jeziorze. Zagłębienie bez odpływu wypełnia się wodą do
// poziomu przelewu (jezioro, najwyżej `lakeMaxCells` kratek) - rzeka
// wypływa z niego dalej; płytsze niż `lakeMinDepth` bloków rzeka
// przecina bez jeziora. Rzeka dłuższa niż `maxLength` bloków (w linii
// prostej od źródła) się nie tworzy - jej źródło jest pomijane.
//
// Koryto: połowa szerokości od `halfWidth[0]` (źródło) do
// `halfWidth[1]` (po połączeniu wielu dopływów: + `widthPerSource`
// x pierwiastek z liczby źródeł), głębokość `depth` (+ część
// szerokości), woda `waterBelow` bloków pod okolicznym terenem. Brzegi
// i dolina: teren opada do wody najwyżej `bankSlope` (niziny .. góry)
// bloku na blok, na `bank` blokach od koryta wzgórza się wygładzają.
// Na płaskim rzeka meandruje (do `meander` bloków w bok, zakręty co
// ~`meanderScale` bloków), na spadkach płynie prosto.
// Nurt: `flow` [najwolniej, najszybciej] bloków na sekundę - zależy od
// spadku (`flowSlope` - ile szybciej na blok spadku na blok drogi).
export const RIVERS = {
    cell: 16,
    sourceSpacing: 352,
    sourceChance: [0.25, 0.85],
    maxLength: 6144,
    minLength: 12,
    lakeMaxCells: 700,
    lakeMinDepth: 4,
    halfWidth: [1.6, 4.5],
    widthPerSource: 0.75,
    depth: 1.5,
    waterBelow: 1.5,
    bankSlope: [0.4, 1.1],
    bank: 26,
    meander: 14,
    meanderScale: 70,
    meanderSlope: [0.004, 0.03],
    flow: [0.6, 3.2],
    flowSlope: 45
};

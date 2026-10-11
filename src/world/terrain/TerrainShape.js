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
//     wąwozy, żleby, turnie, depresje,
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
    ravines: 170,
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

// Wąwozy: wąskie, głębokie rozcięcia wyżyn. Głębokość i jak wąskie
// (próg 0-1: bliżej 1 = węższe i rzadsze).
export const RAVINE_DEPTH = 9;
export const RAVINE_EDGE = 0.94;

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

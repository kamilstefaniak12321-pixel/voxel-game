// ------------------------------------------------------------
// LISTA OSIĄGNIĘĆ
//
// Każde osiągnięcie to jeden wpis niżej. Nowa rzecz w grze = nowe
// osiągnięcie: dopisz wpis, a jeśli potrzebuje nowego zdarzenia -
// wywołaj je w grze (game.achieve('nazwa', dane) - patrz
// docs/osiagniecia.md).
//
// Pola:
//   id       - nazwa w zapisie (nie zmieniać po wydaniu - inaczej
//              gracze stracą to osiągnięcie)
//   tier     - ranga: 'common', 'rare', 'epic', 'legendary' (TIERS)
//   title    - tytuł
//   task     - co trzeba zrobić (widać w księdze przed zdobyciem,
//              chyba że osiągnięcie jest sekretne)
//   comment  - żartobliwy komentarz po zdobyciu
//   icon     - ikonka: nazwa bloku albo przedmiotu
//   secret   - true: przed zdobyciem w księdze tylko "???"
//
// Kiedy się zdobywa (jedno z dwóch):
//   on: 'zdarzenie', when(dane, book) - przy zdarzeniu z gry
//       (when zwraca true = zdobyte; bez when - zawsze),
//   check(game, book)                 - sprawdzane co pół sekundy
//                                       w trakcie gry.
//
// book.count(klucz, ile) i book.collect(klucz, wartość) liczą postęp
// (zapisywany razem z osiągnięciami) - patrz AchievementBook.js.
// ------------------------------------------------------------

import { WORLD_BORDER } from '../config.js';

import { getBlockDefinition, isOpaqueId } from '../blocks/BlockRegistry.js';

import { BASE_TREE_NAMES } from '../blocks/trees.js';
import { WORLD_TREE_NAMES } from '../blocks/treeCatalog.js';
import { getTool } from '../items/ItemRegistry.js';
import { TEAS, isDrink } from '../items/foods.js';

import { TREE_DEFINITIONS } from '../blocks/treeCatalog.js';

import { getPlantPack } from '../blocks/plantPacks.js';

import { BIOMES, LAND_BIOMES } from '../world/terrain/Biomes.js';


// Rangi: nazwa, punkty, kolor (do księgi i powiadomień - także
// w src/ui/achievements.css), dźwięk powiadomienia.

export const TIERS = {
    common: { name: 'Zwykłe', points: 10, color: '#cfd6dc', sound: 'achievement_common' },
    rare: { name: 'Rzadkie', points: 25, color: '#57a9ff', sound: 'achievement_rare' },
    epic: { name: 'Bardzo rzadkie', points: 50, color: '#c27bff', sound: 'achievement_epic' },
    legendary: { name: 'Legendarne', points: 100, color: '#ffb52e', sound: 'achievement_legendary' }
};

export const TIER_ORDER = ['common', 'rare', 'epic', 'legendary'];


// Budulec, który różnie odbija światło (BlockRegistry.js) - do
// "Projektanta wnętrz".

const BUILDING_BLOCKS = ['lime_plaster', 'ochre_plaster', 'terracotta', 'polished_stone', 'dark_planks'];


// Owoce z krzaków - do "Pełnych koszy".

const FRUITS = ['strawberry', 'blackberry', 'chili_pepper', 'hazelnut', 'blueberry'];

// Osiągnięcie "Komplet narzędzi": siekiera, kilof i łopata.
// Pogoda, która przyszła sama (nie z komendy /pogoda).
function naturalWeather(game) {
    return Boolean(game.weather?.ready) && game.weather.field.forced.length === 0 && game.rainOverride === null &&
        game.weather.field.tempOverride == null && game.weather.field.aridOverride == null;
}

// Piorun, który przed chwilą uderzył w ziemię nie dalej niż `reach`
// bloków od gracza (burza, która przyszła sama).
function strikeNearby(game, reach) {

    const thunder = game.thunder;
    const last = thunder?.lastGround;

    return Boolean(last) && last.natural && last.distance <= reach &&
        thunder.now >= last.time && thunder.now - last.time < 3;

}

export const TOOL_SET = ['axe', 'pickaxe', 'shovel'];

// Jadalne plony drzew z dalekich stron (1.10.0) - osiągnięcie "Smaki dalekich stron".
// Owoce krzewów jagodowych (1.17.0) - do "Jagodowego ogrodu".
const SHRUB_FRUITS = ['aronia', 'redcurrant', 'blackcurrant', 'gooseberry', 'red_gooseberry', 'raspberry', 'yellow_raspberry',
    'rose_hip', 'elderberry', 'sea_buckthorn_berry'];

// Ile jest potraw z garnka (1.20.0, items/cookingData.js) - do "Kuchmistrza".
const COOKED_DISHES = 6;

// Owoce roślin niskich z lasu i bagna (1.19.0) - do "Runa leśnego".
const LOW_BERRIES = ['cranberry', 'lingonberry', 'wild_strawberry'];

const WORLD_FRUITS = ['banyan_fig', 'baobab_fruit', 'dragon_tree_berries', 'joshua_tree_flowers', 'araucaria_nuts', 'coconut_palm_kokos'];


// Ile jest rodzajów naparów - do "Zielarza".

const TEA_KINDS = Object.keys(TEAS).length;


// Biom, w którym stoi gracz (teren realistyczny; klasyczny - null).
// Liczony najwyżej raz na BIOME_CHECK_MS (sprawdza go kilka osiągnięć).

const BIOME_CHECK_MS = 400;

function currentBiome(game) {

    const generator = game.world?.generator;

    if (!generator?.biomeAt) {
        return null;
    }

    const now = performance.now();

    const cache = game.achievementBiome;

    if (cache && now - cache.time < BIOME_CHECK_MS) {
        return cache.key;
    }

    // Dane przyjeżdżają razem z blokami. Ponowny compute() na głównym
    // wątku odtwarzałby kosztowną sieć rzek mimo generowania w workerze.
    const key = game.world.biomeAt(Math.floor(game.player.pos.x), Math.floor(game.player.pos.z));

    game.achievementBiome = { time: now, key };

    return key;

}


// Owoce drzew ze wspólnego katalogu - zbiór z odmian liści.

const TREE_FRUIT = TREE_DEFINITIONS.flatMap((pack) =>
    pack.variants.filter((variant) => variant.harvest).map((variant) => variant.harvest.item)
);

const ORCHARD = TREE_FRUIT.length === 0 ? [] : [{
    id: 'orchard',
    tier: 'common',
    title: 'Sadownik',
    task: 'Zbierz owoce z drzewa owocowego (PPM na liściach z owocami).',
    comment: 'Jabłko pada niedaleko od jabłoni. Tym razem - prosto do kieszeni.',
    icon: TREE_FRUIT[0],
    on: 'harvested',
    when: (data) => getBlockDefinition(data.type)?.tree !== undefined && TREE_FRUIT.includes(data.item)
}];


// Amarantus z paczki roślin (assets/rosliny/amarantus) - osiągnięcie jest,
// gdy paczka jest w grze.

const AMARANTH = getPlantPack('amarantus')?.item ? [{
    id: 'amaranth',
    tier: 'common',
    title: 'Wyższy od ciebie',
    task: 'Zetnij nożem wiechy z dojrzałego amarantusa (rośnie kępami na łąkach, ma 2 bloki wysokości).',
    comment: 'Dwa metry rośliny, a najładniejsze i tak zwisa do samej ziemi.',
    icon: 'amarantus_wiecha',
    on: 'harvested',
    when: (data) => data.item === 'amarantus_wiecha'
}] : [];

// Kocanka piaskowa (assets/rosliny/kocanka) - mała kępka z pikseli.

const EVERLAST = getPlantPack('kocanka')?.item ? [{
    id: 'everlast',
    tier: 'common',
    title: 'Nieśmiertelnik',
    task: 'Zetnij nożem bukiet z kwitnącej kocanki (niska, srebrzysta kępka na piasku w borach i na plażach).',
    comment: 'Zasuszona nie traci koloru - stąd druga nazwa: nieśmiertelnik.',
    icon: 'kocanka_bukiet',
    on: 'harvested',
    when: (data) => data.item === 'kocanka_bukiet'
}] : [];

// Lawenda (assets/rosliny/lawenda) - krzaczek z pikseli z kłosami.

const LAVENDER = getPlantPack('lawenda')?.item ? [{
    id: 'lavender',
    tier: 'common',
    title: 'Zapach lata',
    task: 'Zetnij nożem bukiet z kwitnącej lawendy (krzaczki z fioletowymi kłosami na łąkach i halach).',
    comment: 'Mole uciekają, pszczoły się zlatują, a szafa pachnie jak u babci.',
    icon: 'lawenda_bukiet',
    on: 'harvested',
    when: (data) => data.item === 'lawenda_bukiet'
}] : [];

// Piwonia (assets/rosliny/piwonia) - krzak z pomponami kwiatów.

const PEONY = getPlantPack('piwonia')?.item ? [{
    id: 'peony',
    tier: 'common',
    title: 'Róża bez kolców',
    task: 'Zetnij nożem kwiat z kwitnącej piwonii (krzaki z różowymi kwiatami na skrajach lasów liściastych i w brzezinach).',
    comment: 'Pachnie prawie jak róża, a nie kłuje. W sam raz do wazonu.',
    icon: 'piwonia_kwiat',
    on: 'harvested',
    when: (data) => data.item === 'piwonia_kwiat'
}] : [];

// Zawilec (assets/rosliny/zawilec) - wiosenny kwiat lasów liściastych.

const ANEMONE = getPlantPack('zawilec')?.item ? [{
    id: 'anemone',
    tier: 'common',
    title: 'Pierwszy zwiastun',
    task: 'Zetnij nożem kwiat z kwitnącego zawilca (niskie kępki z brzoskwiniowymi kwiatami w buczynach i lasach liściastych).',
    comment: 'Zakwitł, zanim drzewa rozwinęły liście. Pośpiech się opłacił.',
    icon: 'zawilec_kwiat',
    on: 'harvested',
    when: (data) => data.item === 'zawilec_kwiat'
}] : [];

// Dzwonek gołębi (assets/rosliny/dzwonek) - zwisające dzwonki.

const BELLFLOWER = getPlantPack('dzwonek')?.item ? [{
    id: 'bellflower',
    tier: 'common',
    title: 'Kto dzwoni?',
    task: 'Zetnij nożem kwiat z kwitnącego dzwonka gołębiego (zwisające, liliowe dzwonki na halach i w skalistych górach).',
    comment: 'Dzwonki nie dzwonią. Sprawdzone trzy razy.',
    icon: 'dzwonek_kwiat',
    on: 'harvested',
    when: (data) => data.item === 'dzwonek_kwiat'
}] : [];

// Szałwia (assets/rosliny/szalwia) - zioło z kłosami w okółkach.

const SAGE = getPlantPack('szalwia')?.item ? [{
    id: 'sage',
    tier: 'common',
    title: 'Ogródek zielarza',
    task: 'Zetnij nożem liście z kwitnącej szałwii (szarozielone krzaczki z fioletowymi kłosami na łąkach i w skalistych górach).',
    comment: 'Do herbaty, do pieczeni, do płukania gardła. Szałwia nie wybrzydza.',
    icon: 'szalwia_lisc',
    on: 'harvested',
    when: (data) => data.item === 'szalwia_lisc'
}] : [];

// Nagietek (assets/rosliny/nagietek) - pomarańczowe koszyczki.

const MARIGOLD = getPlantPack('nagietek')?.item ? [{
    id: 'marigold',
    tier: 'common',
    title: 'Słoneczko',
    task: 'Zetnij nożem kwiat z kwitnącego nagietka (pomarańczowe koszyczki na łąkach i plażach).',
    comment: 'Otwiera się rano, zamyka wieczorem. Ma lepszy rytm dnia niż niejeden gracz.',
    icon: 'nagietek_kwiat',
    on: 'harvested',
    when: (data) => data.item === 'nagietek_kwiat'
}] : [];

// Cynia (assets/rosliny/cynia) - pełne, koralowe kwiaty z pięter płatków.

const ZINNIA = getPlantPack('cynia')?.item ? [{
    id: 'zinnia',
    tier: 'common',
    title: 'Piętrowy kwiat',
    task: 'Zetnij nożem kwiat z kwitnącej cynii (koralowe kwiaty na prostych łodygach w brzezinach i na łąkach).',
    comment: 'Piętro na piętrze płatków. Cynia nie zna umiaru - i dobrze.',
    icon: 'cynia_kwiat',
    on: 'harvested',
    when: (data) => data.item === 'cynia_kwiat'
}] : [];

// Mikołajek (assets/rosliny/mikolajek) - kolczaste, niebieskie główki.

const SEA_HOLLY = getPlantPack('mikolajek')?.item ? [{
    id: 'sea_holly',
    tier: 'common',
    title: 'Kłujący błękit',
    task: 'Zetnij nożem kwiat z kwitnącego mikołajka (niebieskie główki na gwiazdach kolców, na plażach i w skalistych górach).',
    comment: 'Niebieski, kłujący i dumny z tego. Nie przytulać.',
    icon: 'mikolajek_kwiat',
    on: 'harvested',
    when: (data) => data.item === 'mikolajek_kwiat'
}] : [];

// Barwinek (assets/rosliny/barwinek) - dywan kwiatów łączący się z sąsiadami.

const PERIWINKLE = getPlantPack('barwinek')?.item ? [{
    id: 'periwinkle',
    tier: 'common',
    title: 'Dywan z kwiatów',
    task: 'Zetnij nożem kwiat z kwitnącego barwinka (płoży się po ziemi i łączy w dywany kwiatów w lasach liściastych, buczynach i na łąkach).',
    comment: 'Barwinek nie rośnie sam - rozkłada się, łączy z sąsiadami i robi z lasu salon.',
    icon: 'barwinek_kwiat',
    on: 'harvested',
    when: (data) => data.item === 'barwinek_kwiat'
}] : [];

// Len (assets/rosliny/len) - kwitnie, przekwita, zbiór z suchego.

const FLAX = getPlantPack('len')?.item ? [{
    id: 'flax',
    tier: 'common',
    title: 'Lniana robota',
    task: 'Zetnij nożem wiązkę z dojrzałego, suchego lnu (najpierw kwitnie na niebiesko - hale i łąki).',
    comment: 'Najpierw błękitne kwiaty, potem złote łodygi. Do lnianej koszuli jeszcze trochę brakuje.',
    icon: 'len_wiazka',
    on: 'harvested',
    when: (data) => data.item === 'len_wiazka'
}] : [];

// Gorczyca (assets/rosliny/gorczyca) - kwitnie na żółto, potem strąki.

const MUSTARD = getPlantPack('gorczyca')?.item ? [{
    id: 'mustard',
    tier: 'common',
    title: 'Ziarnko gorczycy',
    task: 'Zetnij nożem nasiona z gorczycy pełnej złotych strąków (żółto kwitnie w brzezinach i na łąkach).',
    comment: 'Najmniejsze z nasion, a roślina wyrosła większa niż one wszystkie razem.',
    icon: 'gorczyca_nasiona',
    on: 'harvested',
    when: (data) => data.item === 'gorczyca_nasiona'
}] : [];

// Porosty (assets/rosliny/porostoliwkowy, porostiglasty, ochra) i huba -
// rośliny na skałach i pniach.

const LICHEN_ITEMS = ['porostoliwkowy_plecha', 'porostiglasty_galazki', 'ochra_grudka'];

const LICHENS = getPlantPack('porostoliwkowy')?.item ? [{
    id: 'lichen',
    tier: 'common',
    title: 'Cierpliwość kamienia',
    task: 'Zbierz duży porost ze skały albo pnia (oliwkowy, iglasty albo żółtą ochrę).',
    comment: 'Rośnie kilka milimetrów na rok. Ten tutaj pamięta czasy, kiedy świat był jeszcze płaski.',
    icon: 'ochra_grudka',
    on: 'harvested',
    when: (data) => LICHEN_ITEMS.includes(data.item)
}] : [];

const BRACKET = getPlantPack('huba')?.item ? [{
    id: 'bracket_fungus',
    tier: 'common',
    title: 'Półka na pniu',
    task: 'Zbierz hubę ze starej, piętrowej huby na pniu drzewa (lasy liściaste i buczyny).',
    comment: 'Drzewo nie prosiło o półki. Dostało je i tak.',
    icon: 'huba_huba',
    on: 'harvested',
    when: (data) => data.item === 'huba_huba'
}] : [];

// Rośliny barwierskie (assets/rosliny/indygowiec, marzanna) - przyszłe
// barwniki: niebieski z liści indygowca, czerwony z korzeni marzanny.

const INDIGO = getPlantPack('indygowiec')?.item ? [{
    id: 'indigo',
    tier: 'common',
    title: 'Błękit z zieleni',
    task: 'Zetnij nożem liście z kwitnącego indygowca - rozłożystego krzewu z fioletowymi gronami (brzeziny, skraje łąk).',
    comment: 'Zielone liście, a w środku najgłębszy granat świata. Natura lubi niespodzianki.',
    icon: 'indygowiec_liscie',
    on: 'harvested',
    when: (data) => data.item === 'indygowiec_liscie'
}] : [];

const MADDER = getPlantPack('marzanna')?.item ? [{
    id: 'madder',
    tier: 'common',
    title: 'Czerwień spod ziemi',
    task: 'Wykop korzeń z kwitnącej marzanny barwierskiej (mokradła i lasy - szukaj kremowych kwiatków z czerwonym środkiem).',
    comment: 'Na górze skromne kwiatki, a pod ziemią cała czerwień. Marzanna zawsze była tajemnicza.',
    icon: 'marzanna_korzen',
    on: 'harvested',
    when: (data) => data.item === 'marzanna_korzen'
}] : [];


// "Złota godzina": słońce nisko nad horyzontem (wschód albo zachód),
// gracz patrzy prosto na nie i nic go nie zasłania.

function lookingAtLowSun(game) {

    const sun = game.sky.celestial.sunDirection;

    if (sun.y < 0 || sun.y > 0.12 || game.sky.space > 0.5) {
        return false;
    }

    const { yaw, pitch } = game.player;

    const look =
        -Math.sin(yaw) * Math.cos(pitch) * sun.x +
        Math.sin(pitch) * sun.y +
        -Math.cos(yaw) * Math.cos(pitch) * sun.z;

    return look > 0.95 && game.shadows?.light === 'sun' && game.sunVisibility > 0.5;

}


// "Promyk słońca": w dzień, pod dachem (nad głową jest pełny blok,
// więc nie widać nieba), a słońce świeci prosto na gracza - przez okno.

function inSunbeam(game) {

    if (game.sky.celestial.sunDirection.y < 0.08 || game.shadows?.light !== 'sun' || game.water.underwater) {
        return false;
    }

    if (game.sunVisibility < 0.8) {
        return false;
    }

    const eye = game.camera.position;

    const x = Math.floor(eye.x);
    const z = Math.floor(eye.z);

    for (let y = Math.floor(eye.y) + 1; y <= Math.floor(eye.y) + 24; y++) {

        if (isOpaqueId(game.world.getBlockId(x, y, z))) {
            return true;
        }

    }

    return false;

}


// Pień drzewa (każdy rodzaj pnia, także okorowany): gatunek albo null.

function logSpecies(type) {

    const definition = getBlockDefinition(type);

    return definition?.part === 'log' || definition?.part === 'stripped' ? definition.tree : null;

}


export const ACHIEVEMENTS = [

    // --------------------------------------------------------
    // ZWYKŁE
    // --------------------------------------------------------

    {
        id: 'first_break',
        tier: 'common',
        title: 'Od czegoś trzeba zacząć',
        task: 'Zniszcz pierwszy blok.',
        comment: 'Świat właśnie zrobił się o jeden blok mniejszy. Brawo... chyba.',
        icon: 'stone',
        on: 'blockBroken'
    },
    {
        id: 'first_place',
        tier: 'common',
        title: 'Architekt amator',
        task: 'Postaw pierwszy blok.',
        comment: 'Stoi. Krzywo, ale stoi.',
        icon: 'grass',
        on: 'blockPlaced'
    },
    {
        id: 'harvest',
        tier: 'common',
        title: 'Witaminki',
        task: 'Zbierz owoce z krzaka (PPM).',
        comment: 'Babcia byłaby dumna. Krzak trochę mniej.',
        icon: 'strawberry',
        on: 'harvested',
        when: (data) => FRUITS.includes(data.item)
    },
    ...ORCHARD,
    ...AMARANTH,
    ...EVERLAST,
    ...LAVENDER,
    ...PEONY,
    ...ANEMONE,
    ...BELLFLOWER,
    ...SAGE,
    ...MARIGOLD,
    ...ZINNIA,
    ...SEA_HOLLY,
    ...PERIWINKLE,
    ...FLAX,
    ...MUSTARD,
    ...LICHENS,
    ...BRACKET,
    ...INDIGO,
    ...MADDER,
    {
        id: 'plant',
        tier: 'common',
        title: 'Zielone palce',
        task: 'Posadź owoc, orzech albo szyszkę.',
        comment: 'Teraz najtrudniejsza część ogrodnictwa: czekanie.',
        icon: 'hazelnut',
        on: 'planted'
    },
    {
        id: 'lumberjack',
        tier: 'common',
        title: 'Drwal',
        task: 'Zetnij pień drzewa.',
        comment: 'Drzewo nawet nie zdążyło krzyknąć „uwaga!”.',
        icon: 'oak_log',
        on: 'blockBroken',
        when: (data) => logSpecies(data.type) !== null
    },
    {
        id: 'axe_chop',
        tier: 'common',
        title: 'Ostrze w ruch',
        task: 'W trybie przygody zetnij pień drzewa siekierą (idzie trzy razy szybciej niż ręką).',
        comment: 'Ręce bolą mniej. Drzewo - bardziej.',
        icon: 'axe',
        on: 'blockBroken',
        when: (data) => data.mode === 'adventure' && data.tool === 'axe' && logSpecies(data.type) !== null
    },
    {
        id: 'almost',
        tier: 'common',
        title: 'Prawie robi różnicę',
        task: 'W trybie przygody kop blok i puść przycisk, gdy jest już prawie rozbity.',
        comment: 'Blok odetchnął z ulgą. Na razie.',
        icon: 'stone',
        secret: true,
        on: 'miningAbandoned',
        when: (data) => data.progress >= 0.9
    },
    {
        id: 'first_craft',
        tier: 'common',
        title: 'Złota rączka',
        task: 'Wytwórz coś w ekwipunku (siatka 2 x 2 - E).',
        comment: 'Z dwóch desek cztery patyki. Matematyka się nie zgadza, ale działa.',
        icon: 'stick',
        on: 'crafted'
    },
    {
        id: 'carpenter',
        tier: 'common',
        title: 'Stolarz',
        task: 'Zrób coś na stole stolarskim (deski na lewą część blatu, PPM w wyrób).',
        comment: 'Schody do nieba to na razie schody do szopy. Ale zawsze.',
        icon: 'oak_stairs',
        on: 'carpentry'
    },
    {
        id: 'colored_lamp',
        tier: 'common',
        title: 'Kolorowe światła',
        task: 'Zrób kolorową lampę (lampa i coś w tym kolorze).',
        comment: 'Disco w jaskini. Nietoperze są zachwycone.',
        icon: 'lamp_purple',
        on: 'crafted',
        when: (data) => ['lamp_red', 'lamp_green', 'lamp_blue', 'lamp_purple'].includes(data.type)
    },
    {
        id: 'birch_bark',
        tier: 'common',
        title: 'Brzozowy papirus',
        task: 'Zdejmij siekierą korę z brzozy (PPM siekierą na pniu).',
        comment: 'Dawniej pisano na niej listy. Ty możesz napisać listę zakupów.',
        icon: 'birch_bark',
        on: 'stripped',
        when: (data) => data.item === 'birch_bark'
    },
    {
        id: 'swim',
        tier: 'common',
        title: 'Mokra robota',
        task: 'Popływaj w wodzie.',
        comment: 'Potwierdzone naukowo: woda jest mokra.',
        icon: 'water',
        check: (game) => game.player.swimming
    },
    {
        id: 'midnight',
        tier: 'common',
        title: 'Nocny marek',
        task: 'Bądź w świecie o północy.',
        comment: 'Porządni gracze już dawno śpią. Ty nie jesteś porządnym graczem.',
        icon: 'lamp',
        check: (game) => {
            const time = game.time.timeOfDay;
            return time < 0.01 || time > 0.99;
        }
    },
    {
        id: 'golden_hour',
        tier: 'common',
        title: 'Złota godzina',
        task: 'Popatrz prosto na zachodzące (albo wschodzące) słońce.',
        comment: 'Fotografowie nazywają to złotą godziną. Ty nazywasz to: jeszcze jeden blok i kończę.',
        icon: 'dandelion',
        check: (game) => lookingAtLowSun(game)
    },
    {
        id: 'blueberries',
        tier: 'common',
        title: 'Borówkowy język',
        task: 'Zbierz borówki z krzaka (rosną w borach i świerczynach).',
        comment: 'Język fioletowy, palce fioletowe, koszulka też. Było warto.',
        icon: 'blueberry',
        on: 'harvested',
        when: (data) => data.item === 'blueberry'
    },
    {
        id: 'shrub_fruit',
        tier: 'common',
        title: 'Prosto z krzewu',
        task: 'Zbierz owoce z krzewu jagodowego (np. maliny, porzeczki albo aronię).',
        comment: 'Połowa do koszyka, połowa do buzi. Koszyk nie protestuje.',
        icon: 'raspberry',
        on: 'harvested',
        when: (data) => String(data.type).startsWith('shrub_') && String(data.type).includes('_fruit')
    },
    {
        id: 'shrub_flowers',
        tier: 'common',
        title: 'Zapach czerwca',
        task: 'Zerwij płatki dzikiej róży albo kwiaty bzu czarnego z kwitnącego krzewu.',
        comment: 'Krzew zakwitnie jeszcze raz. Owoców z tej gałązki już nie będzie - coś za coś.',
        icon: 'elderflower',
        on: 'harvested',
        when: (data) => data.item === 'rose_petals' || data.item === 'elderflower'
    },
    {
        id: 'shrub_planted',
        tier: 'common',
        title: 'Własny krzew',
        task: 'Posadź owoc krzewu jagodowego na rozgrzebanej ziemi.',
        comment: 'Teraz tylko poczekać. Krzew się nie spieszy, ty też nie musisz.',
        icon: 'redcurrant',
        on: 'planted',
        when: (data) => String(data.type).startsWith('shrub_') && String(data.type).includes('_sapling')
    },
    {
        id: 'composted',
        tier: 'common',
        title: 'Nic się nie marnuje',
        task: 'Użyźnij ziemię kompostem z zepsutego jedzenia (PPM kompostem na ziemi, trawie albo rozgrzebanej ziemi).',
        comment: 'Wczoraj kolacja, dziś czarnoziem, za rok maliny.',
        icon: 'compost',
        on: 'composted'
    },
    {
        id: 'field_composted',
        tier: 'common',
        title: 'Posypane z wierzchu',
        task: 'Posyp rozgrzebaną ziemię kompostem (PPM kompostem na polu).',
        comment: 'Rośliny nie pytają, co to było wcześniej. Po prostu rosną szybciej.',
        icon: 'tilled_compost',
        on: 'composted',
        when: (data) => data.into === 'tilled_compost'
    },
    {
        id: 'orchard_grown',
        tier: 'common',
        title: 'Dobrze przezimowały',
        task: 'Doczekaj wiosny, po której twoja roślina daje więcej owoców.',
        comment: 'Nic nie robiłeś przez całą zimę. One - wręcz przeciwnie.',
        icon: 'raspberry',
        on: 'orchard',
        when: (data) => data.grown > 0
    },
    {
        id: 'orchard_sapling',
        tier: 'rare',
        title: 'Samosiejka',
        task: 'Zostaw owoce na roślinie: opadną, a wiosną wyrośnie z nich sadzonka.',
        comment: 'Najlepszy ogrodnik to ten, który wie, kiedy nie zbierać.',
        icon: 'jablon_jablko',
        on: 'orchard',
        when: (data) => data.saplings > 0
    },
    {
        id: 'dried_fruit',
        tier: 'common',
        title: 'Na czarną godzinę',
        task: 'Ususz owoce na słońcu (wyrzuć je w dzień pod gołe niebo).',
        comment: 'Latem wydaje się to przesadą. Zimą - przezornością.',
        icon: 'dried_fruit',
        on: 'dried',
        when: (data) => data.type === 'dried_fruit'
    },
    {
        id: 'pot_cooked',
        tier: 'common',
        title: 'Coś na ciepło',
        task: 'Ugotuj potrawę w glinianym garnku nad ogniskiem.',
        comment: 'Woda, ogień i trochę cierpliwości. Reszta to już kuchnia.',
        icon: 'clay_pot',
        on: 'cooked'
    },
    {
        id: 'pot_all_dishes',
        tier: 'rare',
        title: 'Kuchmistrz',
        task: 'Ugotuj każdą z sześciu potraw.',
        comment: 'Garnek ten sam, a za każdym razem pachnie inaczej.',
        icon: 'dish_vegetable_stew',
        on: 'cooked',
        when: (data, book) => book.collect('dishes', data.dish) >= COOKED_DISHES,
        goal: { key: 'dishes', count: COOKED_DISHES }
    },
    {
        id: 'low_berries',
        tier: 'common',
        title: 'Runo leśne',
        task: 'Zbierz żurawinę, borówki brusznice i poziomki (PPM na roślinie z owocami).',
        comment: 'Wszystko rośnie przy samej ziemi. Kolana to zapamiętają.',
        icon: 'lingonberry',
        on: 'harvested',
        when: (data, book) => LOW_BERRIES.includes(data.item) && book.collect('low_berries', data.item) >= LOW_BERRIES.length,
        goal: { key: 'low_berries', count: LOW_BERRIES.length }
    },
    {
        id: 'low_planted',
        tier: 'common',
        title: 'Grządka',
        task: 'Posadź na rozgrzebanej ziemi żurawinę, brusznicę, poziomki, pestki dyni albo cukinię.',
        comment: 'Niskie to to, ale twoje.',
        icon: 'wild_strawberry',
        on: 'planted',
        when: (data) => String(data.type).startsWith('low_') && String(data.type).endsWith('_young')
    },
    {
        id: 'pumpkin_slices',
        tier: 'common',
        title: 'Dyniowe żniwa',
        task: 'Pokrój dynię na kawałki (dynia w siatce wytwarzania).',
        comment: 'Cztery kawałki i garść pestek na przyszły rok. Dynia myśli o wszystkim.',
        icon: 'pumpkin_slice',
        on: 'crafted',
        when: (data) => data.type === 'pumpkin_slice'
    },
    {
        id: 'hedgehog_met',
        tier: 'common',
        title: 'Nocny sąsiad',
        task: 'Spotkaj jeżyka - podejdź do niego na kilka kroków, gdy żeruje po zmierzchu.',
        comment: 'Mieszka w krzewie obok. Wychodzi, kiedy ty kładziesz się spać.',
        icon: 'raspberry',
        on: 'hedgehogMet'
    },
    {
        id: 'hedgehog_fed',
        tier: 'common',
        title: 'Z ręki',
        task: 'Nakarm jeżyka jagodami z ręki (PPM z owocami w dłoni; podejdź powoli).',
        comment: 'Mlask, mlask. Od teraz jesteś „ten z jagodami".',
        icon: 'blueberry',
        on: 'hedgehogFed'
    },
    {
        id: 'hedgehog_albino',
        tier: 'rare',
        title: 'Biały kruk wśród jeży',
        task: 'Spotkaj jeżyka albinosa.',
        comment: 'Kremowe kolce, czerwone oczka. Trafia się raz na kilkadziesiąt jeży.',
        icon: 'elderflower',
        on: 'hedgehogMet',
        when: (data) => data.variant === 'albino'
    },
    {
        id: 'texture_pack',
        tier: 'common',
        title: 'Nowe szaty',
        task: 'Zagraj z własną paczką tekstur (Ustawienia → Tekstury).',
        comment: 'Ten sam kamień, tylko w wyższej rozdzielczości. Dalej twardy.',
        icon: 'grass',
        on: 'texturePack'
    },

    // Samouczek (0.99.0, game/Tutorial.js): wszystkie kroki, bez wyłączania.
    {
        id: 'tutorial_done',
        tier: 'common',
        title: 'Już wiem, co i jak',
        task: 'Ukończ samouczek.',
        comment: 'Drewno, ogień, kolacja, sen. Reszta to już tylko szczegóły.',
        icon: 'fire_starter',
        on: 'tutorialDone'
    },
    // Życie w dziczy (0.98.1): jedzenie, uprawa, ognisko, sen, napary -
    // zdarzenia z game/GameInteraction.js, Campfires.js, Beds.js, Sleep.js.
    {
        id: 'first_meal',
        tier: 'common',
        title: 'Smacznego',
        task: 'Zjedz tyle, żeby zaliczyć posiłek.',
        comment: 'Brzuch przestał burczeć. Na jakieś pięć minut.',
        icon: 'jablon_jablko',
        on: 'ate',
        when: (data) => data.meal === true
    },
    {
        id: 'first_field',
        tier: 'common',
        title: 'Rolnik z przypadku',
        task: 'Rozgrzeb ziemię łopatą (PPM) - powstanie pole.',
        comment: 'Dziura w ziemi, ale twoja. I coś na niej wyrośnie.',
        icon: 'tilled_dirt',
        on: 'tilled'
    },
    {
        id: 'frozen_solid',
        tier: 'common',
        title: 'Sopel lodu',
        task: 'Zamarznij na kość - zimą, bez ognia i dachu nad głową.',
        comment: 'Wiosna przyszła po ciebie osobiście.',
        icon: 'snow',
        on: 'frozen'
    },
    {
        id: 'warmed_up',
        tier: 'common',
        title: 'Grzanie rąk',
        task: 'Zmarznięty ogrzej się przy ognisku.',
        comment: 'Najpierw palce, potem nos, na końcu humor.',
        icon: 'fire_starter',
        on: 'warmedUp'
    },
    {
        id: 'rescuer',
        tier: 'rare',
        title: 'Ratownik',
        task: 'W grze ze znajomymi bądź przy tym, jak zamarznięty gracz odtaje - rozpal przy nim ogień albo postaw pochodnię.',
        comment: 'Lepszy ciepły kumpel niż zimna wiosna.',
        icon: 'torch',
        on: 'rescued'
    },
    {
        id: 'rich_field',
        tier: 'common',
        title: 'Czarna bruzda',
        task: 'Rozgrzeb łopatą czarnoziem - na takim polu rośliny rosną szybciej.',
        comment: 'Ziemia tak dobra, że aż szkoda po niej chodzić.',
        icon: 'tilled_humus',
        on: 'tilled',
        when: (data) => data.into === 'tilled_humus'
    },
    {
        id: 'fruit_trait',
        tier: 'common',
        title: 'Owoc z charakterem',
        task: 'Zjedz owoc, który coś daje: dziką różę, żurawinę, brusznicę, aronię, rokitnik, czarną porzeczkę, czarny bez albo chili.',
        comment: 'Babcia miała rację. Jak zwykle.',
        icon: 'rose_hip',
        on: 'ate',
        when: (data) => data.kind === 'snack' && (data.effects?.length ?? 0) > 0
    },
    {
        id: 'first_roast',
        tier: 'common',
        title: 'Kolacja przy ognisku',
        task: 'Upiecz coś nad płonącym ogniskiem (trzymaj PPM z jedzeniem).',
        comment: 'Lekko przypalone. Czyli idealne.',
        icon: 'roasted_apple',
        on: 'roasted',
        when: (data) => !isDrink(data.into)
    },
    {
        id: 'bruised_leg',
        tier: 'common',
        title: 'Grawitacja działa',
        task: 'Stłucz nogę, spadając z wysokości.',
        comment: 'Ziemia była bliżej, niż się wydawało. A potem nagle bardzo blisko.',
        icon: 'stone',
        on: 'hurt'
    },
    {
        id: 'bed_made',
        tier: 'common',
        title: 'Pościelone',
        task: 'Pościel stelaż łóżka (PPM pościelą na stelażu).',
        comment: 'Mama mówiła, żeby ścielić łóżko. Nie mówiła, że najpierw trzeba je zbudować.',
        icon: 'oak_bed',
        on: 'bedMade'
    },
    {
        id: 'under_stars',
        tier: 'common',
        title: 'Pod gołym niebem',
        task: 'Prześpij noc na gołej ziemi.',
        comment: 'Gwiazdy piękne, kamień pod łopatką - mniej.',
        icon: 'short_grass',
        on: 'slept',
        when: (data) => data.place === 'ground' && data.hours >= 4
    },
    {
        id: 'first_tea',
        tier: 'common',
        title: 'Coś na rozgrzewkę',
        task: 'Wypij napar z ziół (kubek ziół podgrzany nad ogniskiem).',
        comment: 'Smakuje jak łąka. W dobrym sensie.',
        icon: 'tea_calm',
        on: 'ate',
        when: (data) => data.kind === 'drink'
    },

    // --------------------------------------------------------
    // RZADKIE
    // --------------------------------------------------------

    {
        id: 'builder',
        tier: 'rare',
        title: 'Murarz',
        task: 'Postaw 500 bloków.',
        comment: 'Pięćset bloków. Kręgosłup pamięta każdy z nich.',
        icon: 'granite',
        on: 'blockPlaced',
        when: (data, book) => book.count('placed', 1) >= 500,
        goal: { key: 'placed', count: 500 }
    },
    {
        id: 'deep_dive',
        tier: 'rare',
        title: 'Głębinowiec',
        task: 'Zanurkuj 10 bloków pod powierzchnię wody.',
        comment: 'Ryb brak, ale za to jest ciemno, mokro i trochę strasznie.',
        icon: 'gravel',
        check: (game) => game.water.depth >= 10
    },
    {
        id: 'high_flyer',
        tier: 'rare',
        title: 'Ponad chmurami',
        task: 'Wzleć na wysokość 1000 bloków.',
        comment: 'Stąd wszystko wygląda tak malutko. Ty też.',
        icon: 'lamp_blue',
        check: (game) => game.player.pos.y >= 1000
    },
    {
        id: 'meteor_witness',
        tier: 'rare',
        title: 'Naoczny świadek',
        task: 'Bądź najwyżej 60 bloków od miejsca, w które uderzy meteoryt.',
        comment: 'Spadło. Ty nie. Tym razem.',
        icon: 'basalt',
        on: 'meteorImpact',
        when: (data) => data.distance <= 60
    },
    {
        id: 'all_fruits',
        tier: 'rare',
        title: 'Pełne kosze',
        task: 'Zbierz owoce z każdego rodzaju krzaka.',
        comment: 'Truskawki, jeżyny, chili i orzechy. Dieta jak marzenie, zwłaszcza to chili.',
        icon: 'blackberry',
        on: 'harvested',
        when: (data, book) => FRUITS.includes(data.item) && book.collect('fruits', data.item) >= FRUITS.length,
        goal: { key: 'fruits', count: FRUITS.length }
    },
    {
        id: 'shrub_garden',
        tier: 'rare',
        title: 'Jagodowy ogród',
        task: 'Zbierz owoce wszystkich krzewów jagodowych: aronię, porzeczki czerwone i czarne, agrest zielony i czerwony, maliny czerwone i żółte, owoce dzikiej róży, bzu czarnego i rokitnika.',
        comment: 'Dziesięć smaków, od cierpkiej aronii po kwaśny rokitnik. Dżem zrobi się sam - w kieszeni.',
        icon: 'blackcurrant',
        on: 'harvested',
        when: (data, book) => SHRUB_FRUITS.includes(data.item) && book.collect('shrub_fruits', data.item) >= SHRUB_FRUITS.length,
        goal: { key: 'shrub_fruits', count: SHRUB_FRUITS.length }
    },
    {
        id: 'forester',
        tier: 'rare',
        title: 'Leśniczy',
        task: 'Zetnij pień każdego z sześciu gatunków drzew: świerka, sosny, buka, lipy, dębu i brzozy.',
        comment: 'Znasz już las od środka. Las ciebie też - i prosi o chwilę przerwy.',
        icon: 'spruce_log',
        on: 'blockBroken',
        when: (data, book) => {
            const species = logSpecies(data.type);
            return BASE_TREE_NAMES.includes(species) && book.collect('trees', species) >= BASE_TREE_NAMES.length;
        },
        goal: { key: 'trees', count: BASE_TREE_NAMES.length }
    },
    {
        id: 'world_trees',
        tier: 'epic',
        title: 'Drzewa świata',
        task: 'Zetnij pień każdego z trzynastu drzew z dalekich stron: jodły, baobabu, palmy kokosowej, modrzewia, namorzynu, puchowca, jukki, osiki, araukarii, figowca, draceny, cedru i sosny ościstej (/biom znajdz sawanna, pustynia, deszczowy, namorzyny).',
        comment: 'Od namorzynów po granicę śniegu. Paszport pełen słojów.',
        icon: 'baobab_log',
        on: 'blockBroken',
        when: (data, book) => {
            const species = logSpecies(data.type);
            return WORLD_TREE_NAMES.includes(species) && book.collect('world_trees', species) >= WORLD_TREE_NAMES.length;
        },
        goal: { key: 'world_trees', count: WORLD_TREE_NAMES.length }
    },
    // 1.10.0: owoce drzew z dalekich stron, namorzyn w wodzie, liście w porach roku.
    {
        id: 'world_fruits',
        tier: 'rare',
        title: 'Smaki dalekich stron',
        task: 'Zjedz figę, owoc baobabu, jagody draceny, kwiaty jukki, orzeszki araukarii i kokos (zbiera się je PPM z liści, na których rosną).',
        comment: 'Sześć smaków, sześć stref klimatycznych. Żołądek prosi o przewodnik.',
        icon: 'banyan_fig',
        on: 'ate',
        when: (data, book) => WORLD_FRUITS.includes(data.type) && book.collect('world_fruits', data.type) >= WORLD_FRUITS.length,
        goal: { key: 'world_fruits', count: WORLD_FRUITS.length }
    },
    {
        id: 'water_gardener',
        tier: 'rare',
        title: 'Ogrodnik przypływów',
        task: 'Posadź namorzyn w płytkiej wodzie (sadzonka albo siewka kliknięta w piaszczyste lub błotniste dno).',
        comment: 'Inni sadzą w ziemi. Ty postanowiłeś zaufać morzu.',
        icon: 'mangrove_propagule',
        on: 'blockPlaced',
        when: (data) => data.placed === 'mangrove_sapling_water'
    },
    {
        id: 'autumn_colors',
        tier: 'common',
        title: 'Złota jesień',
        task: 'Doczekaj jesieni: liście klonów czerwienieją, brzóz żółkną, dębów brązowieją - im dalej w jesień, tym mocniej.',
        comment: 'Drzewa zmieniają garderobę. Tobie zostaje ta sama koszula.',
        icon: 'maple_leaf_litter',
        on: 'season',
        when: (data) => data.key === 'jesien'
    },
    {
        id: 'first_frost',
        tier: 'common',
        title: 'Pierwszy szron',
        task: 'Doczekaj zimy: liście szarzeją, a w chłodnych stronach bieli je cienki śnieg.',
        comment: 'Cicho, biało i zimno w palce. Pogoda dopiero się rozkręca.',
        icon: 'spruce_leaves',
        on: 'season',
        when: (data) => data.key === 'zima'
    },
    // Pogoda (1.11.0): tylko ta, która przyszła sama - ustawiona komendą
    // /pogoda się nie liczy.
    {
        id: 'first_rain',
        tier: 'common',
        title: 'Pierwsze krople',
        task: 'Bądź w miejscu, nad które pogoda przyniosła deszcz (front albo przelotny opad).',
        comment: 'Prognoza mówiła: weź parasol. Ale parasoli jeszcze nie wymyślono.',
        icon: 'water',
        check: (game) => naturalWeather(game) && game.weather.local.rain > 0.15
    },
    {
        id: 'strong_wind',
        tier: 'common',
        title: 'Wiatr we włosach',
        task: 'Poczuj naprawdę silny wiatr - taki, jaki niesie front chłodny albo burza.',
        comment: 'Fryzura do poprawki. Kapelusz - gdybyś go miał - już trzy biomy dalej.',
        icon: 'dandelion',
        check: (game) => naturalWeather(game) && game.weather.wind.speed >= 6
    },
    {
        id: 'cloudless',
        tier: 'common',
        title: 'Ani jednej chmurki',
        task: 'Bądź w środku wyżu w biały dzień: nad tobą samo niebieskie niebo.',
        comment: 'Idealna pogoda na cokolwiek. Szkoda, że cokolwiek to znowu kopanie.',
        icon: 'lamp',
        check: (game) => {
            const local = game.weather?.local;
            return naturalWeather(game) && local.clear > 0.9 && local.low < 0.03 && local.mid < 0.03 &&
                local.high < 0.03 && game.sky.state.daylight > 0.9;
        }
    },
    {
        id: 'under_a_roof',
        tier: 'common',
        title: 'Niech sobie pada',
        task: 'Przeczekaj deszcz pod dachem, w jaskini albo pod gęstą koroną drzewa - tam krople nie dolatują.',
        comment: 'Dach: wynalazek, który docenia się dopiero w deszczu.',
        icon: 'oak_planks',
        check: (game) => naturalWeather(game) && game.weather.local.rain > 0.2 && (game.shelterCover ?? 0) > 0.85
    },
    {
        id: 'rainbow',
        tier: 'rare',
        title: 'Siedem kolorów',
        task: 'Zobacz tęczę: niskie słońce za plecami, deszcz przed tobą.',
        comment: 'Garnka złota na końcu nie ma. Sprawdzono. Dwa razy.',
        icon: 'lamp_blue',
        check: (game) => naturalWeather(game) && game.weather.rainbowOverride === null && game.weather.rainbow > 0.5
    },
    {
        id: 'morning_fog',
        tier: 'common',
        title: 'Mleko',
        task: 'Wejdź w gęstą poranną mgłę (zbiera się przed świtem przy czystym niebie i słabym wietrze, najczęściej jesienią).',
        comment: 'Widoczność: własne buty. I to tylko lewy.',
        icon: 'lamp',
        check: (game) => naturalWeather(game) && game.weather.fogOverride === null && game.weather.local.fog > 0.6
    },
    {
        id: 'lightning_seen',
        tier: 'common',
        title: 'Raz, dwa, trzy...',
        task: 'Bądź nie dalej niż kilometr od pioruna, który bije w ziemię - i policz sekundy do grzmotu (trzy sekundy to kilometr).',
        comment: 'Fizyka dźwięku w praktyce. Stanie pod drzewem w praktyce: zły pomysł.',
        icon: 'lamp_purple',
        check: (game) => naturalWeather(game) && strikeNearby(game, 1000)
    },
    {
        id: 'close_strike',
        tier: 'rare',
        title: 'O włos',
        task: 'Przeżyj uderzenie pioruna bliżej niż 50 bloków od siebie.',
        comment: 'Włosy stanęły dęba. To nie ze strachu, to elektrostatyka. Na pewno.',
        icon: 'fire_starter',
        check: (game) => naturalWeather(game) && strikeNearby(game, 50)
    },
    {
        id: 'hailstorm',
        tier: 'common',
        title: 'Kulki lodu',
        task: 'Wyjdź pod gołe niebo, gdy pada grad (krótko, w samym środku najsilniejszych burz).',
        comment: 'Darmowy lód do napojów. Dostawa prosto na głowę.',
        icon: 'snow',
        check: (game) => naturalWeather(game) && game.weather.hailOverride === null &&
            game.weather.local.hail > 0.3 && (game.shelterCover ?? 1) < 0.3
    },
    {
        id: 'first_snow',
        tier: 'common',
        title: 'Pierwszy śnieg',
        task: 'Bądź tam, gdzie pada śnieg - zimą, w chłodnych stronach świata albo wysoko w górach, gdy w dolinie pada deszcz.',
        comment: 'Złapany na język: smakuje jak chmura. Wiadomo.',
        icon: 'snow',
        check: (game) => naturalWeather(game) && (game.snowNow ?? 0) > 0.1
    },
    {
        id: 'blizzard',
        tier: 'rare',
        title: 'Zadymka',
        task: 'Wyjdź w śnieżycę: gęsty śnieg i wiatr od 6 bloków na sekundę.',
        comment: 'Widoczność: czubek własnego nosa. I to zamarznięty.',
        icon: 'snow',
        check: (game) => naturalWeather(game) && (game.snowNow ?? 0) > 0.35 && game.weather.wind.speed >= 6
    },
    {
        id: 'white_world',
        tier: 'common',
        title: 'Biało, bielutko',
        task: 'Stań pod gołym niebem tam, gdzie ziemię przykrył śnieg.',
        comment: 'Ślady na świeżym śniegu: jedyny dowód, że ktoś tu w ogóle wychodzi z domu.',
        icon: 'snow',
        check: (game) => naturalWeather(game) && game.weather.coverOverride === null &&
            game.weather.snowCover > 0.9 && (game.shelterCover ?? 1) < 0.3
    },
    {
        id: 'hoarfrost',
        tier: 'common',
        title: 'Srebrny poranek',
        task: 'Zobacz szron: osiada w mroźną, pogodną i cichą noc, a rano znika.',
        comment: 'Trawa chrupie pod butami. Drugie śniadanie też by się przydało.',
        icon: 'lamp_blue',
        check: (game) => naturalWeather(game) && game.weather.frostOverride === null && game.weather.frost > 0.6
    },
    {
        id: 'sandstorm',
        tier: 'common',
        title: 'Piasek w zębach',
        task: 'Znajdź się w burzy piaskowej: na pustyni, gdy mocno wieje (przed frontem chłodnym albo przy burzy).',
        comment: 'Chrupie. Darmowy peeling całego ciała w cenie.',
        icon: 'sand',
        check: (game) => naturalWeather(game) && game.weather.dustOverride == null && game.weather.dust > 0.6 &&
            (game.shelterCover ?? 1) < 0.5
    },
    {
        id: 'haboob',
        tier: 'rare',
        title: 'Ściana',
        task: 'Daj się połknąć ścianie pyłu (haboob), która idzie przez pustynię przed frontem chłodnym albo burzą.',
        comment: 'Najpierw horyzont zrobił się brązowy. Potem zniknął. Potem zniknęło wszystko.',
        icon: 'sand',
        check: (game) => naturalWeather(game) && game.weather.dustOverride == null && game.weather.dustWall > 0.6
    },
    {
        id: 'dust_devil',
        tier: 'rare',
        title: 'Diabełek',
        task: 'Wejdź w wir pyłowy - wstają nad pustynią w upalne, słoneczne i bezwietrzne popołudnia.',
        comment: 'Kręci się, szumi, sypie w oczy. Jak młodszy brat, tylko z piasku.',
        icon: 'dandelion',
        check: (game) => naturalWeather(game) && game.dustDevils && !game.dustDevils.nearestForced && game.dustDevils.nearest < 2.5
    },
    {
        id: 'sea_storm',
        tier: 'rare',
        title: 'Wilk morski',
        task: 'Bądź na otwartym morzu w czasie sztormu - na tratwie albo wpław.',
        comment: 'Fale jak domy. No, jak domki. Dobrze: jak pół bloku. Ale mokre!',
        icon: 'water',
        check: (game) => naturalWeather(game) && game.weather.seaOverride == null && game.weather.sea > 0.7 &&
            Boolean(game.rafts?.mounted || game.player?.swimming)
    },
    {
        id: 'head_in_clouds',
        tier: 'rare',
        title: 'Głowa w chmurach',
        task: 'Wleć w niską chmurę (podstawa chmur jest wysoko nad najwyższymi górami).',
        comment: 'Biało, mokro i nic nie widać. Dokładnie tak, jak mówili.',
        icon: 'lamp_blue',
        check: (game) => {
            const weather = game.weather;
            const above = game.camera.position.y - (weather?.base ?? Infinity);
            return Boolean(weather) && weather.local.low > 0.6 && above > 4 && above < 30;
        }
    },
    {
        id: 'tool_set',
        tier: 'rare',
        title: 'Komplet narzędzi',
        task: 'Zrób siekierę, kilof i łopatę (postęp liczy się w księdze).',
        comment: 'Teraz brakuje tylko skrzynki na narzędzia. I garażu. I warsztatu.',
        icon: 'pickaxe',
        on: 'crafted',
        // Tylko trzy narzędzia z opisu. Do 1.10.1 liczyło się dowolne (np.
        // nóż zamiast łopaty); postęp ma nowy klucz, żeby stary nóż nie
        // zaliczał kompletu.
        when: (data, book) => TOOL_SET.includes(getTool(data.type)) && book.collect('tool_set', getTool(data.type)) >= TOOL_SET.length,
        goal: { key: 'tool_set', count: TOOL_SET.length }
    },
    {
        id: 'tree_grown',
        tier: 'rare',
        title: 'Z małego ziarenka',
        task: 'Wyhoduj drzewo z sadzonki.',
        comment: 'Wyrosło! Teraz tylko sto lat i będzie z niego porządny dąb. Albo brzoza.',
        icon: 'oak_sapling',
        on: 'treeGrown'
    },
    {
        id: 'pocket_miner',
        tier: 'rare',
        title: 'Kopalnia w kieszeni',
        task: 'Zagraj na telefonie albo tablecie i zniszcz blok palcem.',
        comment: 'Bateria właśnie zaczęła się pocić.',
        icon: 'stone',
        on: 'blockBroken',
        when: (data, book) => book.game?.touchMode === true
    },
    {
        id: 'own_icon',
        tier: 'rare',
        title: 'Lokator z ikonką',
        task: 'Zagraj w aplikacji na telefon (zainstalowanej, z ikonką na ekranie).',
        comment: 'Gra zamieszkała na twoim telefonie. Czynszu nie płaci.',
        icon: 'grass',
        check: (game) => game.nativeApp === 'android'
    },
    {
        id: 'river_ride',
        tier: 'rare',
        title: 'Spływ',
        task: 'Daj się ponieść nurtowi rzeki przez 100 bloków.',
        comment: 'Wiosło? Jakie wiosło? Rzeka wie, dokąd płynie.',
        icon: 'water',
        check: (game) => game.player.riverDistance >= 100
    },
    {
        id: 'interior_designer',
        tier: 'rare',
        title: 'Projektant wnętrz',
        task: 'Postaw każdy z pięciu budulców: tynk wapienny, tynk ochrowy, terakotę, polerowany kamień i ciemne deski.',
        comment: 'Biel optycznie powiększa wnętrze. Ciemne deski - optycznie zmniejszają rachunki za prąd.',
        icon: 'lime_plaster',
        on: 'blockPlaced',
        when: (data, book) => BUILDING_BLOCKS.includes(data.type) && book.collect('building', data.type) >= BUILDING_BLOCKS.length,
        goal: { key: 'building', count: BUILDING_BLOCKS.length }
    },
    {
        id: 'tourist',
        tier: 'rare',
        title: 'Turysta',
        task: `Odwiedź każdy z ${LAND_BIOMES.length} biomów lądowych: łąkę, lasy, góry, mokradła, wydmy... (/biom lista).`,
        comment: 'Łąka, bór, bagno, szczyt. Pocztówki wyślesz później.',
        icon: 'tall_grass',
        check: (game, book) => {
            const key = currentBiome(game);
            return Boolean(key) && !BIOMES[key].water && book.collect('biomes', key) >= LAND_BIOMES.length;
        },
        goal: { key: 'biomes', count: LAND_BIOMES.length }
    },
    {
        id: 'summit',
        tier: 'rare',
        title: 'Dach świata',
        task: 'Stań na śniegu na ośnieżonym szczycie.',
        comment: 'Widok jak z pocztówki, wiatr jak z zamrażarki.',
        icon: 'snow',
        check: (game) => {
            const p = game.player;
            return p.onGround && game.world.getBlock(Math.floor(p.pos.x), Math.floor(p.pos.y - 0.1), Math.floor(p.pos.z)) === 'snow' &&
                currentBiome(game) === 'snowy';
        }
    },
    {
        id: 'sunbeam',
        tier: 'rare',
        title: 'Promyk słońca',
        task: 'Stań w plamie słońca pod dachem (słońce wpada przez okno albo dziurę w ścianie).',
        comment: 'Jak kot na parapecie. Brakuje tylko mruczenia.',
        icon: 'oak_planks',
        check: (game) => inSunbeam(game)
    },

    {
        id: 'three_meals',
        tier: 'rare',
        title: 'Śniadanie, obiad, kolacja',
        task: 'Zalicz trzy posiłki jednego dnia.',
        comment: 'Trzy posiłki dziennie. Organizm jest w szoku, ale wdzięczny.',
        icon: 'roasted_hazelnut',
        on: 'ate',
        when: (data) => data.meal === true && data.mealsToday >= 3
    },
    {
        id: 'flower_sea',
        tier: 'rare',
        title: 'Morze kwiatów',
        task: 'Stań w środku miejsca, które opanowała jedna roślina.',
        comment: 'Ktoś tu przesadził. Dosłownie.',
        icon: 'barwinek_etap3',
        check: (game) => {
            const excess = game.world.generator.excess;
            const found = excess?.zoneAt(Math.floor(game.player.pos.x), Math.floor(game.player.pos.z));
            return Boolean(found) && found.depth > 0.5;
        }
    },
    {
        id: 'pricked',
        tier: 'common',
        title: 'Nie dotykać',
        task: 'Wejdź w kłującą roślinę.',
        comment: 'Mikołajek nie przynosi prezentów. Mikołajek kłuje.',
        icon: 'mikolajek_etap3',
        on: 'pricked'
    },
    {
        id: 'season_turns',
        tier: 'common',
        title: 'Coś wisi w powietrzu',
        task: 'Doczekaj zmiany pory roku.',
        comment: 'Wczoraj jedno kwitło, dziś drugie. Kalendarz nie pyta o zgodę.',
        icon: 'zawilec_etap3',
        on: 'season',
        when: (data) => data.changed === true
    },
    {
        id: 'four_seasons',
        tier: 'epic',
        title: 'Cztery pory roku',
        task: 'Bądź w świecie wiosną, latem, jesienią i zimą.',
        comment: 'Pełny obrót. Vivaldi napisał o tym koncert, ty po prostu przetrwałeś.',
        icon: 'nagietek_etap3',
        on: 'season',
        when: (data, book) => book.collect('seasons', data.key) >= 4
    },
    {
        id: 'good_night',
        tier: 'rare',
        title: 'Jak w puchu',
        task: 'Prześpij noc w pościelonym łóżku.',
        comment: 'Własne łóżko. Od teraz każda ziemianka to już dom.',
        icon: 'linen_bedding',
        on: 'slept',
        when: (data) => data.place === 'bed' && data.hours >= 4
    },
    {
        id: 'herbalist',
        tier: 'rare',
        title: 'Zielarz',
        task: 'Wypij wszystkie trzy rodzaje naparów: na sen, leczniczy i wzmacniający.',
        comment: 'Na wszystko jest zioło. Trzeba tylko wiedzieć, które.',
        icon: 'tea_heal',
        on: 'ate',
        when: (data, book) => data.kind === 'drink' && book.collect('teas', data.type) >= TEA_KINDS
    },
    {
        id: 'blackout',
        tier: 'rare',
        title: 'Nie polecam',
        task: 'Strać przytomność pod wodą i obudź się na brzegu.',
        comment: 'Ryby patrzyły. Żadna nie pomogła.',
        icon: 'water',
        secret: true,
        on: 'blackout'
    },

    // --------------------------------------------------------
    // BARDZO RZADKIE
    // --------------------------------------------------------

    {
        id: 'eclipse',
        tier: 'epic',
        title: 'Dzień jak noc',
        task: 'Zobacz pełne zaćmienie słońca.',
        comment: 'Słońce na chwilę zrobiło sobie przerwę. Ty jak zwykle nie.',
        icon: 'lamp_purple',
        check: (game) => game.sky.state.eclipse > 0.995
    },
    {
        id: 'meteorite_miner',
        tier: 'epic',
        title: 'Kosmiczny złom',
        task: 'Wykop blok meteorytu.',
        comment: 'Kawałek nieba w kieszeni. Jeszcze ciepły.',
        icon: 'meteorite',
        on: 'blockBroken',
        when: (data) => data.type === 'meteorite'
    },
    {
        id: 'space',
        tier: 'epic',
        title: 'Houston, mamy widok',
        task: 'Wyleć w kosmos.',
        comment: 'Mały krok dla gracza, wielki skok dla... a nie, to też tylko gracz.',
        icon: 'lamp_blue',
        secret: true,
        check: (game) => game.spaceView.space > 0.98
    },
    {
        id: 'world_border',
        tier: 'epic',
        title: 'Koniec świata',
        task: `Dojdź do granicy świata (${WORLD_BORDER} bloków od środka).`,
        comment: 'Dalej nic nie ma. Sprawdzaliśmy. Dwa razy.',
        icon: 'stone',
        check: (game) => Math.max(Math.abs(game.player.pos.x), Math.abs(game.player.pos.z)) >= WORLD_BORDER - 2
    },

    // --------------------------------------------------------
    // LEGENDARNE
    // --------------------------------------------------------

    {
        id: 'meteor_player',
        tier: 'legendary',
        title: 'Problem spadł z nieba',
        task: 'Wyląduj jako meteoryt.',
        comment: 'Tym razem problemem byłeś ty.',
        icon: 'meteorite',
        secret: true,
        on: 'skyfallLanded'
    },
    {
        id: 'space_splash',
        tier: 'legendary',
        title: 'Skok do basenu',
        task: 'Wpadnij do wody prosto z kosmosu.',
        comment: 'Najdroższy skok do wody w historii. Sędziowie dają 10/10, ryby 0/10.',
        icon: 'water',
        secret: true,
        on: 'skyfallSplash'
    }

];

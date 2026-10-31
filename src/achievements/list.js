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

import { TREE_PACKS } from '../blocks/treePacks.js';

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

    const key = generator.biomeAt(Math.floor(game.player.pos.x), Math.floor(game.player.pos.z));

    game.achievementBiome = { time: now, key };

    return key;

}


// Owoce drzew z paczek (assets/drzewa/) - zbiór z odmian liści.
// Osiągnięcie "Sadownik" jest tylko wtedy, gdy jakaś paczka je ma.

const TREE_FRUIT = TREE_PACKS.flatMap((pack) =>
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
    when: (data) => getBlockDefinition(data.type)?.pack !== undefined && TREE_FRUIT.includes(data.item)
}];


// Amarantus z paczki roślin (assets/rosliny/amarantus) - osiągnięcie jest,
// gdy paczka jest w grze.

const AMARANTH = getPlantPack('amarantus')?.item ? [{
    id: 'amaranth',
    tier: 'common',
    title: 'Wyższy od ciebie',
    task: 'Zbierz wiechy z dojrzałego amarantusa (rośnie kępami na łąkach, ma 2 bloki wysokości).',
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
    task: 'Zbierz bukiet z kwitnącej kocanki (niska, srebrzysta kępka na piasku w borach i na plażach).',
    comment: 'Zasuszona nie traci koloru - stąd druga nazwa: nieśmiertelnik.',
    icon: 'kocanka_bukiet',
    on: 'harvested',
    when: (data) => data.item === 'kocanka_bukiet'
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
        id: 'texture_pack',
        tier: 'common',
        title: 'Nowe szaty',
        task: 'Zagraj z własną paczką tekstur (Ustawienia → Tekstury).',
        comment: 'Ten sam kamień, tylko w wyższej rozdzielczości. Dalej twardy.',
        icon: 'grass',
        on: 'texturePack'
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
        id: 'tool_set',
        tier: 'rare',
        title: 'Komplet narzędzi',
        task: 'Zrób siekierę, kilof i łopatę (postęp liczy się w księdze).',
        comment: 'Teraz brakuje tylko skrzynki na narzędzia. I garażu. I warsztatu.',
        icon: 'pickaxe',
        on: 'crafted',
        when: (data, book) => ['axe', 'pickaxe', 'shovel'].includes(data.type) && book.collect('tools', data.type) >= 3,
        goal: { key: 'tools', count: 3 }
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

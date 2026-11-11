// ------------------------------------------------------------
// RODZAJE DREWNA (DESEK) - 0.90.0
//
// Wspólna lista 20 rodzajów desek dla wyrobów stolarskich (schody,
// półbloki, płoty, furtki, stół stolarski - woodShapes.js). Kolejność =
// numery bloków w zapisie świata: tylko dopisywać na końcu.
//
// Nazwy: przymiotnik (temat + końcówka rodzaju: -y, -a, -e) albo
// dopełnienie ("z akacji") - "Schody świerkowe", "Furtka z akacji".
// ------------------------------------------------------------

export const WOODS = [
    { wood: 'spruce', planks: 'spruce_planks', texture: 'spruce_planks', stem: 'świerkow' },
    { wood: 'pine', planks: 'pine_planks', texture: 'pine_planks', stem: 'sosnow' },
    { wood: 'beech', planks: 'beech_planks', texture: 'beech_planks', stem: 'bukow' },
    { wood: 'linden', planks: 'linden_planks', texture: 'linden_planks', stem: 'lipow' },
    { wood: 'oak', planks: 'oak_planks', texture: 'oak_planks', stem: 'dębow' },
    { wood: 'birch', planks: 'birch_planks', texture: 'birch_planks', stem: 'brzozow' },
    { wood: 'dark', planks: 'dark_planks', texture: 'dark_planks', of: 'z ciemnego drewna' },
    { wood: 'jablon', planks: 'jablon_planks', texture: 'jablon/deski.png', stem: 'jabłoniow' },
    { wood: 'olcha', planks: 'olcha_planks', texture: 'olcha/deski.png', stem: 'olchow' },
    { wood: 'wierzba', planks: 'wierzba_planks', texture: 'wierzba/deski.png', stem: 'wierzbow' },
    { wood: 'acacia', planks: 'acacia_planks', texture: 'acacia/planks.png', of: 'z akacji' },
    { wood: 'bald_cypress', planks: 'bald_cypress_planks', texture: 'bald_cypress/planks.png', of: 'z cypryśnika' },
    { wood: 'cherry', planks: 'cherry_planks', texture: 'cherry/planks.png', stem: 'wiśniow' },
    { wood: 'maple', planks: 'maple_planks', texture: 'maple/planks.png', stem: 'klonow' },
    { wood: 'mugo', planks: 'mugo_planks', texture: 'mugo/planks.png', of: 'z kosodrzewiny' },
    { wood: 'olive', planks: 'olive_planks', texture: 'olive/planks.png', stem: 'oliwkow' },
    { wood: 'rainbow_eucalyptus', planks: 'rainbow_eucalyptus_planks', texture: 'rainbow_eucalyptus/planks.png', stem: 'eukaliptusow' },
    { wood: 'sequoia', planks: 'sequoia_planks', texture: 'sequoia/planks.png', stem: 'sekwojow' },
    { wood: 'ginkgo', planks: 'ginkgo_planks', texture: 'ginkgo/planks.png', stem: 'miłorzębow' },
    { wood: 'jacaranda', planks: 'jacaranda_planks', texture: 'jacaranda/planks.png', stem: 'jakarandow' }
];

const ENDINGS = { m: 'y', f: 'a', n: 'e' };

// Nazwa wyrobu z drewna: noun - rzeczownik, gender - m (płot), f (furtka),
// n (schody - liczba mnoga niemęskoosobowa).
export function woodName(wood, noun, gender) {
    const entry = typeof wood === 'string' ? WOODS.find((candidate) => candidate.wood === wood) : wood;
    return entry.stem ? `${noun} ${entry.stem}${ENDINGS[gender]}` : `${noun} ${entry.of}`;
}

export function woodOfPlanks(planks) {
    return WOODS.find((entry) => entry.planks === planks) ?? null;
}

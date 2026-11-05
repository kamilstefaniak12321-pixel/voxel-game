// Pochodnie Reactive Torch: trwałe numery bloków i paleta, bez DOM/Three.
// Kolejność kolorów i mocowania jest częścią formatu zapisu świata.
// Numery 10010–10094: 17 odmian × (podłoga, północ, południe, wschód, zachód).

const COLORS = [
    // klucz, przymiotnik pochodni, przymiotnik barwnika, iskry, jasny czubek
    ['white', 'biała', 'biały', '#e8ecf4', '#ffffff'],
    ['orange', 'pomarańczowa', 'pomarańczowy', '#fc881a', '#ffc45c'],
    ['magenta', 'purpurowa', 'purpurowy', '#e24ed8', '#fc98f6'],
    ['light_blue', 'jasnoniebieska', 'jasnoniebieski', '#62bcfc', '#ace2ff'],
    ['yellow', 'żółta', 'żółty', '#fada2e', '#fff68c'],
    ['lime', 'limonkowa', 'limonkowy', '#88e630', '#c8ff7a'],
    ['pink', 'różowa', 'różowy', '#f68eb8', '#ffcade'],
    ['gray', 'szara', 'szary', '#707480', '#a0a4af'],
    ['light_gray', 'jasnoszara', 'jasnoszary', '#babec8', '#e2e5ec'],
    ['cyan', 'turkusowa', 'turkusowy', '#24bec8', '#7cecf2'],
    ['purple', 'fioletowa', 'fioletowy', '#9442de', '#ca8efc'],
    ['blue', 'niebieska', 'niebieski', '#4462f6', '#8ea6ff'],
    ['brown', 'brązowa', 'brązowy', '#945c30', '#c48c56'],
    ['green', 'zielona', 'zielony', '#40a02a', '#7cd056'],
    ['red', 'czerwona', 'czerwony', '#e43228', '#ff7862'],
    ['black', 'czarna', 'czarny', '#282430', '#4a4654']
];

const rgb = hex => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
const hex = color => '#' + color.map(value => Math.round(value).toString(16).padStart(2, '0')).join('');

function flameLight(tip) {
    // Czubek nadaje odcień, a oryginalny ciepły dół nadal świeci.
    // Ciemny barwnik nie tworzy ujemnego światła: czarna pochodnia
    // ma ciemne końcówki płomienia i ciepłą, przygaszoną poświatę.
    const warm = [255, 178, 91];
    return hex(rgb(tip).map((value, i) => value * .8 + warm[i] * .2));
}

export const TORCH_VARIANTS = Object.freeze([
    Object.freeze({ key: 'plain', type: 'torch', label: 'Pochodnia',
        color: '#ffb25b', particleColor: '#ffbb54', texture: 'torch' }),
    ...COLORS.map(([key, adjective, dyeAdjective, particleColor, tip]) => Object.freeze({
        key, type: `torch_${key}`, label: `Pochodnia ${adjective}`,
        dyeLabel: `Barwnik ${dyeAdjective}`, dyeColor: particleColor,
        color: flameLight(tip), particleColor, texture: `torch_${key}`
    }))
]);

export const TORCH_ATTACHMENTS = Object.freeze(['down', 'north', 'south', 'east', 'west']);
const variantsByKey = new Map(TORCH_VARIANTS.map(variant => [variant.key, variant]));

export function torchType(colorKey, attach = 'down') {
    const variant = variantsByKey.get(colorKey);
    if (!variant || !TORCH_ATTACHMENTS.includes(attach)) return null;
    return attach === 'down' ? variant.type : `${variant.type}_${attach}`;
}

export const TORCH_BLOCKS = {};
const infoByType = new Map();
const infoById = new Map();

TORCH_VARIANTS.forEach((variant, colorIndex) => {
    const wall = Object.fromEntries(TORCH_ATTACHMENTS.slice(1).map(attach => [attach, torchType(variant.key, attach)]));
    TORCH_ATTACHMENTS.forEach((attach, orientation) => {
        const type = torchType(variant.key, attach);
        const id = 10010 + colorIndex * TORCH_ATTACHMENTS.length + orientation;
        const info = Object.freeze({ id, type, colorKey: variant.key, attach, standingType: variant.type, variant });
        infoByType.set(type, info);
        infoById.set(id, info);
        TORCH_BLOCKS[type] = {
            id, name: type, label: variant.label, solid: false, opaque: false,
            model: 'structure', torch: { colorKey: variant.key, attach },
            flat: { attach }, ...(attach === 'down' ? { wall } : { creative: false, inventory: false }),
            light: 14, lightColor: variant.color, category: 'swiatlo',
            sound: 'wood', hardness: .15, pick: variant.type, drops: variant.type,
            textures: { all: variant.texture }
        };
    });
});

export function isTorchId(id) {
    // setId wywołuje to także podczas generowania zwykłego terenu.
    return id >= 10010 && id <= 10094 && infoById.has(id);
}

export function getTorchInfo(typeOrId) {
    return (typeof typeOrId === 'number' ? infoById.get(typeOrId) : infoByType.get(typeOrId)) ?? null;
}

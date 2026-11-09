import { loadTextureRegionURL } from '../rendering/TextureSheets.js';

// CSS repeat and border-image need an isolated image, not the whole source
// sheet. Each region is decoded once and keeps its original pixel dimensions.
const IMAGES = {
    'wood-frame': 'assets/ui/inventory/wood/frame.png',
    'wood-frame-compact': 'assets/ui/inventory/wood/frame-compact.png',
    'wood-planks': 'assets/ui/inventory/wood/planks.png',
    'wood-board': 'assets/ui/inventory/wood/board.png',
    'default-background': 'assets/ui/themes/default/background.png',
    'lepidolit-background': 'assets/ui/themes/lepidolit/background.png',
    'grey-wood-frame': 'assets/ui/themes/grey-wood/frame.png',
    'grey-wood-planks': 'assets/ui/themes/grey-wood/planks.png',
    'grey-wood-board': 'assets/ui/themes/grey-wood/board.png'
};

let ready;
export function installUiTextureSheets() {
    return ready ??= Promise.all(Object.entries(IMAGES).map(async ([name, key]) => {
        const url = await loadTextureRegionURL(key);
        document.documentElement.style.setProperty(`--texture-${name}`, `url("${url}")`);
    }));
}

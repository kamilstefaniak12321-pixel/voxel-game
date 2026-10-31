// Existing save IDs keep their meaning: 94 young, 95 empty, 96 few, 97 full.
export const BLUEBERRY_STAGES = ['young', 'empty', 'few', 'full'];
export const BLUEBERRY_TEXTURE = 'models/blueberry/atlas';
export const BLUEBERRY_ATLAS_URL = new URL('../../assets/models/blueberry/atlas.png', import.meta.url).href;
export const blueberryIcon = stage => `assets/models/blueberry/${stage}.png`;

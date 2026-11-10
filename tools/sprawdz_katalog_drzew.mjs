// Migration baseline captured from published 0.79.0 before editing the tree
// loader. The catalog must keep saved blocks, labels, growth, loot, textures
// and seeded tree geometry, despite removal of per-species pack files.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';

registerHooks({
    load(url, context, next) {
        return next(url, url.endsWith('.js') && url.includes('/src/') ? { ...context, format: 'module' } : context);
    }
});

const baseline = JSON.parse(readFileSync(new URL('./fixtures/tree-catalog-079.json', import.meta.url), 'utf8'));
const { TREE_NAMES, treeBlocks } = await import('../src/blocks/trees.js');
const { TREE_TEXTURE_NAMES } = await import('../src/blocks/treeCatalog.js');
const { buildTree } = await import('../src/world/trees/TreeShapes.js');

function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value)
        .filter(key => key !== 'pack').sort().map(key => [key, canonical(value[key])]));
    return value;
}

// Nowe gatunki (0.83.0+) dochodzą na końcu: dawne zostają bez zmian.
assert.deepEqual(TREE_NAMES.slice(0, baseline.species.length), baseline.species, 'Species IDs and catalog order stay stable');
assert.deepEqual(TREE_TEXTURE_NAMES.slice(0, baseline.textureNames.length), baseline.textureNames, 'Legacy logical keys keep texture override compatibility');
const legacyBlocks = Object.fromEntries(Object.entries(treeBlocks()).filter(([, block]) => baseline.species.includes(block.tree)));
assert.equal(createHash('sha256').update(JSON.stringify(canonical(legacyBlocks))).digest('hex'), baseline.blocksSha256,
    'Every tree block retains ID, label, textures, harvest/growth and loot from 0.79.0');
const ids = Object.values(treeBlocks()).map(block => block.id);
assert.equal(new Set(ids).size, ids.length, 'New species never reuse a block ID');
for (const species of baseline.species) {
    const hash = createHash('sha256');
    for (let seed = 0; seed < 100; seed++) for (const size of [0, .25, .5, .75, 1]) {
        hash.update(JSON.stringify(buildTree(species, seed, size)) + '\n');
    }
    assert.equal(hash.digest('hex'), baseline.shapeSha256[species], `${species}: 500 reference shapes remain identical`);
}
console.log(`OK: wspólny katalog — ${TREE_NAMES.length} gatunków; ${baseline.species.length} dawnych: definicje bloków i ${baseline.species.length * 500} drzew zgodnych z 0.79.0.`);

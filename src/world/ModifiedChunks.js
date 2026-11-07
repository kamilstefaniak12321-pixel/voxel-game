// Far tiles need only edits inside their footprint. Near tiles cover a handful
// of chunks; scanning every edit in a large save for each tile makes their cost
// depend on the player's entire history. Large horizon tiles instead scan the
// available entries, so empty coordinates never cause a giant nested loop.
export function modifiedChunksInBounds(world, minCx, minCz, maxCx, maxCz) {
    const found = new Map();
    const area = (maxCx - minCx + 1) * (maxCz - minCz + 1);
    const inside = (cx, cz) => cx >= minCx && cx <= maxCx && cz >= minCz && cz <= maxCz;
    const saved = world.savedChunks;

    // A paged save can supply compact surface records without reading blocks.
    if (saved.entriesIn) {
        for (const [key, surface] of saved.entriesIn(minCx, minCz, maxCx, maxCz)) found.set(key, surface);
    } else if (area < saved.size) {
        for (let cz = minCz; cz <= maxCz; cz++) for (let cx = minCx; cx <= maxCx; cx++) {
            const key = `${cx},${cz}`;
            const blocks = saved.get(key);
            if (blocks !== undefined || saved.has(key)) found.set(key, blocks);
        }
    } else {
        for (const [key, blocks] of saved) {
            const comma = key.indexOf(',');
            if (inside(Number(key.slice(0, comma)), Number(key.slice(comma + 1)))) found.set(key, blocks);
        }
    }

    const loaded = world.chunks;
    if (area < loaded.size) {
        for (let cz = minCz; cz <= maxCz; cz++) for (let cx = minCx; cx <= maxCx; cx++) {
            const key = `${cx},${cz}`;
            const chunk = loaded.get(key);
            if (chunk?.modified) found.set(key, chunk.blocks);
        }
    } else {
        for (const chunk of loaded.values()) {
            if (chunk.modified && inside(chunk.cx, chunk.cz)) found.set(`${chunk.cx},${chunk.cz}`, chunk.blocks);
        }
    }
    return found;
}

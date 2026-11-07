// Lossless snapshots of edited chunks. Disk records stay unchanged; only the
// runtime representation is compact. Full arrays are decoded on demand into a
// byte- and entry-bounded LRU. get() never exposes the encoded backing buffers.
const DEFAULT_DECODED_BYTES = 8 * 1024 * 1024;
const DEFAULT_DECODED_ENTRIES = 128;
const BUCKET_SIZE = 16; // chunks, not blocks

function limit(value, fallback) {
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

function backingBytes(value, seen = new Set()) {
    if (value === null || typeof value !== 'object' || seen.has(value)) return 0;
    seen.add(value);
    if (ArrayBuffer.isView(value)) return backingBytes(value.buffer, seen);
    if (value instanceof ArrayBuffer) return value.byteLength;
    return Object.values(value).reduce((sum, entry) => sum + backingBytes(entry, seen), 0);
}

function encode(blocks) {
    // Keep the original element type: Chunk.loadBlocks intentionally treats
    // legacy Uint8Array plant IDs differently from modern Uint16Array IDs.
    const Type = blocks instanceof Uint8Array ? Uint8Array
        : blocks instanceof Uint16Array ? Uint16Array : null;
    if (!Type) {
        const data = structuredClone(blocks);
        return { kind: 'opaque', data, bytes: backingBytes(data) };
    }
    const length = blocks.length;
    const runBytes = Type.BYTES_PER_ELEMENT + Uint16Array.BYTES_PER_ELEMENT;
    let runs = length ? 1 : 0, count = 1;
    for (let i = 1; i < length; i++) {
        if (blocks[i] !== blocks[i - 1] || count === 65535) {
            runs++; count = 1;
            // An incompressible snapshot needs no temporary array of runs.
            if (runs * runBytes >= blocks.byteLength) break;
        } else count++;
    }
    if (runs * runBytes >= blocks.byteLength) {
        const data = Type.from(blocks);
        return { kind: 'raw', data, Type, length, bytes: data.byteLength };
    }
    const counts = new Uint16Array(runs), values = new Type(runs);
    let start = 0, at = 0;
    for (let i = 1; i <= length; i++) {
        if (i === length || blocks[i] !== blocks[start] || i - start === 65535) {
            counts[at] = i - start;
            values[at++] = blocks[start];
            start = i;
        }
    }
    return { kind: 'rle', counts, values, Type, length,
        bytes: counts.byteLength + values.byteLength };
}

function decode(record) {
    if (record.kind === 'opaque') return structuredClone(record.data);
    if (record.kind === 'raw') return record.data.slice();
    const blocks = new record.Type(record.length);
    let offset = 0;
    for (let i = 0; i < record.counts.length; i++) {
        const next = offset + record.counts[i];
        blocks.fill(record.values[i], offset, next);
        offset = next;
    }
    return blocks;
}

function position(key) {
    if (typeof key !== 'string' || !/^-?\d+,-?\d+$/.test(key)) return null;
    const [cx, cz] = key.split(',').map(Number);
    return Number.isSafeInteger(cx) && Number.isSafeInteger(cz) ? { cx, cz } : null;
}

export class SavedChunkStore {
    constructor({ summarize = null, maxDecodedBytes = DEFAULT_DECODED_BYTES,
        maxDecodedEntries = DEFAULT_DECODED_ENTRIES } = {}) {
        this.summarize = summarize;
        this.maxDecodedBytes = limit(maxDecodedBytes, DEFAULT_DECODED_BYTES);
        this.maxDecodedEntries = limit(maxDecodedEntries, DEFAULT_DECODED_ENTRIES);
        this.records = new Map();
        this.decoded = new Map();
        this.buckets = new Map();
        this.encodedBytes = 0;
        this.summaryBytes = 0;
        this.decodedBytes = 0;
        this.hits = 0;
        this.misses = 0;
        this.evictions = 0;
    }

    get size() { return this.records.size; }
    has(key) { return this.records.has(key); }
    revision(key) { return this.records.get(key)?.revision; }

    set(key, blocks) {
        // Prepare everything before changing an existing record. A failed
        // summarizer cannot discard the previous, still valid snapshot.
        const encoded = encode(blocks);
        const summary = this.summarize ? structuredClone(this.summarize(blocks)) : null;
        const coordinates = position(key);
        const record = { encoded, summary, summaryBytes: backingBytes(summary),
            revision: Object.freeze({}), ...coordinates };
        const old = this.records.get(key);
        this.releaseDecoded(key);
        if (old) {
            this.encodedBytes -= old.encoded.bytes;
            this.summaryBytes -= old.summaryBytes;
        } else if (coordinates) {
            const bx = Math.floor(coordinates.cx / BUCKET_SIZE);
            const bz = Math.floor(coordinates.cz / BUCKET_SIZE);
            const bucketKey = `${bx},${bz}`;
            let bucket = this.buckets.get(bucketKey);
            if (!bucket) this.buckets.set(bucketKey, bucket = { bx, bz, keys: new Set() });
            bucket.keys.add(key);
        }
        this.records.set(key, record);
        this.encodedBytes += encoded.bytes;
        this.summaryBytes += record.summaryBytes;
        return this;
    }

    get(key) {
        const record = this.records.get(key);
        if (!record) return undefined;
        const cached = this.decoded.get(key);
        if (cached) {
            this.hits++;
            this.decoded.delete(key);
            this.decoded.set(key, cached);
            return cached.blocks;
        }
        this.misses++;
        const blocks = decode(record.encoded), bytes = backingBytes(blocks);
        if (bytes <= this.maxDecodedBytes && this.maxDecodedEntries > 0) {
            while (this.decoded.size && (this.decodedBytes + bytes > this.maxDecodedBytes ||
                this.decoded.size >= this.maxDecodedEntries)) {
                this.releaseDecoded(this.decoded.keys().next().value);
                this.evictions++;
            }
            this.decoded.set(key, { blocks, bytes });
            this.decodedBytes += bytes;
        }
        return blocks;
    }

    releaseDecoded(key) {
        const cached = this.decoded.get(key);
        if (!cached) return false;
        this.decodedBytes -= cached.bytes;
        this.decoded.delete(key);
        return true;
    }

    keys() { return this.records.keys(); }

    // Bounds are inclusive chunk coordinates, matching FarTerrain padding.
    // Summaries are read-only to callers. This never populates the decoded LRU.
    *entriesIn(minCx, minCz, maxCx, maxCz) {
        if (![minCx, minCz, maxCx, maxCz].every(Number.isFinite) || minCx > maxCx || minCz > maxCz) return;
        const bx0 = Math.floor(minCx / BUCKET_SIZE), bx1 = Math.floor(maxCx / BUCKET_SIZE);
        const bz0 = Math.floor(minCz / BUCKET_SIZE), bz1 = Math.floor(maxCz / BUCKET_SIZE);
        const inside = record => record.cx >= minCx && record.cx <= maxCx && record.cz >= minCz && record.cz <= maxCz;
        if ((bx1 - bx0 + 1) * (bz1 - bz0 + 1) > this.buckets.size) {
            for (const bucket of this.buckets.values()) {
                if (bucket.bx < bx0 || bucket.bx > bx1 || bucket.bz < bz0 || bucket.bz > bz1) continue;
                for (const key of bucket.keys) {
                    const record = this.records.get(key);
                    if (inside(record)) yield [key, record.summary];
                }
            }
        } else {
            for (let bx = bx0; bx <= bx1; bx++) for (let bz = bz0; bz <= bz1; bz++) {
                const bucket = this.buckets.get(`${bx},${bz}`);
                if (!bucket) continue;
                for (const key of bucket.keys) {
                    const record = this.records.get(key);
                    if (inside(record)) yield [key, record.summary];
                }
            }
        }
    }

    stats() {
        return { entries: this.records.size, buckets: this.buckets.size,
            encodedBytes: this.encodedBytes, summaryBytes: this.summaryBytes,
            decodedBytes: this.decodedBytes, decodedEntries: this.decoded.size,
            maxDecodedBytes: this.maxDecodedBytes, maxDecodedEntries: this.maxDecodedEntries,
            totalBytes: this.encodedBytes + this.summaryBytes + this.decodedBytes,
            hits: this.hits, misses: this.misses, evictions: this.evictions };
    }

    clear() {
        this.records.clear(); this.decoded.clear(); this.buckets.clear();
        this.encodedBytes = this.summaryBytes = this.decodedBytes = 0;
        this.hits = this.misses = this.evictions = 0;
    }

    dispose() { this.clear(); }
}

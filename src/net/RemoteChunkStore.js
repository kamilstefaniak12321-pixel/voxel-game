// ------------------------------------------------------------
// GOŚĆ - CHUNKI ZMIENIONE U GOSPODARZA (0.92.0)
//
// Zastępuje zapis świata u gościa (World.savedChunks): Map "cx,cz" ->
// bloki chunka zmienionego przez graczy. Klucze takich chunków gość
// dostaje od razu po wejściu (known), bloki - na prośbę, gdy zbliży się
// do chunka (request). Dopóki nie przyjdą, chunk czeka (World.chunkGate).
// Nowe zmiany bloków w chunkach, których gość nie ma w pamięci, trafiają
// do zapisanych bloków albo do listy, którą przykładamy po wczytaniu.
// ------------------------------------------------------------

import { CHUNK_SIZE } from '../config.js';

const LOG_LIMIT = 4096;

export class RemoteChunkStore extends Map {

    constructor(knownKeys = []) {
        super();
        this.known = new Set(knownKeys);
        this.requested = new Set();
        this.logs = new Map();
        this.onRequest = null;
    }

    // Czy chunk można już wczytać (zmieniony - gdy przyszły jego bloki).
    ready(key) {
        if (!this.known.has(key) || this.has(key)) return true;
        this.request(key);
        return false;
    }

    request(key) {
        if (this.requested.has(key) || !this.known.has(key) || this.has(key)) return;
        this.requested.add(key);
        this.onRequest?.(key);
    }

    // Bloki od gospodarza (null - chunk jednak niezmieniony).
    receive(key, blocks) {
        this.requested.delete(key);
        this.known.delete(key);
        if (blocks) this.set(key, blocks);
    }

    // Zmiana bloku w chunku, którego nie ma w pamięci.
    record(key, x, y, z, id) {
        const blocks = this.get(key);
        if (blocks) {
            const [cx, cz] = key.split(',').map(Number);
            const lx = x - cx * CHUNK_SIZE, lz = z - cz * CHUNK_SIZE;
            blocks[(y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx] = id;
        }
        // Gdy bloki właśnie się wczytują w wątku, mogą nie mieć tej
        // zmiany - przykładamy ją jeszcze raz po wczytaniu.
        if (this.known.has(key) && !blocks) return;
        let log = this.logs.get(key);
        if (!log) this.logs.set(key, log = []);
        if (log.length >= LOG_LIMIT * 4) {
            // Za dużo zmian - lepiej pobrać cały chunk jeszcze raz.
            this.logs.delete(key);
            this.delete(key);
            this.known.add(key);
            return;
        }
        log.push(x, y, z, id);
    }

    takeLog(key) {
        const log = this.logs.get(key);
        this.logs.delete(key);
        return log ?? null;
    }
}

// ------------------------------------------------------------
// GRA WIELOOSOBOWA - WSPÓLNE ZASADY (0.92.0)
//
// Gospodarz (NetHost.js) gra w swoim świecie i otwiera go dla znajomych:
// dostaje kod zaproszenia (np. VOXEL-K7M2-9QXA). Goście (NetClient.js)
// łączą się przez internet bezpośrednio z gospodarzem (WebRTC, biblioteka
// PeerJS - PeerTransport.js). Wiadomości to małe obiekty JSON { t: typ }.
//
// Świat gościa powstaje z tego samego ziarna co u gospodarza; od
// gospodarza przychodzą tylko chunki zmienione przez graczy (encodeBlocks)
// i zmiany bloków na żywo. Opis: docs/multiplayer.md.
// ------------------------------------------------------------

import { BLOCK_TYPES } from '../blocks/BlockRegistry.js';

// Zmienia się, gdy stare wersje gry nie dogadają się z nowymi.
export const PROTOCOL_VERSION = 1;

export const MAX_GUESTS = 7;
export const NAME_MAX = 16;

// Typy wiadomości.
export const MSG = {
    HELLO: 'hello',          // gość -> gospodarz: { protocol, name, id, skin, registry }
    WELCOME: 'welcome',      // gospodarz -> gość: świat, stan, gracze
    REJECT: 'reject',        // gospodarz -> gość: { reason }
    CHUNK_REQUEST: 'cq',     // gość -> gospodarz: { keys: ["cx,cz", ...] }
    CHUNK: 'c',              // gospodarz -> gość: { key, data | null }
    BLOCKS: 'b',             // zmiany bloków: { l: [x, y, z, id, ...] }
    PLAYER: 'p',             // stan gracza: { id?, s: [...] }
    PLAYER_JOIN: 'pj',       // { id, name, skin }
    PLAYER_LEAVE: 'pl',      // { id }
    STATE: 's',              // skrzynie, stoły, ogniska: { sys, key, v }
    TIME: 'tm',              // pora dnia: { days, speed }
    CHAT: 'ch',              // { id?, text }
    RAFTS: 'r',              // gospodarz -> goście: tratwy { l: [...] }
    RAFT: 'rs',              // gość -> gospodarz: stan jego tratwy { v }
    RAFT_REMOVE: 'rr',       // gość -> gospodarz: { id }
    METEOR: 'm',             // gospodarz -> goście: { x, y, z, fx, fz }
    SAVE: 'sv',              // gość -> gospodarz: ekwipunek, pozycja i samopoczucie do zapisu
    BYE: 'bye'               // zamknięcie (świadome) - { reason }
};

// --- Kod zaproszenia ---------------------------------------------------------

// Bez liter i cyfr, które łatwo pomylić (0/O, 1/I/L).
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_PREFIX = 'VOXEL';

export function newInviteCode(random = Math.random) {
    const part = () => Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]).join('');
    return `${CODE_PREFIX}-${part()}-${part()}`;
}

// Kod wpisany przez gracza (małe litery, spacje, bez przedrostka)
// -> postać kanoniczna albo null.
export function normalizeInviteCode(text) {
    const clean = String(text ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    const body = clean.startsWith(CODE_PREFIX) ? clean.slice(CODE_PREFIX.length) : clean;
    if (body.length !== 8 || [...body].some((c) => !CODE_ALPHABET.includes(c))) return null;
    return `${CODE_PREFIX}-${body.slice(0, 4)}-${body.slice(4)}`;
}

// Identyfikator w serwerze połączeń (PeerJS: litery, cyfry, - i _).
export const peerIdOf = (code) => `voxel-game-${code.toLowerCase()}`;

// --- Gracze --------------------------------------------------------------------

export function cleanName(text) {
    const name = String(text ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
    return name || 'Gracz';
}

export function newPlayerId(random = Math.random) {
    return Array.from({ length: 16 }, () => Math.floor(random() * 16).toString(16)).join('');
}

export const cleanChat = (text) => String(text ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200);

// Stan gracza w jednej tablicy (mało bajtów, 15 razy na sekundę):
// pozycja, prędkość, obrót, flagi ruchu, przedmiot w ręce, machnięcia.
const FLAGS = ['onGround', 'crouching', 'sprinting', 'flying', 'swimming'];

export function packPlayer(player, held, swings, sleeping = false) {
    const r = (v, k = 100) => Math.round(v * k) / k;
    let flags = 0;
    FLAGS.forEach((key, bit) => { if (player[key]) flags |= 1 << bit; });
    if (sleeping) flags |= 1 << FLAGS.length;
    return [r(player.pos.x), r(player.pos.y), r(player.pos.z), r(player.vel.x), r(player.vel.y), r(player.vel.z),
        r(player.yaw, 1000), r(player.pitch, 1000), flags, held ?? null, swings];
}

export function unpackPlayer(s) {
    if (!Array.isArray(s) || s.length < 11 || !s.slice(0, 9).every(Number.isFinite)) return null;
    const state = { x: s[0], y: s[1], z: s[2], vx: s[3], vy: s[4], vz: s[5], yaw: s[6], pitch: s[7],
        held: typeof s[9] === 'string' ? s[9] : null, swings: Number.isFinite(s[10]) ? s[10] : 0 };
    FLAGS.forEach((key, bit) => { state[key] = Boolean(s[8] & (1 << bit)); });
    return state;
}

// --- Bloki ---------------------------------------------------------------------

// Odcisk numerów bloków: obie strony muszą mieć te same numery (ta sama
// wersja gry i te same paczki roślin).
export function registryFingerprint(types = BLOCK_TYPES) {
    const entries = Object.entries(types).map(([name, def]) => [def.id, name]).sort((a, b) => a[0] - b[0]);
    let hash = 0x811c9dc5;
    for (const [id, name] of entries) {
        const text = `${id}:${name};`;
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193) >>> 0;
        }
    }
    return `${entries.length}-${hash.toString(16)}`;
}

function toBase64(bytes) {
    let text = '';
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(text);
}

function fromBase64(text) {
    const raw = atob(text);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
}

// Bloki chunka (Uint16Array) -> tekst: pary (ile razy, numer), base64.
export function encodeBlocks(blocks) {
    const out = new Uint16Array(blocks.length * 2);
    let at = 0;
    for (let i = 0; i < blocks.length;) {
        const value = blocks[i];
        let run = 1;
        while (i + run < blocks.length && blocks[i + run] === value && run < 65535) run++;
        out[at++] = run; out[at++] = value;
        i += run;
    }
    const view = new Uint8Array(out.buffer, 0, at * 2);
    return { n: blocks.length, d: toBase64(view) };
}

export function decodeBlocks(data, maxLength = 1 << 20) {
    if (!data || !Number.isSafeInteger(data.n) || data.n <= 0 || data.n > maxLength || typeof data.d !== 'string') return null;
    const bytes = fromBase64(data.d);
    if (bytes.length % 4) return null;
    const pairs = new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2);
    const blocks = new Uint16Array(data.n);
    let offset = 0;
    for (let i = 0; i < pairs.length; i += 2) {
        const run = pairs[i];
        if (offset + run > data.n) return null;
        blocks.fill(pairs[i + 1], offset, offset + run);
        offset += run;
    }
    return offset === data.n ? blocks : null;
}

export const chunkKeyOf = (x, z, size) => `${Math.floor(x / size)},${Math.floor(z / size)}`;

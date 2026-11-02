// Stan odtwarzania muzyki bez przeglądarki: kontrolowany zegar, odtwarzacz
// i Web Audio. Osobno sprawdzamy dekodowanie MP3 oraz faktyczny dźwięk w grze.
// Uruchomienie: node tools/sprawdz_muzyke.mjs
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync, statSync } from 'node:fs';

registerHooks({
    load(url, context, next) {
        return next(url, url.endsWith('.js') && url.includes('/src/')
            ? { ...context, format: 'module' } : context);
    }
});

const { MusicManager } = await import('../src/audio/MusicManager.js');
const { MUSIC_TRACKS } = await import('../src/audio/musicTracks.js');
const { Settings } = await import('../src/settings/Settings.js');
const { TEXTS } = await import('../src/ui/texts.js');

let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const close = (actual, expected, message) => check(Math.abs(actual - expected) < 1e-8, message);
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
const namedError = name => Object.assign(new Error(name), { name });

class FakeAudio {
    constructor() {
        this.paused = true; this.ended = false; this.error = null;
        this.currentTime = 0; this.duration = 120; this.readyState = 4;
        this.playCalls = 0; this.pauseCalls = 0; this.loadCalls = 0;
        this.listeners = new Map(); this.plays = [];
        this._src = '';
    }
    set src(value) { this._src = value; this.currentTime = 0; this.error = null; this.ended = false; }
    get src() { return this._src; }
    addEventListener(name, listener) {
        if (!this.listeners.has(name)) this.listeners.set(name, new Set());
        this.listeners.get(name).add(listener);
    }
    removeEventListener(name, listener) { this.listeners.get(name)?.delete(listener); }
    emit(name) { for (const listener of [...(this.listeners.get(name) ?? [])]) listener(); }
    play() {
        this.playCalls++; this.paused = false;
        const result = this.plays.shift();
        if (typeof result === 'function') return result();
        return result ?? Promise.resolve();
    }
    pause() { this.pauseCalls++; this.paused = true; }
    removeAttribute(name) { if (name === 'src') this._src = ''; }
    load() { this.loadCalls++; this.error = null; this.ended = false; this.currentTime = 0; }
    finish() { this.currentTime = this.duration; this.ended = true; this.paused = true; this.emit('ended'); }
    fail() { this.error = { code: 3 }; this.paused = true; this.emit('error'); }
}

function node(extra = {}) {
    return { connections: [], disconnected: false,
        connect(target) { this.connections.push(target); },
        disconnect() { this.disconnected = true; }, ...extra };
}
function param() {
    return { value: 0, targets: [],
        cancelScheduledValues() {},
        setValueAtTime(value) { this.value = value; this.targets.push({ value, immediate: true }); },
        setTargetAtTime(value, time, constant) { this.value = value; this.targets.push({ value, time, constant }); } };
}

const tracks = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, title: 'Utwór ' + id, file: id + '.mp3' }));
function fixture({ selectedTracks = tracks, random = () => 0.5, sourceThrows = false } = {}) {
    const audio = new FakeAudio(), listeners = new Set();
    const values = { volumeMusic: 60, volumeMaster: 80, volumeWorld: 100, volumeUi: 80 };
    const settings = {
        get: key => values[key],
        onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        set(key, value) { values[key] = value; for (const fn of [...listeners]) fn(key, value); }
    };
    const context = { state: 'running', currentTime: 0, gains: [], sources: [],
        createGain() { const result = node({ gain: param() }); this.gains.push(result); return result; },
        createMediaElementSource(element) {
            if (sourceThrows) throw new Error('MediaElementSource unavailable');
            const result = node({ mediaElement: element }); this.sources.push(result); return result;
        } };
    const sounds = { context, master: node() };
    let allocations = 0;
    const manager = new MusicManager(sounds, settings, {
        tracks: selectedTracks, random, createAudio: () => { allocations++; return audio; }
    });
    return { manager, audio, settings, context, sounds, listeners, allocations: () => allocations };
}

// --- Pliki i kompatybilność zapisu ustawień --------------------------
equal(MUSIC_TRACKS.length, 5, 'pięć utworów w playliście');
equal(new Set(MUSIC_TRACKS.map(t => t.id)).size, 5, 'unikalne identyfikatory');
for (const track of MUSIC_TRACKS) {
    const url = new URL('../assets/music/' + track.file, import.meta.url);
    check(track.title && existsSync(url) && statSync(url).size > 1000, `${track.id}: MP3 istnieje i nie jest pusty`);
}
let saved = JSON.stringify({ revision: 2, volumeMaster: 35, volumeUi: 20, viewDistance: 80 });
globalThis.localStorage = { getItem: () => saved, setItem: (key, value) => { saved = value; } };
const oldSettings = new Settings();
equal(oldSettings.get('volumeMusic'), 60, 'stary zapis otrzymuje domyślną głośność muzyki');
equal([oldSettings.get('volumeMaster'), oldSettings.get('volumeUi'), oldSettings.get('viewDistance')],
    [35, 20, 80], 'dodanie muzyki zachowuje ustawienia gracza');
oldSettings.set('volumeMusic', 0);
equal(new Settings().get('volumeMusic'), 0, 'wyłączenie muzyki zostaje po ponownym wczytaniu');
equal(JSON.parse(saved).revision, 2, 'nowy klucz nie wymusza resetu revision');
oldSettings.set('volumeMusic', 103); equal(oldSettings.get('volumeMusic'), 100, 'górny limit muzyki');
oldSettings.set('volumeMusic', -4); equal(oldSettings.get('volumeMusic'), 0, 'dolny limit muzyki');
oldSettings.set('volumeMusic', 63); equal(oldSettings.get('volumeMusic'), 65, 'krok suwaka 5');
oldSettings.set('volumeMusic', NaN); equal(oldSettings.get('volumeMusic'), 60, 'niepoprawna wartość wraca do domyślnej');
equal([TEXTS.volumeMusic(60), TEXTS.volumeMusic(0)], ['Muzyka: 60%', 'Muzyka: Wył.'], 'etykiety suwaka');
let changes = 0;
const unsubscribe = oldSettings.onChange(() => changes++);
oldSettings.set('volumeMusic', 55); unsubscribe(); oldSettings.set('volumeMusic', 50);
equal(changes, 1, 'subskrypcję ustawień można zwolnić');

// --- Start po geście, pojedynczy strumień i obwiednia ----------------
{
    const f = fixture(), { manager: m, audio: a, context: c } = f;
    m.update(100, 'menu');
    equal(f.allocations(), 0, 'przed gestem nie tworzymy odtwarzacza ani nie pobieramy MP3');
    m.unlock(); await settle();
    equal(a.playCalls, 1, 'pierwszy gest uruchamia jeden utwór');
    equal(a.preload, 'none', 'odtwarzacz nie pobiera playlisty z wyprzedzeniem');
    equal(a.loop, false, 'utwór nie zapętla się bez przerwy');
    equal(c.sources[0].connections[0], c.gains[0], 'muzyka przechodzi przez swój gain');
    equal(c.gains[0].connections[0], f.sounds.master, 'muzyka trafia do wspólnego mastera');
    close(m.stats().gain, 0, 'start utworu jest wyciszony');
    m.update(2.5, 'playing'); close(m.stats().gain, 0.18, 'połowa łagodnego narastania');
    m.update(2.5, 'playing'); close(m.stats().gain, 0.36, 'głośność muzyki ma skalę kwadratową');
    m.update(0, 'paused'); close(m.stats().gain, 0.36 * 0.45, 'ręczna pauza delikatnie ścisza');
    const current = m.stats().track;
    m.update(0, 'inventory'); m.update(0, 'chat'); m.update(0, 'loading'); m.update(0, 'menu');
    equal(m.stats().track, current, 'menu, ładowanie, czat i ekwipunek zachowują utwór');
    equal(a.playCalls, 1, 'zmiany ekranów nie uruchamiają dodatkowego odtwarzania');
    f.settings.set('volumeWorld', 0); f.settings.set('volumeUi', 0);
    close(m.stats().gain, 0.36, 'suwaki świata i UI nie wyciszają muzyki');
    a.currentTime = 117; m.update(0, 'playing');
    close(m.stats().gain, 0.18, 'końcówka utworu łagodnie cichnie');
    a.currentTime = 120; m.update(0, 'playing'); close(m.stats().gain, 0, 'koniec utworu jest wyciszony');
    m.dispose();
}

// --- Shuffle, przerwy, brak powtórek i stała liczba zasobów -----------
{
    const f = fixture(), { manager: m, audio: a } = f;
    m.unlock(); await settle();
    const played = [];
    for (let i = 0; i < 15; i++) {
        played.push(m.stats().track);
        a.finish();
        const gap = m.stats().waitingSeconds;
        check(gap >= 45 && gap <= 90, 'przerwa menu mieści się w 45–90 s');
        const calls = a.playCalls;
        m.update(gap - 0.01, 'menu'); equal(a.playCalls, calls, 'nie gra przed końcem przerwy');
        m.update(0.02, 'menu'); await settle(); equal(a.playCalls, calls + 1, 'po przerwie gra dokładnie jeden utwór');
    }
    for (let i = 0; i < 15; i += 5) equal(new Set(played.slice(i, i + 5)).size, 5, 'pełny cykl obejmuje każdy utwór raz');
    check(played.every((t, i) => !i || t !== played[i - 1]), 'bez natychmiastowej powtórki także między cyklami');
    equal(f.allocations(), 1, 'playlistę obsługuje jeden HTMLAudioElement');
    equal(f.context.sources.length, 1, 'playlistę obsługuje jeden MediaElementSource');
    m.update(0, 'playing'); a.finish();
    check(m.stats().waitingSeconds >= 150 && m.stats().waitingSeconds <= 300, 'przerwa gry mieści się w 150–300 s');
    const waiting = m.stats().waitingSeconds;
    m.setForeground(false); m.update(1000, 'playing');
    equal(m.stats().waitingSeconds, waiting, 'czas ciszy stoi w tle');
    m.setForeground(true); f.settings.set('volumeMusic', 0); m.update(1000, 'playing');
    equal(m.stats().waitingSeconds, waiting, 'czas ciszy stoi po wyciszeniu');
    m.dispose();
}

// --- Wznowienie bez utraty miejsca, master i zawieszony AudioContext --
{
    const f = fixture(), { manager: m, audio: a } = f;
    m.unlock(); await settle(); m.update(5, 'playing'); a.currentTime = 42;
    const title = m.stats().track;
    m.setForeground(false);
    check(a.paused && m.stats().gain === 0, 'utrata fokusu natychmiast zatrzymuje i wycisza');
    m.update(20, 'playing'); equal(a.currentTime, 42, 'tło nie przewija utworu');
    m.setForeground(true); await settle();
    equal([m.stats().track, a.currentTime, a.playCalls], [title, 42, 2], 'powrót wznawia ten sam utwór');
    f.settings.set('volumeMaster', 0); check(a.paused, 'master 0 zatrzymuje muzykę');
    m.update(100, 'playing'); equal(a.playCalls, 2, 'master 0 blokuje automatyczne wznawianie');
    f.settings.set('volumeMaster', 80); await settle(); equal(a.playCalls, 3, 'master ponownie wznawia muzykę');
    f.settings.set('volumeMusic', 0); check(a.paused, 'suwak muzyki 0 zatrzymuje muzykę');
    f.settings.set('volumeMusic', 60); await settle(); equal(a.currentTime, 42, 'suwak muzyki zachowuje miejsce');
    f.context.state = 'suspended'; m.update(10, 'playing');
    check(a.paused, 'wstrzymany AudioContext zatrzymuje zegar elementu');
    const calls = a.playCalls; m.update(100, 'playing'); equal(a.playCalls, calls, 'brak prób play podczas zawieszenia');
    f.context.state = 'running'; m.update(0.1, 'playing'); await settle();
    check(!a.paused && a.currentTime === 42, 'powrót AudioContext wznawia w zachowanym miejscu');
    m.dispose();
}

// --- Odrzucenie autoplay i spóźnione rozstrzygnięcia play() -----------
{
    const f = fixture(), { manager: m, audio: a } = f;
    a.plays.push(() => Promise.reject(namedError('NotAllowedError')));
    m.unlock(); await settle();
    check(m.stats().blocked && a.paused, 'autoplay blocked jest wyciszone');
    const title = m.stats().track;
    for (let i = 0; i < 100; i++) m.update(1, 'menu');
    equal(a.playCalls, 1, 'odrzucony autoplay nie próbuje co klatkę');
    equal(m.stats().failed, [], 'autoplay nie oznacza uszkodzonego utworu');
    m.unlock(); await settle(); equal(a.playCalls, 2, 'kolejny gest ponawia play');
    equal(m.stats().track, title, 'kolejny gest nie pomija utworu');
    m.dispose();
}
{
    const f = fixture(), { manager: m, audio: a } = f;
    const first = deferred(), second = deferred(); a.plays.push(first.promise, second.promise);
    m.unlock(); m.setForeground(false); m.setForeground(true);
    equal(a.playCalls, 2, 'nowa próba po ukryciu nie czeka na stary Promise');
    first.reject(namedError('AbortError')); await settle();
    check(!m.stats().blocked, 'stare odrzucenie nie blokuje nowszego odtwarzania');
    second.resolve(); await settle();
    check(m.stats().playing, 'nowsza próba może się zakończyć sukcesem');
    a.emit('ended'); equal(m.stats().waitingSeconds, 0, 'spóźnione ended bez stanu końca jest ignorowane');
    m.dispose();
}

// --- Błędy MP3, cooldown, komplet błędów i brak luźnego odtwarzacza ---
{
    const f = fixture({ selectedTracks: tracks.slice(0, 2) }), { manager: m, audio: a } = f;
    m.unlock(); await settle(); a.fail();
    equal(m.stats().failed.length, 1, 'błąd media wyklucza konkretny utwór');
    check(a.paused && !a.src, 'błędne źródło zostaje zwolnione');
    m.update(9, 'playing'); equal(a.playCalls, 1, 'błąd nie powoduje natychmiastowej pętli retry');
    m.update(1, 'playing'); await settle(); equal(a.playCalls, 2, 'po cooldown próbuje następnego utworu');
    a.fail(); m.update(20, 'playing'); await settle();
    for (let i = 0; i < 100; i++) m.update(1, 'playing');
    equal(a.playCalls, 2, 'po awarii całej playlisty nie powstaje pętla play');
    equal(m.stats().failed.length, 2, 'oba błędne utwory pozostają wykluczone');
    m.dispose();
}
{
    const f = fixture({ sourceThrows: true });
    f.manager.unlock(); await settle(); f.manager.unlock(); await settle();
    equal(f.audio.playCalls, 0, 'brak MediaElementSource nie pozwala odtwarzać poza masterem i suwakiem');
    f.manager.dispose();
}

// --- Dispose zwalnia zasoby i ignoruje późne zdarzenia ---------------
{
    const f = fixture(), pending = deferred(); f.audio.plays.push(pending.promise);
    f.manager.unlock(); f.manager.dispose(); pending.reject(namedError('NotAllowedError')); await settle();
    equal(f.listeners.size, 0, 'dispose wypisuje listener ustawień');
    check([...f.audio.listeners.values()].every(s => s.size === 0), 'dispose wypisuje zdarzenia elementu');
    check(f.context.sources[0].disconnected && f.context.gains[0].disconnected, 'dispose odłącza węzły');
    check(f.audio.paused && !f.audio.src, 'dispose zwalnia strumień');
    f.manager.unlock(); f.manager.update(100, 'menu'); f.settings.set('volumeMusic', 100);
    equal(f.audio.playCalls, 1, 'dispose nie może zostać wznowione przez gest ani ustawienia');
    equal(f.manager.stats().errors, [], 'spóźniony błąd po dispose jest ignorowany');
}

console.log(`OK: muzyka — ${checks} sprawdzeń playlisty, pauzy, błędów, głośności i zasobów.`);

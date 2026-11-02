import { MusicManager } from '/src/audio/MusicManager.js';
import { MUSIC_TRACKS } from '/src/audio/musicTracks.js';
import { Settings, SETTINGS_DEFAULTS } from '/src/settings/Settings.js';
import { WorldStorage, createWorldInfo } from '/src/storage/WorldStorage.js';

Settings.prototype.load = () => ({ ...SETTINGS_DEFAULTS, viewDistance: 48, farTerrain: 1024,
    meteorites: false, autoUpdates: false });
Settings.prototype.save = () => {};
const db = await WorldStorage.open();
if (!(await db.listWorlds()).length) await db.saveWorld(createWorldInfo('Próba muzyki', 42, 'classic', 'creative'));
db.db.close();

let music, analyser, samples, busy = false, rms = 0, previousState;
const observations = [], errors = [], checks = [];
const update = MusicManager.prototype.update;
MusicManager.prototype.update = function(dt, state) {
    music = this;
    const result = update.call(this, dt, state);
    if (state !== previousState) {
        previousState = state;
        snapshot('Przejście do: ' + state);
        void report();
    }
    return result;
};
addEventListener('error', event => errors.push(String(event.error?.stack || event.message)));
addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
const panel = document.createElement('section');
panel.style.cssText = 'position:fixed;right:10px;top:55px;z-index:10000;width:340px;padding:10px;background:#14212eeb;color:white;font:12px system-ui;pointer-events:auto';
panel.innerHTML = '<b>Próba muzyki 0.53.0</b><p data-state>Oczekiwanie na pierwszy gest</p><div data-buttons></div><p data-result></p>';
document.body.append(panel);
const stateText = panel.querySelector('[data-state]'), resultText = panel.querySelector('[data-result]');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (condition, label) => { checks.push({ label, ok: Boolean(condition) }); if (!condition) throw Error(label); };
async function until(test, ms = 10000) { const end = performance.now() + ms; while (!test()) { if (performance.now() > end) throw Error('Timeout'); await wait(50); } }
function snapshot(label) { const s = { label, state: music.state, ...music.stats(), duration: music.audio?.duration,
    mediaReady: music.audio?.readyState, context: music.sounds.context?.state, rms }; observations.push(s); return s; }
async function report() { await window.musicQA.report({ device: navigator.userAgent, checks, observations, errors, musicErrors: music?.errors }); }
function button(label, fn) { const b = document.createElement('button'); b.textContent = label; b.style.margin = '3px';
    b.onclick = async () => { if (busy) return; busy = true; try { await fn(); resultText.textContent = 'OK: ' + label; }
        catch (error) { errors.push(String(error.stack || error)); resultText.textContent = 'BŁĄD: ' + error.message; }
        finally { busy = false; await report(); } }; panel.querySelector('[data-buttons]').append(b); }

button('Sprawdź pięć MP3', async () => {
    for (const track of MUSIC_TRACKS) {
        music.releaseTrack(); music.wait = 0; music.bag = [track]; music.unlock();
        await until(() => music.audio.readyState >= 3 && !music.pending && !music.audio.paused);
        await until(() => music.audio.currentTime > 1);
        snapshot(track.title + ': metadane');
        check(music.audio.duration > 175 && music.audio.duration < 185, track.title + ': długość');
        music.audio.currentTime = 40;
        await until(() => music.audio.currentTime > 41 && rms > 0.00001);
        snapshot(track.title + ': dekodowanie i sygnał po gain');
        check(rms > 0.00001, track.title + ': niezerowy sygnał WebAudio');
        music.audio.currentTime = music.audio.duration - 1;
        await until(() => music.current === null);
        snapshot(track.title + ': koniec i przerwa');
        check(music.wait >= 40 && music.wait <= 300, track.title + ': cisza po ended');
    }
});
button('Głośność i tło', async () => {
    music.wait = 0; music.unlock(); await until(() => !music.audio.paused && !music.pending); await wait(500);
    const track = music.current.id;
    music.settings.set('volumeMusic', 0); const at = music.audio.currentTime; await wait(400);
    check(music.audio.paused && Math.abs(music.audio.currentTime - at) < .05, 'Muzyka 0 zatrzymuje strumień');
    music.settings.set('volumeMusic', 60); await until(() => !music.audio.paused); await wait(500);
    check(music.current.id === track && music.audio.currentTime > at, 'Wznowienie tego samego utworu');
    window.dispatchEvent(new Event('apppause')); const pausedAt = music.audio.currentTime; await wait(400);
    check(music.audio.paused && !music.foreground && Math.abs(music.audio.currentTime - pausedAt) < .05, 'Android apppause');
    window.dispatchEvent(new Event('focus')); await until(() => !music.audio.paused); await wait(400);
    check(music.current.id === track && music.audio.currentTime > pausedAt, 'Powrót aplikacji');
    music.settings.set('volumeMaster', 0); check(music.audio.paused, 'Główna głośność 0');
    music.settings.set('volumeMaster', 80); await until(() => !music.audio.paused);
    snapshot('Głośność i tło');
});
button('Zapisz stan', async () => { snapshot('Ręczna kontrola menu/gry'); });

setInterval(() => {
    if (!music) return;
    if (music.gain && !analyser) { analyser = music.sounds.context.createAnalyser(); analyser.fftSize = 2048;
        music.gain.connect(analyser); samples = new Float32Array(analyser.fftSize); }
    if (analyser) { analyser.getFloatTimeDomainData(samples); rms = Math.sqrt(samples.reduce((sum, x) => sum + x*x, 0) / samples.length); }
    stateText.textContent = `${music.state} | ${music.current?.title ?? 'cisza'} | ${music.audio?.currentTime.toFixed(1) ?? 0} s | ` +
        `${music.audio?.paused ? 'pauza' : 'gra'} | RMS ${rms.toFixed(5)} | przerwa ${music.wait.toFixed(1)} s`;
}, 200);
await import('/src/main.js');

// ------------------------------------------------------------
// SPRAWDZENIE PLIKÓW DŹWIĘKÓW (0.54.0)
//
// - każdy plik z src/audio/sounds.js jest w assets/sounds/ (i nie jest
//   pusty), a w assets/sounds/ nie ma plików, których gra nie używa,
// - assets/sounds/nagrania.json (nagrania - tools/dzwieki.py ich nie
//   nadpisuje) wypisuje tylko istniejące pliki gry,
// - z ffmpeg (bez niego - tylko powyższe): każdy plik to mono 44,1 kHz,
//   bez przesterowania (szczyt poniżej -0,5 dBFS), krótkie dźwięki
//   zaczynają się od razu (krok, cios, klik - bez ciszy na początku),
//   kroki są krótkie (jeden krok), pętle nie trzaskają na szwie.
//
// Uruchomienie: node tools/sprawdz_dzwieki.mjs
// ------------------------------------------------------------

import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

registerHooks({
    load(url, context, next) {
        return next(url, url.endsWith('.js') && url.includes('/src/') ? { ...context, format: 'module' } : context);
    }
});

const { SOUNDS } = await import('../src/audio/sounds.js');

const ROOT = fileURLToPath(new URL('../assets/sounds/', import.meta.url));
const SR = 44100;

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };


// --- Pliki z listy dźwięków --------------------------------------------

const used = new Map();
for (const [name, sound] of Object.entries(SOUNDS)) {
    for (const file of sound.files) used.set(file, { name, sound });
}

for (const file of used.keys()) {
    const path = join(ROOT, file);
    check(existsSync(path) && statSync(path).size > 1000, `plik ${file}`);
}

const onDisk = [];
for (const folder of readdirSync(ROOT, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    for (const file of readdirSync(join(ROOT, folder.name))) {
        if (file.endsWith('.ogg')) onDisk.push(`${folder.name}/${file}`);
    }
}
for (const file of onDisk) check(used.has(file), `${file} - plik nieużywany w src/audio/sounds.js`);


// --- Nagrania (nie z tools/dzwieki.py) ---------------------------------

const manifest = JSON.parse(readFileSync(join(ROOT, 'nagrania.json'), 'utf8'));
const recorded = Object.keys(manifest.pliki);
check(recorded.length > 0, 'nagrania.json - lista plików');
for (const file of recorded) check(used.has(file), `nagrania.json: ${file} - nie ma takiego dźwięku w grze`);


// --- Zawartość (ffmpeg) ------------------------------------------------

// Próbki (bez zmiany formatu) i format pliku - z opisu strumienia,
// który ffmpeg wypisuje na stderr ("Audio: vorbis, 44100 Hz, mono").
function decode(path) {
    const run = spawnSync('ffmpeg', ['-hide_banner', '-i', path, '-f', 's16le', '-'], { maxBuffer: 64 * 1024 * 1024 });
    if (run.error) throw run.error;
    assert.equal(run.status, 0, `${path}: ffmpeg - błąd odczytu`);
    const info = run.stderr.toString().match(/Audio: [^,]+, (\d+) Hz, ([^,\n]+)/);
    const raw = run.stdout;
    return {
        pcm: new Int16Array(raw.buffer, raw.byteOffset, raw.length / 2),
        rate: info ? Number(info[1]) : 0,
        channels: info?.[2] === 'mono' ? 1 : info?.[2] === 'stereo' ? 2 : 0
    };
}

let decoded = 0;
try {
    for (const [file, { name, sound }] of used) {
        const path = join(ROOT, file);
        const { pcm, channels, rate } = decode(path);
        check(channels === 1 && rate === SR, `${file}: mono ${SR} Hz (jest ${channels} kan., ${rate} Hz)`);
        const seconds = pcm.length / SR;

        let peak = 0;
        for (const v of pcm) peak = Math.max(peak, Math.abs(v));
        peak /= 32767;
        check(20 * Math.log10(peak) < -0.5, `${file}: szczyt ${(20 * Math.log10(peak)).toFixed(2)} dBFS (przester)`);

        if (sound.loop) {
            // Szew pętli: skok między ostatnią a pierwszą próbką nie
            // większy niż zwykłe skoki między sąsiednimi próbkami.
            const seam = Math.abs(pcm[0] - pcm[pcm.length - 1]) / 32767;
            let typical = 0;
            for (let i = 1; i < SR; i++) typical += Math.abs(pcm[i] - pcm[i - 1]) / 32767;
            typical /= SR;
            check(seam < typical * 8 + 0.02, `${file}: pętla - trzask na szwie (${seam.toFixed(3)})`);
            check(seconds >= 4, `${file}: pętla za krótka (${seconds.toFixed(2)} s)`);
        }
        else {
            // Początek: głośność (okna 10 ms) przekracza 10% szczytu
            // najpóźniej po 0,15 s - bez ciszy przed dźwiękiem.
            const n = SR / 100;
            const env = [];
            for (let i = 0; i + n <= pcm.length; i += n / 2) {
                let sum = 0;
                for (let j = i; j < i + n; j++) sum += pcm[j] * pcm[j];
                env.push(Math.sqrt(sum / n));
            }
            const top = Math.max(...env);
            const onset = env.findIndex((v) => v > top * 0.1) * (n / 2) / SR;
            check(onset <= 0.15, `${file}: cisza na początku (${onset.toFixed(3)} s)`);
            if (name.startsWith('step_')) check(seconds <= 0.5, `${file}: krok za długi (${seconds.toFixed(2)} s)`);
        }
        decoded++;
    }
}
catch (error) {
    if (error.code !== 'ENOENT') throw error;
    console.log('(bez ffmpeg - zawartość plików niesprawdzona)');
}

console.log(`OK: dźwięki - ${checks} sprawdzeń (${used.size} plików${decoded ? `, ${decoded} odczytanych` : ''}, nagrań: ${recorded.length}).`);

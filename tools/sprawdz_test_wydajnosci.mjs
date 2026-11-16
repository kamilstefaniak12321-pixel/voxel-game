// ------------------------------------------------------------
// SPRAWDZENIE TESTU WYDAJNOŚCI I WYMAGANIA WebGL 2 (1.10.1)
//
// - sesja pomiaru w PerfDiagnostics: sumy etapów CPU i próbki GPU z całego
//   testu, niezależnie od sekundowych okien i resetów (pauza),
// - opis wyniku na czat: ranking etapów, karta graficzna, co ogranicza,
// - komenda /wydajnosc test | lot,
// - gra wymaga WebGL 2: czytelny komunikat na starcie, bez dawnych
//   ścieżek zastępczych w kodzie.
//
// Uruchomienie: node tools/sprawdz_test_wydajnosci.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { PerfDiagnostics, PERF_STAGES } from '../src/diagnostics/PerfDiagnostics.js';
import { BENCHMARK_FLIGHT, BENCHMARK_MODES, benchmarkText } from '../src/diagnostics/Benchmark.js';

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const near = (a, b, message) => check(Math.abs(a - b) < 0.005, `${message}: ${a} != ${b}`);
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');


// --- Sesja pomiaru ------------------------------------------------------------

function recorder() {
    let clock = 0;
    const samples = [];
    const gpuTimer = { generation: 0, poll(frame, accept) { for (const sample of samples.splice(0)) accept(sample); },
        begin() {}, end() {}, clear() {}, dispose() {}, info: () => ({ status: 'available', supported: true }) };
    const perf = new PerfDiagnostics({ now: () => clock, gpuTimer });
    // Klatka: etapy [id, ms], potem do następnego RAF mija "interval".
    const frame = (stages, interval) => {
        perf.beginFrame(clock);
        for (const [id, ms] of stages) { perf.beginStage(id); clock += ms; perf.endStage(id); }
        perf.endFrame();
        const used = stages.reduce((sum, [, ms]) => sum + ms, 0);
        clock += interval - used;
    };
    return { perf, frame, gpu: (ms) => samples.push({ ms, at: clock, latencyFrames: 1 }), close: () => perf.beginFrame(clock) };
}

{
    const { perf } = recorder();
    equal(perf.endSession(), null, 'Bez sesji nie ma wyniku');
    perf.startSession();
    equal(perf.endSession(), null, 'Sesja bez klatek (wyłączone logi wydajności) - brak wyniku');
}

{
    const r = recorder();
    r.frame([['mesh', 2]], 16);                       // przed sesją - nie liczy się
    r.perf.startSession();
    for (let i = 0; i < 100; i++) {
        r.gpu(4 + (i % 2));
        r.frame([['mesh', 6], ['world', 2], ['player', 1]], 16);
    }
    r.frame([['mesh', 40], ['generation', 20]], 80);  // jedno przycięcie
    r.close();
    const result = r.perf.endSession();
    // Pierwsza klatka sesji domyka klatkę sprzed sesji, ostatnia czeka na następny RAF: 101 odstępów.
    equal(result.frames, 101, 'Liczba klatek sesji');
    equal(result.stages[0].id, 'mesh', 'Najdroższy etap pierwszy');
    near(result.stages[0].maxMs, 40, 'Najdłuższy etap z przycięcia');
    check(result.stages[0].meanMs > 5.9 && result.stages[0].meanMs < 6.5, `Średni koszt siatek (${result.stages[0].meanMs})`);
    equal(result.stages.map((stage) => stage.id), ['mesh', 'world', 'player', 'generation'], 'Ranking etapów po średnim koszcie');
    near(result.stages.reduce((sum, stage) => sum + stage.share, 0), 1, 'Udziały etapów sumują się do całości');
    equal(result.worstMs, 80, 'Najdłuższa klatka');
    equal(result.slowFrames, 1, 'Klatki wolniejsze niż cel');
    check(result.fps > 55 && result.fps < 63, `FPS sesji (${result.fps})`);
    check(result.gpu.samples === 100 && result.gpu.meanMs > 4.4 && result.gpu.meanMs < 4.6 && result.gpu.p95Ms === 5, 'Próbki karty graficznej z całej sesji');
    equal(r.perf.session, null, 'Sesja zamknięta');
    equal(r.perf.endSession(), null, 'Drugie zamknięcie nic nie zwraca');
}

{
    // Sesja dłuższa niż okno raportu (publikacja co sekundę zeruje okno) i pauza w środku.
    const r = recorder();
    r.perf.startSession();
    for (let i = 0; i < 300; i++) r.frame([['update', 3]], 16);
    r.perf.reset('pause');
    for (let i = 0; i < 300; i++) r.frame([['update', 5]], 16);
    r.close();
    const result = r.perf.endSession();
    check(result.frames >= 597 && result.frames <= 599, `Sesja obejmuje wiele okien i pauzę (${result.frames})`);
    check(result.stages[0].id === 'update' && Math.abs(result.stages[0].meanMs - 4) < 0.05, 'Średnia z całej sesji, nie z ostatniego okna');
    check(result.worstMs <= 16.001, 'Pauza nie udaje przycięcia');
}

equal(new Set(PERF_STAGES.map(([id]) => id)).size, PERF_STAGES.length, 'Etapy mają różne nazwy');


// --- Opis wyniku -------------------------------------------------------------------

const base = { mode: 'spin', seconds: 10, fps: 58.4, low1: 41.2, worstMs: 31.4, updateMs: 6.2, renderMs: 4.1,
    calls: 412, triangles: 1840000, queue: 0, distance: 0, viewDistance: 160, farTerrain: 2048, potato: false };
const stages = (cpuMs, gpuMs, samples = 50) => ({ frames: 600, fps: 58, frameMs: 17, cpuMs, worstMs: 31, slowFrames: 7, targetFps: 60,
    stages: [{ id: 'mesh', label: 'Siatki bloków i roślin', meanMs: cpuMs * 0.5, maxMs: 22, share: 0.5 },
        { id: 'world', label: 'Wysyłanie świata (CPU)', meanMs: cpuMs * 0.3, maxMs: 6, share: 0.3 },
        { id: 'ui', label: 'Interfejs i dźwięk', meanMs: 0.01, maxMs: 0.2, share: 0.001 }],
    gpu: { status: 'available', samples, meanMs: samples ? gpuMs : null, p95Ms: samples ? gpuMs * 1.4 : null } });

{
    const text = benchmarkText({ ...base, stages: stages(12, 5) });
    check(text.startsWith('Test wydajności (10 s, obrót dookoła): średnio 58 FPS'), 'Nagłówek testu z obrotem');
    check(text.includes('412 rysowań, 1840 tys. trójkątów') && text.includes('zasięg 160, daleki teren 2048'), 'Rysowanie i ustawienia');
    check(text.includes('Siatki bloków i roślin 6,0 ms (50%, najwięcej 22)') && text.includes('Wysyłanie świata (CPU) 3,6 ms (30%'), 'Ranking etapów z udziałem');
    check(!text.includes('Interfejs i dźwięk'), 'Pomijalne etapy nie zaśmiecają wyniku');
    check(text.includes('Procesor: 12 ms na klatkę z 17 ms budżetu; klatek wolniejszych niż cel: 7 z 600'), 'Procesor na tle budżetu klatki');
    check(text.includes('Karta graficzna: średnio 5,0 ms, 95% klatek do 7,0 ms (50 próbek)'), 'Czas karty graficznej');
    check(text.includes('Najwięcej kosztuje procesor'), 'Wskazanie: procesor');
    check(!text.includes('kolejka terenu'), 'Kolejka terenu tylko w przelocie');
}
check(benchmarkText({ ...base, stages: stages(4, 14) }).includes('Najwięcej kosztuje karta graficzna'), 'Wskazanie: karta graficzna');
check(benchmarkText({ ...base, stages: stages(4, 5) }).includes('Ani procesor, ani karta nie wyczerpują budżetu klatki'), 'Wskazanie: zapas');
check(benchmarkText({ ...base, stages: stages(4, 0, 0) }).includes('Karta graficzna: brak pomiaru'), 'Brak pomiaru GPU powiedziany wprost');
check(benchmarkText({ ...base, stages: null }).includes('brak pomiaru (włącz Ustawienia → Gra → Logi wydajności)'), 'Wyłączone logi wydajności');
{
    const text = benchmarkText({ ...base, mode: 'flight', seconds: 20, distance: 480, queue: 37, potato: true, farTerrain: 0, stages: stages(9, 3) });
    check(text.includes('(20 s, przelot 480 bloków)') && text.includes('najdłuższa kolejka terenu: 37 chunków'), 'Przelot: dystans i kolejka terenu');
    check(text.includes('daleki teren wył., tryb ziemniaka'), 'Ustawienia w wyniku przelotu');
}
equal(Object.keys(BENCHMARK_MODES), ['spin', 'flight'], 'Dwa rodzaje testu');
check(BENCHMARK_FLIGHT.speed >= 16 && BENCHMARK_FLIGHT.speed <= 40 && BENCHMARK_FLIGHT.climb >= 20 && BENCHMARK_FLIGHT.pitch < 0, 'Przelot: szybciej niż gracz, nad terenem, kamera w dół');


// --- Gra i komenda ---------------------------------------------------------------------

{
    const game = source('src/game/Game.js'), command = source('src/commands/settingsCommands.js'), main = source('src/main.js');
    check(game.includes("startBenchmark(seconds, mode = 'spin')") && game.includes('this.perfDiagnostics?.startSession()') && game.includes('this.perfDiagnostics?.endSession()'), 'Test otwiera i zamyka sesję pomiaru');
    check(game.includes('player.pos.copy(test.startPos)') && game.includes('player.flying = test.startFlying'), 'Po przelocie gracz wraca na miejsce startu');
    check(game.includes('this.onBenchmark?.(result)') && main.includes("'performance.benchmark'"), 'Wynik trafia do raportu diagnostycznego');
    check(command.includes("'/wydajnosc | /wydajnosc test [sekundy] | /wydajnosc lot [sekundy]'") && command.includes("['lot', 'przelot', 'flight']") && command.includes('Test wydajności już trwa'), 'Komenda: test, lot i ochrona przed drugim testem');
    check(source('docs/komendy.md').includes('/wydajnosc lot'), 'Komenda opisana w dokumentacji');
}


// --- WebGL 2 --------------------------------------------------------------------------------

{
    const main = source('src/main.js'), start = source('src/start.js');
    check(main.includes('if (!renderer.capabilities.isWebGL2)') && main.includes('userMessage') && main.indexOf('isWebGL2') < main.indexOf('document.body.appendChild(renderer.domElement)'), 'Brak WebGL 2: błąd z wyjaśnieniem, zanim powstanie obraz gry');
    check(start.includes('error?.userMessage'), 'Ekran błędu startowego pokazuje wyjaśnienie');
    // Poza tym jednym miejscem kod nie rozgałęzia się już na WebGL 1.
    const files = [];
    const walk = (dir) => { for (const name of readdirSync(dir)) { const path = `${dir}/${name}`; if (statSync(path).isDirectory()) walk(path); else if (name.endsWith('.js')) files.push(path); } };
    walk(new URL('../src', import.meta.url).pathname);
    const users = files.filter((path) => readFileSync(path, 'utf8').includes('isWebGL2')).map((path) => path.split('/src/')[1]);
    equal(users, ['main.js'], 'isWebGL2 sprawdzane tylko przy starcie');
    check(!source('src/rendering/LeafSeasons.js').includes('LEAF_SEASONS'), 'Pory roku liści bez wyłącznika');
    check(!source('src/rendering/Shadows.js').includes('this.supported'), 'Cienie bez wyłącznika');
}

console.log(`OK: test wydajności i wymaganie WebGL 2 - ${checks} sprawdzeń (sesja pomiaru, opis wyniku, komenda, start).`);

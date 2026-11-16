// ------------------------------------------------------------
// TEST WYDAJNOŚCI - ustawienia i opis wyniku (1.10.1)
//
// Sam test prowadzi Game.startBenchmark / updateBenchmark; tu jest
// to, co da się sprawdzić bez gry: parametry przelotu i zamiana wyniku
// na tekst dla czatu. Wynik (obiekt) trafia też do raportu /logi.
// ------------------------------------------------------------

// Przelot: prędkość w blokach na sekundę (szybciej niż sprint w locie,
// żeby wczytywanie świata było pod obciążeniem), wysokość nad miejscem
// startu i pochylenie kamery (lekko w dół - widać i teren, i horyzont).

export const BENCHMARK_FLIGHT = Object.freeze({ speed: 24, climb: 30, pitch: -0.3 });

export const BENCHMARK_MODES = Object.freeze({ spin: 'obrót dookoła', flight: 'przelot' });


const ms = (value) => value.toFixed(value >= 10 ? 0 : 1).replace('.', ',');


// Ranking etapów CPU: najwyżej pięć, tylko te, które ważą (od 0,05 ms).

function stageLines(stages) {

    if (!stages) {
        return 'Etapy klatki: brak pomiaru (włącz Ustawienia → Gra → Logi wydajności).';
    }

    const top = stages.stages.filter((stage) => stage.meanMs >= 0.05).slice(0, 5)
        .map((stage) => `${stage.label} ${ms(stage.meanMs)} ms (${Math.round(stage.share * 100)}%, najwięcej ${ms(stage.maxMs)})`);

    const gpu = stages.gpu.samples > 0
        ? `Karta graficzna: średnio ${ms(stages.gpu.meanMs)} ms, 95% klatek do ${ms(stages.gpu.p95Ms)} ms (${stages.gpu.samples} próbek)`
        : 'Karta graficzna: brak pomiaru (sterownik nie udostępnia czasu GPU)';

    // Co ogranicza: procesor, gdy sam kod gry zjada większość budżetu klatki.
    const budget = 1000 / stages.targetFps;
    const limit = stages.gpu.samples > 0 && stages.gpu.meanMs > stages.cpuMs && stages.gpu.meanMs > budget * 0.6
        ? 'Najwięcej kosztuje karta graficzna.'
        : stages.cpuMs > budget * 0.6
            ? 'Najwięcej kosztuje procesor (kod gry).'
            : 'Ani procesor, ani karta nie wyczerpują budżetu klatki.';

    return `Procesor: ${ms(stages.cpuMs)} ms na klatkę z ${ms(budget)} ms budżetu; klatek wolniejszych niż cel: ${stages.slowFrames} z ${stages.frames}\n` +
        `Na co: ${top.join(' | ') || 'nic mierzalnego'}\n${gpu}\n${limit}`;

}


// Skąd biorą się polecenia rysowania i ile terenu silnik w ogóle ogląda
// (sektory - rendering/TerrainSectors.js).

function sceneLine(result) {

    if (!result.draws || !result.terrain) {
        return '';
    }

    const { draws, terrain } = result;

    return `Rysowania: świat ${draws.world}, daleki teren ${draws.far}, cienie ${draws.shadows} | ` +
        `teren: ${terrain.objects} obiektów w ${terrain.sectors} sektorach, w kadrze średnio ${terrain.visible} sektorów\n`;

}


export function benchmarkText(result) {

    const flight = result.mode === 'flight';

    return `Test wydajności (${result.seconds} s, ${BENCHMARK_MODES[result.mode]}` +
        `${flight ? ` ${result.distance} bloków` : ''}): ` +
        `średnio ${result.fps.toFixed(0)} FPS, ` +
        `najwolniejsze 1%: ${result.low1.toFixed(0)} FPS, ` +
        `najdłuższa klatka ${result.worstMs.toFixed(1)} ms | ` +
        `gra ${result.updateMs.toFixed(1)} ms, rysowanie ${result.renderMs.toFixed(1)} ms na klatkę | ` +
        `${result.calls} rysowań, ${Math.round(result.triangles / 1000)} tys. trójkątów` +
        `${flight ? ` | najdłuższa kolejka terenu: ${result.queue} chunków` : ''} | ` +
        `zasięg ${result.viewDistance}, daleki teren ${result.farTerrain || 'wył.'}` +
        `${result.potato ? ', tryb ziemniaka' : ''}\n${sceneLine(result)}${stageLines(result.stages)}`;

}

const number = (value, digits = 1) => Number.isFinite(value) ? value.toFixed(digits) : 'brak danych';
const list = (value) => Array.isArray(value) ? value : [];
const details = (value) => {
    const text = JSON.stringify(value);
    return text.length > 1800 ? `${text.slice(0, 1800)}… (pełne dane w JSON)` : text;
};
function contextLines(context, prefix = '') {
    if (!context) return [];
    const result = [`${prefix}Stan gry: ${context.state || 'nieznany'}.`];
    if (context.world) result.push(`${prefix}Świat: seed ${context.world.seed ?? '?'}, ${context.world.terrain || '?'}, pozycja ${JSON.stringify(context.world.position || {})}.`);
    if (context.hardware) result.push(`${prefix}Sprzęt: ${details(context.hardware)}`);
    if (context.viewport) result.push(`${prefix}Obraz: ${details(context.viewport)}`);
    return result;
}

export function diagnosticsReportText(report) {
    const lines = ['VOXEL GAME — RAPORT DIAGNOSTYCZNY',
        `Wersja: ${report.session?.version || 'nieznana'}`,
        `Sesja: ${report.session?.id || 'nieznana'}`,
        `Początek: ${report.session?.startedAt || '?'}`,
        `Raport: ${report.exportedAt || '?'}`, '',
        'Raport lokalny. Wskazania wydajności są dowodami i podejrzeniami, nie dowodem jednej przyczyny.',
        'Czas CPU wysyłania rysowania nie jest czasem pracy GPU; brak pomiaru GPU jest oznaczony jawnie.', ''];
    const events = list(report.events);
    const failures = events.filter((entry) => entry.level === 'error' || entry.level === 'fatal');
    const warnings = events.filter((entry) => entry.level === 'warn');
    lines.push(`Błędy w zachowanej historii: ${failures.length}; ostrzeżenia: ${warnings.length}.`,
        `Pominięte zdarzenia przez limity: ${report.limits?.droppedEvents || 0}; zgrupowane powtórzenia: ${report.limits?.repeatedEvents || 0}.`,
        `Zapis logów: ${report.storage?.state || 'nieznany'}${report.storage?.error ? ` — ${report.storage.error}` : ''}.`);
    lines.push(...contextLines(report.session?.context));
    if (report.session?.context?.settings) lines.push(`Ustawienia: ${details(report.session.context.settings)}`);
    lines.push('', 'WYDAJNOŚĆ — ZACHOWANA HISTORIA');
    const samples = list(report.performance);
    if (!samples.length) lines.push('Brak próbek aktywnej gry. Pauza i ukryte okno nie są spadkami FPS.');
    else {
        const duration = samples.reduce((sum, sample) => sum + (sample.durationMs || 0), 0);
        const frames = samples.reduce((sum, sample) => sum + (sample.frames || 0), 0);
        const max = Math.max(...samples.map((sample) => sample.frame?.maxMs || 0));
        const slow = samples.reduce((sum, sample) => sum + (sample.frame?.above33ms || 0), 0);
        const latest = samples[samples.length - 1];
        lines.push(`${samples.length} próbek; ${number(duration / 1000)} s; średnio ${number(duration ? frames * 1000 / duration : NaN)} FPS.`,
            `Najdłuższa klatka: ${number(max)} ms; klatki >33 ms: ${slow}.`,
            `Ostatnia próbka: ${number(latest.fps)} FPS, P95 klatki ${number(latest.frame?.p95Ms)} ms, CPU ${number(latest.cpu?.meanMs)} ms.`,
            `GPU: ${latest.gpu?.status || 'brak pomiaru'}, próbek ${latest.gpu?.samples || 0}, średnio ${number(latest.gpu?.meanMs)} ms.`);
        const stages = new Map();
        for (const sample of samples) for (const stage of list(sample.stages)) {
            if (!stage || typeof stage !== 'object') continue;
            const current = stages.get(stage.id) || { label: stage.label || stage.id, total: 0, weight: 0, max: 0 };
            const weight = sample.frames || 1;
            current.total += (stage.meanMs || 0) * weight;
            current.weight += weight;
            current.max = Math.max(current.max, stage.maxMs || 0);
            stages.set(stage.id, current);
        }
        lines.push('Najdroższe zmierzone etapy CPU (średnia / maksimum):');
        for (const stage of [...stages.values()].sort((a, b) => b.total / b.weight - a.total / a.weight).slice(0, 8)) {
            lines.push(`- ${stage.label}: ${number(stage.total / stage.weight, 2)} / ${number(stage.max, 2)} ms`);
        }
        const slowStages = new Map();
        let recordedSlowFrames = 0;
        for (const sample of samples) for (const slowFrame of list(sample.slowFrames)) {
            recordedSlowFrames++;
            for (const stage of list(slowFrame.stages)) {
                if (!stage || !Number.isFinite(stage.ms)) continue;
                const current = slowStages.get(stage.id) || { label: stage.label || stage.id, total: 0, count: 0, max: 0 };
                current.total += stage.ms; current.count++; current.max = Math.max(current.max, stage.ms);
                slowStages.set(stage.id, current);
            }
        }
        lines.push('', `CPU W ZACHOWANYCH WOLNYCH KLATKACH (${recordedSlowFrames} obserwacji)`,
            'Rejestr zachowuje najwyżej 3 najwolniejsze klatki każdego okresu i ich 5 najdroższych etapów.',
            'Poniższe sumy dotyczą tych obserwacji, nie wszystkich przycięć ani całej rozgrywki.');
        for (const stage of [...slowStages.values()].sort((a, b) => b.total - a.total).slice(0, 8)) {
            lines.push(`- ${stage.label}: łącznie ${number(stage.total, 2)} ms CPU w ${stage.count} obserwacjach; maksimum ${number(stage.max, 2)} ms.`);
        }
        const gpuWindows = samples.filter(sample => sample.gpu?.samples > 0 && sample.gpu.p95Ms > 1000 / (sample.targetFps || 60)).length;
        const unknownWindows = samples.filter(sample => list(sample.suspects).some(suspect => suspect?.kind === 'unattributed')).length;
        lines.push(`Okresy z P95 próbek GPU powyżej budżetu klatki: ${gpuWindows}/${samples.length}. To próbki okresu, bez przypisania GPU do konkretnej wolnej klatki.`,
            `Okresy z wydłużoną klatką bez wystarczającego wyjaśnienia: ${unknownWindows}.`);
        lines.push('Ostatnie wskazania:');
        for (const suspect of list(latest.suspects)) if (suspect) lines.push(`- ${suspect.message || suspect.kind}: ${details(suspect.evidence || {})}`);
    }
    lines.push('', 'BŁĘDY I SPADEK PŁYNNOŚCI');
    const important = events.filter((entry) => entry.level !== 'info' || /performance|crash/.test(entry.kind)).slice(-40);
    if (!important.length) lines.push('Nie zarejestrowano błędów ani ostrzeżeń w zachowanym zakresie.');
    for (const event of important) {
        lines.push(`[${event.at}] ${event.level.toUpperCase()} ${event.kind}: ${event.message}${event.count > 1 ? ` (×${event.count})` : ''}`);
        const summary = event.data?.summary;
        if (summary && typeof summary === 'object') {
            lines.push(`  ${number(summary.fps)} FPS; P95 ${number(summary.frame?.p95Ms)} ms; najdłuższa klatka ${number(summary.frame?.maxMs)} ms; CPU średnio ${number(summary.cpu?.meanMs)} ms.`,
                `  GPU: ${summary.gpu?.status || 'brak pomiaru'}, próbki ${summary.gpu?.samples || 0}, P95 ${number(summary.gpu?.p95Ms)} ms.`);
            for (const frame of list(summary.slowFrames)) {
                lines.push(`  Wolna klatka ${number(frame.frameMs)} ms: CPU ${number(frame.cpuMs)} ms. Etapy: ${list(frame.stages).map(stage => `${stage.label || stage.id} ${number(stage.ms, 2)} ms`).join('; ')}.`);
            }
            for (const suspect of list(summary.suspects)) if (suspect) lines.push(`  Wskazanie: ${suspect.message} ${details(suspect.evidence || {})}`);
            if (summary.resources) lines.push(`  Teren: ${summary.resources.chunks ?? '?'} chunków, kolejka ${summary.resources.queued ?? '?'}, do przebudowy ${summary.resources.dirty ?? '?'}, rośliny do przebudowy ${summary.resources.dirtyPlants ?? '?'}.`);
        } else if (event.data?.error) {
            const error = event.data.error;
            lines.push(`  ${error.stack || details(error)}`);
            if (event.data.details) lines.push(`  Szczegóły: ${details(event.data.details)}`);
        } else if (event.data) lines.push(`  Szczegóły: ${details(event.data)}`);
        lines.push(...contextLines(event.context, '  '));
    }
    lines.push('', 'ZDARZENIA POPRZEDZAJĄCE (OSTATNIE 30)');
    for (const event of events.slice(-30)) lines.push(`[${event.at}] ${event.kind}: ${event.message}`);
    if (report.previous) {
        lines.push('', 'POPRZEDNIA SESJA', `Sesja: ${report.previous.sessionId || report.previous.session?.id || '?'}`);
        const closed = report.previous.cleanExit ?? report.previous.session?.cleanShutdown;
        lines.push(closed ? 'Poprzednie zamknięcie potwierdzone.'
            : 'Poprzednie zamknięcie niepotwierdzone: możliwa awaria, wymuszone zamknięcie lub przerwany zapis.');
        const previous = report.previous.events || report.previous.records?.filter((entry) => entry.type === 'event') || [];
        for (const event of previous.filter((entry) => entry.level === 'error' || entry.level === 'fatal').slice(-12)) {
            lines.push(`[${event.at || '?'}] ${event.kind || 'error'}: ${event.message || '?'}${event.data ? ` ${JSON.stringify(event.data)}` : ''}`);
        }
        lines.push('Pełniejsze zachowane dane poprzedniej sesji są w pliku JSON.');
    }
    lines.push('', 'Pamięć jest ograniczona; raport obejmuje zachowane próbki, nie całą historię aplikacji.',
        'Logi nie są automatycznie wysyłane. Raport techniczny może zawierać seed i współrzędne świata.');
    return lines.join('\n');
}

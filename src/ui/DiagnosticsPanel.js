// Panel operuje tylko na zebranych podsumowaniach. Otwieranie raportu
// nie uruchamia benchmarku ani kosztownych pomiarów w świecie.
const ms = value => Number.isFinite(value) ? `${value.toFixed(2)} ms` : 'brak pomiaru';
const node = (tag, text = '', className = '') => {
    const element = document.createElement(tag);
    element.textContent = text;
    element.className = className;
    return element;
};

export async function exportDiagnostics(diagnostics) {
    await diagnostics.flush();
    const report = diagnostics.snapshot({ includePrevious: true });
    const text = diagnostics.reportText(report);
    if (window.voxelDiagnostics?.exportReport) {
        return window.voxelDiagnostics.exportReport({ report, text });
    }
    const blob = new Blob([JSON.stringify({ ...report, readableReport: text }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = node('a');
    link.href = url;
    link.download = `Voxel-Game-raport-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return { ok: true, download: true };
}

export function diagnosticsPanel(diagnostics, button, markProblem) {
    const panel = node('div', '', 'diagnostics-panel');
    const statusLine = node('p', '', 'menu-note');
    const storageLine = node('p', '', 'menu-note');
    const metrics = node('div', '', 'diagnostics-metrics');
    const load = node('p', '', 'menu-note');
    const events = node('div', '', 'diagnostics-events');
    let eventSignature = null;
    const message = node('p', '', 'menu-note');
    message.setAttribute('role', 'status');
    const actions = node('div', '', 'menu-row diagnostics-actions');
    const save = button('Zapisz raport', async () => {
        save.disabled = true;
        try {
            const result = await exportDiagnostics(diagnostics);
            message.textContent = result.cancelled ? 'Anulowano zapis.' : result.ok
                ? result.download ? 'Raport przekazany do pobrania. Jeśli pobieranie jest niedostępne, użyj „Pokaż treść”.' : 'Raport zapisany.'
                : result.error || 'Nie udało się zapisać raportu.';
        } catch (error) {
            message.textContent = 'Nie udało się zapisać raportu. Możesz skopiować jego treść.';
            diagnostics.error('report.export', error);
        } finally { save.disabled = false; }
    });
    const text = node('textarea', '', 'diagnostics-report');
    text.readOnly = true;
    text.hidden = true;
    text.setAttribute('aria-label', 'Treść raportu diagnostycznego do skopiowania');
    actions.append(save, button('Zaznacz problem', () => {
        markProblem();
        message.textContent = 'Zaznaczono moment problemu. Raport zawiera wcześniejsze pomiary.';
        refresh();
    }), button('Pokaż treść', () => {
        text.value = diagnostics.reportText(diagnostics.snapshot({ includePrevious: true }));
        text.hidden = false;
        text.focus();
        text.select();
        message.textContent = 'Możesz zaznaczyć i skopiować raport. Eksport pliku zawiera również szczegółowe pomiary.';
    }));
    if (window.voxelDiagnostics?.openFolder) actions.append(button('Folder logów', async () => {
        try {
            const result = await window.voxelDiagnostics.openFolder();
            message.textContent = result.ok ? 'Otwarto folder logów.' : result.error || 'Nie udało się otworzyć folderu.';
        } catch { message.textContent = 'Nie udało się otworzyć folderu logów.'; }
    }));
    panel.append(
        node('p', 'Lokalny zapis błędów i spadków FPS. F8 podczas gry zaznacza moment problemu. Raport pozostaje na urządzeniu, dopóki sam go nie udostępnisz.', 'menu-note'),
        statusLine, storageLine, metrics, load, events, actions, message, text
    );
    function refresh() {
        const status = diagnostics.status();
        statusLine.textContent = `Zachowana historia: błędy ${status.errors} · spadki FPS ${status.incidents} · próbki ${status.samples}`;
        storageLine.textContent = status.storage.error
            ? 'Zapis logów ma problem. Raport z pamięci nadal można wyeksportować.'
            : status.storage.state === 'desktop' ? 'Logi zapisywane automatycznie na dysku.'
                : status.storage.state === 'memory' ? 'Raport w pamięci. Oczekiwanie na zapis lokalny.' : 'Ograniczona historia jest zapisywana lokalnie w przeglądarce.';
        if (status.previousAvailable) storageLine.textContent += ' Eksport zawiera też poprzednią sesję.';
        const p = status.latestPerformance;
        metrics.replaceChildren();
        if (p) {
            for (const [label, value] of [
                ['Ostatnia próbka', Number.isFinite(p.fps) ? `${p.fps.toFixed(1)} FPS` : '—'],
                ['95% klatek poniżej', ms(p.frame?.p95Ms)],
                ['Praca CPU', ms(p.cpu?.meanMs)],
                ['GPU (próbkowany)', p.gpu?.samples ? ms(p.gpu.meanMs) : 'pomiar niedostępny']
            ]) {
                const metric = node('div', '', 'diagnostics-metric');
                metric.append(node('span', label), node('strong', value));
                metrics.append(metric);
            }
            const stages = p.stages?.slice(0, 3).map(stage => `${stage.label}: ${ms(stage.meanMs)}`).join(' · ');
            const suspects = p.suspects?.map(item => item.message).join(' ');
            load.textContent = `${stages ? `Najdroższe zmierzone etapy CPU: ${stages}. ` : ''}${suspects || 'Brak rozpoznanego przeciążenia w ostatniej próbce.'} Wnioski są wskazówkami, nie dowodem przyczyny.`;
        } else load.textContent = 'Rozpocznij rozgrywkę z włączonymi logami wydajności. Pauza i ukrycie okna nie są liczone jako spadki FPS.';
        const recent = diagnostics.recentEvents(60).filter(event => event.level === 'error' || event.kind === 'performance.drop' || event.kind === 'user.problem').slice(-8).reverse();
        const signature = recent.map(event => `${event.id}:${event.count}`).join('|');
        if (signature === eventSignature) return;
        eventSignature = signature;
        const opened = new Set([...events.querySelectorAll('details[open]')].map(item => item.dataset.eventId));
        events.replaceChildren(node('h3', 'Ostatnie problemy'));
        if (!recent.length) events.append(node('p', 'Nie zarejestrowano problemów w tej sesji.', 'menu-note'));
        for (const event of recent) {
            const item = node('details', '', 'diagnostics-event');
            item.dataset.eventId = event.id;
            item.open = opened.has(event.id);
            const time = new Date(event.at).toLocaleTimeString('pl-PL');
            item.append(node('summary', `${time} · ${event.message}${event.count > 1 ? ` (×${event.count})` : ''}`));
            const evidence = event.data?.summary?.suspects?.map(suspect => suspect.message).join('\n');
            item.append(node('pre', evidence || JSON.stringify(event.data ?? {}, null, 2).slice(0, 6000)));
            events.append(item);
        }
    }
    refresh();
    let timer = setInterval(() => {
        if (!panel.isConnected) { clearInterval(timer); timer = null; return; }
        refresh();
    }, 1000);
    return { element: panel, dispose() { clearInterval(timer); } };
}

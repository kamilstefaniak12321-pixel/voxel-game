import { diagnostics } from './diagnostics/Diagnostics.js';

// Diagnostyka musi działać przed importem świata, tekstur i samej gry.
// Dzięki temu raport obejmuje także błąd modułu albo nieudany start WebGL.
void diagnostics.initialize({ version: window.desktop?.version ?? 'nieznana' });
if (!window.desktop?.version) {
    const file = window.Capacitor?.isNativePlatform?.() ? '../wersja.json' : '../package.json';
    fetch(new URL(file, import.meta.url)).then(response => response.ok ? response.json() : null)
        .then(info => { if (typeof info?.version === 'string') diagnostics.setVersion(info.version); })
        .catch(() => {});
}

try {
    await import('./main.js');
} catch (error) {
    diagnostics.error('startup.failed', error);
    void diagnostics.flush();
    const root = document.getElementById('menu');
    const panel = document.createElement('div');
    panel.className = 'menu-screen overlay';
    const title = document.createElement('h2');
    title.className = 'menu-heading';
    title.textContent = 'Nie udało się uruchomić gry';
    const note = document.createElement('p');
    note.className = 'menu-note';
    note.textContent = 'Zapisz raport diagnostyczny — zawiera błąd i informacje o uruchomieniu.';
    const save = document.createElement('button');
    save.className = 'menu-button';
    save.textContent = 'Zapisz raport';
    save.onclick = async () => {
        try {
            const { exportDiagnostics } = await import('./ui/DiagnosticsPanel.js');
            const result = await exportDiagnostics(diagnostics);
            note.textContent = result.cancelled ? 'Anulowano zapis.' : result.ok ? 'Raport zapisany.' : result.error;
        } catch { note.textContent = 'Nie udało się wyeksportować raportu. Logi pozostają w pamięci aplikacji.'; }
    };
    panel.append(title, note, save);
    root.replaceChildren(panel);
    root.hidden = false;
}

// Nagłówki i zakresy MP3 pod własnym protokołem Electrona. Jego file fetch
// zwraca fragment danych jako 200 bez nagłówków rozmiaru — imitujemy ten
// zaobserwowany wynik, a nie serwer HTTP, który naprawiłby go za nas.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const { serveFile } = createRequire(import.meta.url)('../desktop/serve-file.cjs');
const folder = await mkdtemp(path.join(tmpdir(), 'voxel-music-stream-'));
let checks = 0;
function equal(actual, expected, message) { assert.deepEqual(actual, expected, message); checks++; }
let fetchCalls = [];
async function electronFileFetch(url, options) {
    fetchCalls.push({ url, options });
    const bytes = await readFile(fileURLToPath(url));
    const range = options?.headers?.Range;
    const [start, end] = range ? range.slice(6).split('-').map(Number) : [0, bytes.length - 1];
    return new Response(bytes.subarray(start, end + 1), { headers: { 'Content-Type': 'audio/mpeg' } });
}
function request(range, method = 'GET') {
    return new Request('https://voxel-game.test/music.mp3', {
        method, headers: range === undefined ? {} : { Range: range }
    });
}

try {
    const file = path.join(folder, 'utwór z odstępem.mp3');
    const data = Uint8Array.from({ length: 256 }, (_, i) => i);
    await writeFile(file, data);
    for (const [range, status, start, end] of [
        [undefined, 200, 0, 255], ['bytes=0-', 206, 0, 255],
        ['bytes=10-19', 206, 10, 19], ['bytes=255-', 206, 255, 255],
        ['bytes=100-', 206, 100, 255], ['bytes=-16', 206, 240, 255],
        ['bytes=-999', 206, 0, 255], ['bytes=250-999', 206, 250, 255]
    ]) {
        const result = await serveFile(request(range), file, electronFileFetch);
        equal(result.status, status, `${range}: status`);
        equal(result.headers.get('content-type'), 'audio/mpeg', `${range}: typ MP3`);
        equal(result.headers.get('accept-ranges'), 'bytes', `${range}: przewijanie`);
        equal(result.headers.get('content-length'), String(end - start + 1), `${range}: rozmiar fragmentu`);
        equal(result.headers.get('content-range'), range === undefined ? null : `bytes ${start}-${end}/256`, `${range}: pozycja fragmentu`);
        equal(new Uint8Array(await result.arrayBuffer()), data.slice(start, end + 1), `${range}: dokładne bajty`);
        equal(fileURLToPath(fetchCalls.at(-1).url), file, `${range}: polskie znaki i spacje`);
    }
    for (const range of ['bytes=256-', 'bytes=20-10', 'bytes=-0', 'bytes=-', 'bytes=', '',
        'bytes=1.5-9', 'items=0-10', 'bytes=0-1,3-4', 'bytes=9007199254740992-', 'bytes=+1-2']) {
        const calls = fetchCalls.length;
        const result = await serveFile(request(range), file, electronFileFetch);
        equal(result.status, 416, `${range}: odrzucony zakres`);
        equal(result.headers.get('content-range'), 'bytes */256', `${range}: rozmiar przy 416`);
        equal(result.headers.get('content-length'), '0', `${range}: pusta odpowiedź`);
        equal((await result.arrayBuffer()).byteLength, 0, `${range}: brak danych`);
        equal(fetchCalls.length, calls, `${range}: brak zbędnego odczytu`);
    }
    const calls = fetchCalls.length;
    const head = await serveFile(request('bytes=20-30', 'HEAD'), file, electronFileFetch);
    equal(head.status, 200, 'HEAD ignoruje Range');
    equal(head.headers.get('content-length'), '256', 'HEAD zna rozmiar całego pliku');
    equal(head.headers.get('content-range'), null, 'HEAD bez pozycji fragmentu');
    equal((await head.arrayBuffer()).byteLength, 0, 'HEAD bez danych');
    equal(fetchCalls.length, calls, 'HEAD nie otwiera strumienia');
    equal((await serveFile(request(undefined, 'POST'), file, electronFileFetch)).status, 405, 'MP3 tylko GET/HEAD');
    equal((await serveFile(request(), path.join(folder, 'brak.mp3'), electronFileFetch)).status, 404, 'brak MP3');
    const directory = path.join(folder, 'folder.mp3');
    await mkdir(directory);
    equal((await serveFile(request(), directory, electronFileFetch)).status, 404, 'folder nie jest plikiem muzyki');
    const empty = path.join(folder, 'pusty.mp3');
    await writeFile(empty, '');
    const emptyResult = await serveFile(request(), empty, electronFileFetch);
    equal(emptyResult.status, 200, 'pusty plik bez zakresu');
    equal(emptyResult.headers.get('content-length'), '0', 'pusty plik ma długość 0');
    equal((await emptyResult.arrayBuffer()).byteLength, 0, 'pusty plik bez danych');
    const emptyRange = await serveFile(request('bytes=0-'), empty, electronFileFetch);
    equal(emptyRange.status, 416, 'pusty plik nie ma zakresu');
    equal(emptyRange.headers.get('content-range'), 'bytes */0', '416 zna pusty rozmiar');
    const original = new Response('export const x = 1;', { headers: { 'Content-Type': 'application/javascript' } });
    equal(await serveFile(request(), path.join(folder, 'main.js'), () => original), original,
        'inne pliki zachowują oryginalną odpowiedź bez stat i zmiany nagłówków');
    const failure = new Response(null, { status: 404 });
    equal(await serveFile(request(), file, () => failure), failure, 'błąd źródła nie zmienia się w sukces');
    console.log(`Strumień muzyki: ${checks} sprawdzeń OK.`);
} finally {
    await rm(folder, { recursive: true, force: true });
}

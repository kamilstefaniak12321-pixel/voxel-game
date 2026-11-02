// net.fetch(file://) w Electronie 44 strumieniuje wskazany zakres, ale nie
// przekazuje Content-Length/Content-Range ani statusu 206. Bez nich MP3
// wygląda dla odtwarzacza jak nieskończony strumień i nie pozwala przewijać.
const { stat } = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function byteRange(header, size) {
    const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
    if (!match || (!match[1] && !match[2]) || size === 0) return null;
    const first = match[1] === '' ? null : Number(match[1]);
    const last = match[2] === '' ? null : Number(match[2]);
    if ((first !== null && !Number.isSafeInteger(first)) ||
        (last !== null && !Number.isSafeInteger(last))) return null;
    if (first === null) {
        if (last <= 0) return null;
        return { start: Math.max(0, size - last), end: size - 1 };
    }
    if (first >= size || (last !== null && last < first)) return null;
    return { start: first, end: Math.min(last ?? size - 1, size - 1) };
}

// Wywołujący wcześniej sprawdza, czy ścieżka leży w folderze gry.
// net.fetch pozostaje źródłem danych, także dla plików wewnątrz app.asar.
async function serveFile(request, file, fetchFile) {
    const url = pathToFileURL(file).href;
    if (path.extname(file).toLowerCase() !== '.mp3') return fetchFile(url);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    let info;
    try { info = await stat(file); }
    catch (error) {
        return new Response(null, { status: ['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 : 500 });
    }
    if (!info.isFile()) return new Response(null, { status: 404 });
    const headers = new Headers({
        'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes',
        'Content-Length': String(info.size), 'Last-Modified': info.mtime.toUTCString()
    });
    // Range dotyczy GET. HEAD podaje rozmiar całego pliku, bez odczytu danych.
    if (request.method === 'HEAD') return new Response(null, { headers });
    const rangeHeader = request.headers.get('range');
    const range = rangeHeader === null ? undefined : byteRange(rangeHeader, info.size);
    if (range === null) {
        headers.set('Content-Range', `bytes */${info.size}`);
        headers.set('Content-Length', '0');
        return new Response(null, { status: 416, headers });
    }
    if (range) {
        headers.set('Content-Range', `bytes ${range.start}-${range.end}/${info.size}`);
        headers.set('Content-Length', String(range.end - range.start + 1));
    }
    if (info.size === 0) return new Response(null, { headers });
    const response = await fetchFile(url, range
        ? { headers: { Range: `bytes=${range.start}-${range.end}` } } : undefined);
    if (!response.ok) return response;
    return new Response(response.body, { status: range ? 206 : 200, headers });
}

module.exports = { serveFile };

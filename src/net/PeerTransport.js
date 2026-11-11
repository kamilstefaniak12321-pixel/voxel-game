// ------------------------------------------------------------
// POŁĄCZENIE PRZEZ INTERNET (0.92.0)
//
// WebRTC przez bibliotekę PeerJS (lib/peerjs/, licencja MIT). Gospodarz
// rejestruje się w serwerze połączeń pod identyfikatorem z kodu
// zaproszenia, gość łączy się pod ten identyfikator. Serwer pomaga tylko
// nawiązać połączenie (wymiana adresów) - sama gra płynie bezpośrednio
// między komputerami, a gdy routery na to nie pozwalają, przez serwer
// pośredniczący TURN z domyślnych ustawień PeerJS.
//
// Domyślnie: darmowy publiczny serwer PeerJS (0.peerjs.com). Własny
// serwer (np. peerjs-server) - ustawienie "netServer", np.
// "https://moj-serwer.pl:443/peer".
// ------------------------------------------------------------

let library = null;

// Testy (tools/fixtures/net-loopback.js) podmieniają połączenie przez
// internet na połączenie między kartami przeglądarki.
const override = () => globalThis.__VOXEL_NET_TRANSPORT__ ?? null;

export function loadPeerLibrary() {
    if (globalThis.Peer) return Promise.resolve(globalThis.Peer);
    if (library) return library;
    library = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = new URL('lib/peerjs/peerjs.min.js', document.baseURI).href;
        script.onload = () => globalThis.Peer ? resolve(globalThis.Peer) : reject(new Error('Brak biblioteki połączeń'));
        script.onerror = () => { library = null; reject(new Error('Nie udało się wczytać biblioteki połączeń')); };
        document.head.append(script);
    });
    return library;
}

// "https://host:port/sciezka" -> opcje PeerJS; pusty tekst - serwer domyślny.
export function peerOptions(server = '') {
    const options = { debug: 0 };
    const text = String(server ?? '').trim();
    if (!text) return options;
    try {
        const url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`);
        const secure = url.protocol === 'https:' || url.protocol === 'wss:';
        options.host = url.hostname;
        options.port = Number(url.port) || (secure ? 443 : 80);
        options.path = url.pathname || '/';
        options.secure = secure;
        if (url.searchParams.get('key')) options.key = url.searchParams.get('key');
    } catch { /* zły adres - serwer domyślny */ }
    return options;
}

const ERRORS = {
    'peer-unavailable': 'Nie ma gry z tym kodem (gospodarz zamknął świat albo kod jest zły).',
    'unavailable-id': 'Ten kod jest zajęty - spróbuj jeszcze raz.',
    network: 'Brak połączenia z serwerem połączeń.',
    'server-error': 'Serwer połączeń nie odpowiada.',
    'socket-error': 'Brak połączenia z serwerem połączeń.',
    'socket-closed': 'Połączenie z serwerem połączeń zostało przerwane.',
    'browser-incompatible': 'Ta wersja przeglądarki nie obsługuje gry przez internet.',
    'webrtc': 'Nie udało się połączyć komputerów (router albo zapora).'
};

export const describeError = (error) => ERRORS[error?.type] ?? (error?.message || 'Nieznany błąd połączenia.');

// Jedno połączenie z drugim graczem: send(obiekt), onMessage, onClose.
export class Connection {

    constructor(conn) {
        this.conn = conn;
        this.peer = conn.peer;
        this.open = conn.open;
        this.closed = false;
        this.onMessage = null;
        this.onClose = null;
        this.sent = 0;
        this.received = 0;
        conn.on('data', (data) => {
            let message = data;
            if (typeof data === 'string') {
                this.received += data.length;
                try { message = JSON.parse(data); } catch { return; }
            }
            if (message && typeof message === 'object' && typeof message.t === 'string') this.onMessage?.(message);
        });
        const closed = () => {
            if (this.closed) return;
            this.closed = true;
            this.onClose?.();
        };
        conn.on('close', closed);
        conn.on('error', closed);
        conn.peerConnection?.addEventListener?.('connectionstatechange', () => {
            if (['failed', 'closed'].includes(conn.peerConnection.connectionState)) closed();
        });
    }

    send(message) {
        if (this.closed || !this.conn.open) return false;
        const text = JSON.stringify(message);
        this.sent += text.length;
        try { this.conn.send(text); } catch { return false; }
        return true;
    }

    // Ile bajtów czeka w kolejce kanału (chunki wysyłamy, gdy jest luźno).
    get buffered() { return this.conn.dataChannel?.bufferedAmount ?? 0; }

    close() {
        if (this.closed) return;
        this.closed = true;
        try { this.conn.close(); } catch { /* już zamknięte */ }
    }
}

function waitOpen(peer, timeout) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { cleanup(); reject(Object.assign(new Error('Serwer połączeń nie odpowiada.'), { type: 'server-error' })); }, timeout);
        const onOpen = (id) => { cleanup(); resolve(id); };
        const onError = (error) => { cleanup(); reject(error); };
        const cleanup = () => { clearTimeout(timer); peer.off('open', onOpen); peer.off('error', onError); };
        peer.on('open', onOpen);
        peer.on('error', onError);
    });
}

// Gospodarz: rejestracja pod identyfikatorem; onConnection(Connection).
export async function openHost(peerId, { server = '', timeout = 15000, onConnection, onError } = {}) {
    if (override()) return override().openHost(peerId, { onConnection, onError });
    const Peer = await loadPeerLibrary();
    const peer = new Peer(peerId, peerOptions(server));
    await waitOpen(peer, timeout).catch((error) => { peer.destroy(); throw error; });
    peer.on('connection', (conn) => {
        conn.on('open', () => onConnection?.(new Connection(conn)));
    });
    peer.on('error', (error) => onError?.(error));
    // Utrata serwera połączeń nie przerywa trwających gier - nowi
    // goście nie wejdą, dopóki nie wrócimy.
    peer.on('disconnected', () => { if (!peer.destroyed) setTimeout(() => !peer.destroyed && peer.reconnect(), 3000); });
    return { peer, close: () => peer.destroy() };
}

// Gość: połączenie z gospodarzem (resolve - otwarte połączenie).
export async function connectTo(peerId, { server = '', timeout = 20000 } = {}) {
    if (override()) return override().connectTo(peerId, { timeout });
    const Peer = await loadPeerLibrary();
    // Własny identyfikator gościa - bez osobnego pytania serwera o nowy.
    const guestId = `voxel-guest-${Math.random().toString(36).slice(2, 12)}`;
    const peer = new Peer(guestId, peerOptions(server));
    try {
        await waitOpen(peer, timeout);
    } catch (error) {
        peer.destroy();
        throw error;
    }
    const conn = peer.connect(peerId, { reliable: true, serialization: 'raw' });
    const connection = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { cleanup(); reject(Object.assign(new Error('Gospodarz nie odpowiada.'), { type: 'webrtc' })); }, timeout);
        const onOpen = () => { cleanup(); resolve(new Connection(conn)); };
        const onError = (error) => { cleanup(); reject(error); };
        const cleanup = () => { clearTimeout(timer); conn.off('open', onOpen); peer.off('error', onError); conn.off('error', onError); };
        conn.on('open', onOpen);
        peer.on('error', onError);
        conn.on('error', onError);
    }).catch((error) => { peer.destroy(); throw error; });
    const close = connection.close.bind(connection);
    connection.close = () => { close(); peer.destroy(); };
    return connection;
}

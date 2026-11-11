// Połączenie "przez internet" między kartami tej samej przeglądarki
// (BroadcastChannel) - do testów gry wieloosobowej bez serwera połączeń.
// Wiadomości przechodzą przez JSON jak w prawdziwym połączeniu.
// Użycie: globalThis.__VOXEL_NET_TRANSPORT__ = loopbackTransport();

class LoopbackConnection {
    constructor(channelName, peer) {
        this.peer = peer;
        this.channel = new BroadcastChannel(channelName);
        this.closed = false;
        this.onMessage = null;
        this.onClose = null;
        this.sent = 0;
        this.received = 0;
        this.channel.onmessage = (event) => {
            if (this.closed) return;
            if (event.data === '__close__') { this.closed = true; this.channel.close(); this.onClose?.(); return; }
            this.received += event.data.length;
            this.onMessage?.(JSON.parse(event.data));
        };
    }
    get open() { return !this.closed; }
    get buffered() { return 0; }
    send(message) {
        if (this.closed) return false;
        const text = JSON.stringify(message);
        this.sent += text.length;
        this.channel.postMessage(text);
        return true;
    }
    close() {
        if (this.closed) return;
        this.channel.postMessage('__close__');
        this.closed = true;
        this.channel.close();
    }
}

export function loopbackTransport() {
    return {
        async openHost(peerId, { onConnection }) {
            const lobby = new BroadcastChannel(`lobby:${peerId}`);
            lobby.onmessage = (event) => {
                const { from } = event.data ?? {};
                if (typeof from !== 'string') return;
                const connection = new LoopbackConnection(`${peerId}:${from}:to-host`, from);
                const reply = new BroadcastChannel(`${peerId}:${from}:to-guest`);
                connection.send = function send(message) {
                    if (this.closed) return false;
                    const text = JSON.stringify(message);
                    this.sent += text.length;
                    reply.postMessage(text);
                    return true;
                };
                connection.close = function close() {
                    if (this.closed) return;
                    reply.postMessage('__close__');
                    this.closed = true;
                    this.channel.close();
                };
                lobby.postMessage({ accepted: from });
                onConnection(connection);
            };
            return { close: () => lobby.close() };
        },
        async connectTo(peerId, { timeout = 5000 } = {}) {
            const from = Math.random().toString(36).slice(2);
            const lobby = new BroadcastChannel(`lobby:${peerId}`);
            const connection = new LoopbackConnection(`${peerId}:${from}:to-guest`, peerId);
            const out = new BroadcastChannel(`${peerId}:${from}:to-host`);
            connection.send = function send(message) {
                if (this.closed) return false;
                const text = JSON.stringify(message);
                this.sent += text.length;
                out.postMessage(text);
                return true;
            };
            connection.close = function close() {
                if (this.closed) return;
                out.postMessage('__close__');
                this.closed = true;
                this.channel.close();
            };
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(Object.assign(new Error('Brak gry z tym kodem'), { type: 'peer-unavailable' })), timeout);
                lobby.onmessage = (event) => { if (event.data?.accepted === from) { clearTimeout(timer); lobby.close(); resolve(); } };
                lobby.postMessage({ from });
            });
            return connection;
        }
    };
}

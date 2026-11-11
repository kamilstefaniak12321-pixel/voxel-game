// Gra wieloosobowa w dwóch kartach przeglądarki (gospodarz i gość):
// prawdziwe Game, NetHost i NetClient, połączenie przez BroadcastChannel
// (net-loopback.js) zamiast internetu. Używa tools/sprawdz_multiplayer_webgl.mjs.
import { loopbackTransport } from './net-loopback.js';

// ?webrtc w adresie - prawdziwe połączenie WebRTC (lokalny serwer PeerJS).
if (!new URLSearchParams(location.search).has('webrtc')) globalThis.__VOXEL_NET_TRANSPORT__ = loopbackTransport();

const width = 960, height = 600;

async function boot() {
    const THREE = await import('three');
    const { Settings } = await import('/src/settings/Settings.js');
    const { atlasReady } = await import('/src/rendering/TextureAtlas.js');
    await atlasReady;
    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    document.body.prepend(renderer.domElement);
    const settings = new Settings();
    for (const [key, value] of Object.entries({ viewDistance: 48, farTerrain: 0, loadBudget: 8, meteorites: false,
        lightShafts: false, bounceLight: false, showHand: false, shadows: 0, cloudCover: 0, lightingModel: 'world',
        lightingLook: 'natural', viewBobbing: false, musicVolume: 0 })) settings.set(key, value);
    const input = new Proxy({}, { get: (_, name) => name === 'consumeMouseDelta' ? () => ({ x: 0, y: 0 }) : () => 0 });
    return { THREE, renderer, settings, input };
}

function api(game, renderer, net, errors) {
    const W = game.world;
    const step = (frames = 1, dt = 1 / 30) => { for (let i = 0; i < frames; i++) game.update(dt); };
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    return {
        game, net, errors,
        step,
        async run(seconds, dt = 1 / 30) {
            const end = performance.now() + seconds * 1000;
            while (performance.now() < end) { game.update(dt); await wait(10); }
        },
        frame(eye, target) {
            game.camera.position.set(...eye);
            game.camera.lookAt(...target);
            game.render();
            return renderer.domElement.toDataURL('image/png');
        },
        block: (x, y, z) => W.getBlock(x, y, z),
        set: (x, y, z, type) => W.setBlock(x, y, z, type),
        ground(x, z) { let y = 120; while (y > 0 && !W.isSolid(x, y, z)) y--; return y; },
        // Odcisk bloków chunka (woda jako jedna wartość - płynie u każdego sama).
        chunkHash(cx, cz) {
            const chunk = W.getChunk(cx, cz);
            if (!chunk) return null;
            let hash = 0x811c9dc5;
            for (let i = 0; i < chunk.blocks.length; i++) {
                const type = W.getBlockId !== undefined ? chunk.blocks[i] : 0;
                hash ^= type; hash = Math.imul(hash, 0x01000193) >>> 0;
            }
            return hash;
        },
        loadedKeys: () => [...W.chunks.keys()],
        report: () => ({ errors: [...errors], players: net ? [...net.players.players.values()].map((p) => ({ id: p.id, name: p.name,
            pos: p.state ? [p.state.x, p.state.y, p.state.z] : null })) : [], stats: net?.stats ?? null })
    };
}

function trackErrors() {
    const errors = [];
    const original = console.error;
    console.error = (...args) => { errors.push(args.map(String).join(' ')); original(...args); };
    addEventListener('error', (event) => errors.push(event.message));
    addEventListener('unhandledrejection', (event) => errors.push(String(event.reason)));
    return errors;
}

export async function startHost({ terrain = 'classic', seed = 4242, mode = 'creative', server = '' } = {}) {
    const errors = trackErrors();
    const { renderer, settings, input } = await boot();
    const { Game } = await import('/src/game/Game.js');
    const { createWorldInfo } = await import('/src/storage/WorldStorage.js');
    const { NetHost } = await import('/src/net/NetHost.js');
    const info = createWorldInfo('Świat gospodarza', seed, terrain, mode);
    const game = await Game.start(renderer, input, null, info, settings);
    game.camera.aspect = width / height; game.camera.updateProjectionMatrix();
    game.time.speed = 0; game.time.days = 0.45;
    game.player.flying = true;
    const host = new NetHost({ name: 'Kamil', id: '0123456789abcdef', skin: () => null, server });
    host.chat = [];
    host.onChat = (name, text) => host.chat.push(`${name}: ${text}`);
    host.onSystem = (text) => host.chat.push(text);
    const tools = api(game, renderer, host, errors);
    tools.open = () => host.open(game);
    return tools;
}

export async function startGuest(code, { name = 'Ola', id = 'fedcba9876543210', server = '' } = {}) {
    const errors = trackErrors();
    const { renderer, settings, input } = await boot();
    const { Game } = await import('/src/game/Game.js');
    const { NetClient } = await import('/src/net/NetClient.js');
    const { START_LOAD_RADIUS } = await import('/src/config.js');
    const client = await NetClient.connect(code, { name, id, skin: null, server });
    const info = client.worldInfo();
    await client.prefetch(info.player.x, info.player.z, START_LOAD_RADIUS + 1);
    const game = await Game.start(renderer, input, null, info, settings, { savedChunks: client.store });
    game.camera.aspect = width / height; game.camera.updateProjectionMatrix();
    client.attach(game);
    client.chat = [];
    client.onChat = (who, text) => client.chat.push(`${who}: ${text}`);
    client.onSystem = (text) => client.chat.push(text);
    client.onDisconnect = (reason) => client.chat.push(`rozłączono: ${reason}`);
    return api(game, renderer, client, errors);
}

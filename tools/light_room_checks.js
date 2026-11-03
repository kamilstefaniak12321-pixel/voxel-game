// Test obrazu prawdziwych chunków w zamkniętym pokoju. Wywoływany przez
// sprawdz_swiatlo_webgl.mjs; nie zastępuje materiałów ani obliczeń światła.
import { modelLight } from '../src/rendering/ModelMaterial.js';
import { skyUniforms } from '../src/sky/skyShader.js';

export async function checkDarkRoom({ game, settings, renderer, meanFrame, yieldBrowser }) {
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    const keys = ['showHand', 'meteorites', 'lightShafts', 'bounceLight', 'dynamicLight', 'shadows', 'lightingModel', 'brightness', 'potato'];
    const savedSettings = new Map(keys.map(key => [key, settings.get(key)]));
    const saved = {
        pos: game.player.pos.clone(), vel: game.player.vel.clone(),
        yaw: game.player.yaw, pitch: game.player.pitch, flying: game.player.flying,
        cameraMode: game.cameraMode, days: game.time.days, speed: game.time.speed,
        modelSky: game.modelSky, modelBlock: game.modelBlock.clone(),
        modelBounce: game.modelBounce.clone(), fogBrightness: game.fogBrightness,
        sunVisibility: game.sunVisibility
    };
    const blocks = [];
    const chunk = game.world.getChunk(-1, 1);
    check(chunk, 'Brak wczytanego chunka dla ciemnego pokoju');

    // Pełny pokój 5x5x5, wnętrze 3x3x3; wszystko mieści się w jednym
    // istniejącym chunku, wysoko nad stanowiskami laboratorium.
    const modifyRoom = async (restore = false) => {
        if (restore) {
            for (let i = 0; i < blocks.length; i++) {
                const [x, y, z, old] = blocks[i];
                game.world.setBlock(x, y, z, old);
                if (i % 25 === 24) await yieldBrowser();
            }
            return;
        }
        for (let x = -6; x <= -2; x++) {
            for (let y = 40; y <= 44; y++) for (let z = 26; z <= 30; z++) {
                blocks.push([x, y, z, game.world.getBlock(x, y, z)]);
                const boundary = x === -6 || x === -2 || y === 40 || y === 44 || z === 26 || z === 30;
                game.world.setBlock(x, y, z, boundary ? 'lime_plaster' : null);
            }
            await yieldBrowser();
        }
    };
    const settle = async () => {
        // Światło flood fill przelicza się przy setBlock; klatki opróżniają
        // budżetowaną kolejkę meshy. Nie przesuwamy zegara ani gracza.
        for (let i = 0; i < 12; i++) {
            game.update(0);
            await yieldBrowser();
            if (chunk.mesh && !game.world.dirtyChunks.has(chunk)) break;
        }
        check(chunk.mesh && !game.world.dirtyChunks.has(chunk), 'Pokój nie zbudował mesha w budżecie testu');
        game.updateModel(0.1);
        game.updateFog(1 / 3);
        game.highlight.mesh.visible = false;
        game.cracks.update(null, 0);
        game.render();
        await yieldBrowser();
    };
    const sampleRGB = () => {
        const gl = renderer.getContext();
        const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
        gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        check(gl.getError() === gl.NO_ERROR, 'Błąd odczytu obrazu pokoju');
        const rgb = [0, 0, 0];
        for (let i = 0; i < pixels.length; i += 4) for (let c = 0; c < 3; c++) rgb[c] += pixels[i + c];
        return rgb.map(v => v / (pixels.length / 4));
    };

    try {
        for (const [key, value] of Object.entries({ showHand: false, meteorites: false, lightShafts: false, bounceLight: false, dynamicLight: false, shadows: 0, lightingModel: 'world', brightness: 0, potato: false })) settings.set(key, value);
        game.setCameraMode('first');
        game.time.speed = 0;
        game.time.days = 0.5;
        game.player.flying = true;
        game.player.vel.set(0, 0, 0);
        game.player.pos.set(-3.5, 41.1, 28.5);
        game.player.yaw = 0;
        game.player.pitch = 0;
        await modifyRoom();
        await settle();
        const light = game.world.getLight(-4, 42, 28);
        check(light.sky === 0 && light.red === 0 && light.green === 0 && light.blue === 0, 'Zamknięty pokój nadal ma źródło światła');
        check(modelLight.uModelSky.value === 0 && modelLight.uModelBlock.value.lengthSq() === 0, 'Model zachował minimum światła');
        check(skyUniforms.uFogBrightness.value === 0, 'Mgła zachowała minimum światła');
        const atmosphere = meanFrame();
        check(atmosphere < 1, `Pokój atmosferyczny bez źródła nie jest ciemny: ${atmosphere}`);
        const geometry = chunk.mesh.geometry;

        settings.set('lightingModel', 'classic');
        await settle();
        check(chunk.mesh.geometry === geometry, 'Przełączenie modelu przebudowało chunk');
        const classic = meanFrame();
        check(classic > atmosphere + 1, 'Klasyczne minimum jasności nie zostało zachowane');

        settings.set('lightingModel', 'world');
        settings.set('shadows', 1);
        await settle();
        check(chunk.mesh.geometry === geometry, 'Powrót do atmosfery przebudował chunk');
        const withShadows = meanFrame();
        check(withShadows < 1, `Zamknięty dach przepuszcza bezpośrednie światło: ${withShadows}`);

        // Prawdziwy blok lampy w przedniej ścianie, z flood fill i nowym
        // meshem. Barwa światła ma przetrwać usunięcie sztucznego minimum.
        game.world.setBlock(-4, 42, 26, 'lamp_red');
        await settle();
        check(game.world.getLight(-4, 42, 28).red > 0, 'Lampa nie rozświetliła wnętrza');
        const lamp = meanFrame();
        const lampRGB = sampleRGB();
        check(lamp > withShadows + 1, 'Lampa nie zmieniła obrazu ciemnego pokoju');
        check(lampRGB[0] > lampRGB[1] * 1.5 && lampRGB[0] > lampRGB[2] * 1.5, 'Czerwona lampa straciła barwę');
        return { atmosphere, classic, withShadows, lamp, lampRGB };
    } finally {
        await modifyRoom(true);
        for (const [key, value] of savedSettings) settings.set(key, value);
        game.player.pos.copy(saved.pos);
        game.player.vel.copy(saved.vel);
        game.player.yaw = saved.yaw;
        game.player.pitch = saved.pitch;
        game.player.flying = saved.flying;
        game.time.days = saved.days;
        game.time.speed = saved.speed;
        game.setCameraMode(saved.cameraMode);
        game.update(0);
        game.modelSky = saved.modelSky;
        game.modelBlock.copy(saved.modelBlock);
        game.modelBounce.copy(saved.modelBounce);
        game.fogBrightness = saved.fogBrightness;
        game.sunVisibility = saved.sunVisibility;
        game.updateModel(0);
        game.updateFog(0);
        game.render();
        await yieldBrowser();
    }
}

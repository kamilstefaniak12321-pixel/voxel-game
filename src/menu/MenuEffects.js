import { TreeParticles } from '../rendering/TreeParticles.js';
import { WindStreaks } from '../rendering/WindStreaks.js';
import { WaterfallEffects } from '../rendering/WaterfallEffects.js';
import { WaterfallWetRocks } from '../rendering/WaterfallWetRocks.js';
import { windAt } from '../world/AmbientWind.js';
import { setShadowDefine } from '../rendering/BlockRenderData.js';

// Te same ograniczone efekty co w rozgrywce. Kamera jest jedynie punktem
// obserwacji; nie ma gracza, zbiorów, zapisu ani drugiej symulacji wody.
export class MenuEffects {
    constructor(scene, world, camera) {
        this.world = world;
        this.camera = camera;
        this.observer = { pos: camera.position, camera };
        this.clock = 0;
        this.landingRevision = -1;
        this.disposed = false;
        try {
            this.leaves = new TreeParticles(scene, world);
            this.wind = new WindStreaks(scene, world);
            this.waterfalls = new WaterfallEffects(scene, world);
            this.wetRocks = new WaterfallWetRocks(scene, world);
        } catch (error) {
            this.dispose();
            throw error;
        }
    }

    applySettings(settings, shadows) {
        const potato = Boolean(settings.get('potato'));
        this.leaves.setEnabled(settings.get('fallingLeaves') !== false);
        this.leaves.setAmount(potato ? .35 : 1);
        this.wind.setEnabled(settings.get('windStreaks') !== false && !potato);
        this.waterfalls.setAmount(potato ? .35 : 1);
        this.wetRocks.setAmount(potato ? .35 : 1);
        setShadowDefine([...this.waterfalls.materials, this.wetRocks.material], shadows.enabled, shadows.hasFar);
    }

    update(dt, daylight) {
        if (this.disposed) return;
        this.clock += dt;
        const wind = windAt(this.clock);
        this.leaves.update(dt, this.observer, wind);
        this.wind.update(dt, this.observer, wind, daylight);
        this.waterfalls.update(dt, this.observer, this.camera);
        if (this.landingRevision !== this.waterfalls.landingRevision) {
            this.landingRevision = this.waterfalls.landingRevision;
            this.wetRocks.setLandings(this.waterfalls.landings);
        }
        this.wetRocks.update(dt);
    }

    stats() {
        return { leaves: this.leaves.leaves.count, fruits: this.leaves.fruits.count,
            wind: this.wind.streaks.length, waterfalls: this.waterfalls.stats(),
            wetRocks: this.wetRocks.stats() };
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.leaves?.dispose(); this.wind?.dispose();
        this.waterfalls?.dispose(); this.wetRocks?.dispose();
    }
}

import * as THREE from 'three';
import { atlasReady } from '../rendering/TextureAtlas.js';
import { MenuWorld } from './MenuWorld.js';
import { MenuCamera } from './MenuCamera.js';
import { MENU_SCENE, menuSettings } from './menuScene.js';

// Jeden świat wyłącznie na czas głównego menu. Nigdy nie współistnieje
// z Game: materiały i uniformy światła są wspólne dla całej aplikacji.
export class MenuBackdrop {
    constructor(renderer, settings, { mobile = false } = {}) {
        this.renderer = renderer;
        this.settings = menuSettings(settings, mobile);
        this.world = null;
        this.camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 256);
        this.rig = null;
        this.view = 'home';
        this.active = false;
        this.pending = false;
        this.epoch = 0;
        this.failed = false;
        this.frames = 0;
        this.motion = window.matchMedia('(prefers-reduced-motion: reduce)');
        this.onMotionChange = () => this.rig?.goTo(this.view, this.reducedMotion);
        this.motion.addEventListener('change', this.onMotionChange);
    }

    get reducedMotion() {
        const mode = this.settings.get('menuMotion');
        return mode === 'off' || (mode !== 'full' && this.motion.matches);
    }

    setView(view) {
        this.view = MENU_SCENE.views[view] ? view : 'home';
        this.rig?.goTo(this.view, this.reducedMotion);
    }

    async start() {
        this.active = true;
        if (this.world || this.pending || this.failed) return;
        this.pending = true;
        const epoch = ++this.epoch;
        document.body.dataset.menuBackdrop = 'loading';
        try {
            await atlasReady;
            if (epoch !== this.epoch || !this.active) return;
            this.rig = new MenuCamera(MENU_SCENE.views);
            this.rig.goTo(this.view, this.reducedMotion);
            this.rig.apply(this.camera, this.reducedMotion);
            this.world = new MenuWorld(this.renderer, this.settings, MENU_SCENE, this.camera);
            this.frames = 0;
        } catch (error) {
            if (epoch !== this.epoch) return;
            this.fail(error);
        } finally {
            if (epoch === this.epoch) this.pending = false;
        }
    }

    update(dt) {
        if (!this.active || !this.world || document.hidden) return;
        try {
            this.rig.update(dt, this.reducedMotion);
            this.rig.apply(this.camera, this.reducedMotion);
            this.world.update(dt, this.camera.position);
            if (this.world.error) throw this.world.error;
            this.world.render();
            this.frames++;
            if (this.world.ready) document.body.dataset.menuBackdrop = 'ready';
        } catch (error) {
            this.fail(error);
        }
    }

    applySettings() {
        this.rig?.goTo(this.view, this.reducedMotion);
        this.world?.applySettings();
    }

    resize(width, height) {
        this.camera.aspect = width / Math.max(1, height);
        this.camera.updateProjectionMatrix();
        this.world?.resize?.(width, height);
    }

    stop() {
        this.active = false;
        ++this.epoch;
        this.pending = false;
        this.world?.dispose();
        this.world = null;
        this.rig = null;
        document.body.dataset.menuBackdrop = 'off';
    }

    fail(error) {
        console.warn('Scena menu niedostępna:', error);
        this.stop();
        this.failed = true;
        document.body.dataset.menuBackdrop = 'failed';
    }

    dispose() {
        this.stop();
        this.motion.removeEventListener('change', this.onMotionChange);
    }

    stats() {
        return { active: this.active, pending: this.pending, failed: this.failed,
            reducedMotion: this.reducedMotion,
            view: this.view, frames: this.frames, ready: Boolean(this.world?.ready),
            position: this.camera.position.toArray(), ...this.world?.stats?.() };
    }
}

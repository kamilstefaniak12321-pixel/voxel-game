import * as THREE from 'three';

import { SPACE_FULL, SKYFALL_CRATER_SCALE } from '../config.js';

import { createGlowSprite } from '../rendering/Glow.js';

// ------------------------------------------------------------
// SPADANIE Z KOSMOSU - JAK METEORYT
//
// Gracz, który nie leci, a jest wysoko (SKYFALL_START w config.js),
// spada z ogromną prędkością (fizyka: Player.updateSkyfall). Ta klasa
// robi z tego widowisko:
//   - w powietrzu (niżej niż granica kosmosu) zapala się: kula ognia
//     wokół gracza (od dołu - od strony, w którą leci), płomienie
//     na brzegach ekranu, iskry przelatujące w górę, smuga dymu,
//     teren w dole coraz jaśniej oświetlony na pomarańczowo,
//   - drży kamera, szersze pole widzenia, ryk ognia i pęd powietrza,
//   - uderzenie w ziemię to wybuch jak przy meteorycie (krater,
//     błysk, fala, odłamki - Meteorites.explode), bez bloku meteorytu,
//   - wpadnięcie do wody - wielki plusk i para (bez krateru).
// ------------------------------------------------------------

// Cząsteczki na sekundę przy pełnym ogniu (tryb ziemniaka ~40%).

const PARTICLES = {
    streaks: 280,    // iskry przelatujące obok gracza w górę
    embers: 90,      // większe kawałki ognia odpadające na boki
    smoke: 40,       // dym zostający w powietrzu nad graczem
    splash: 260,     // krople przy wpadnięciu do wody
    steam: 60        // para nad wodą
};

// Kolory (liniowe).

const COLOR = {
    white: new THREE.Color('#fff6e0'),
    yellow: new THREE.Color('#ffc845'),
    orange: new THREE.Color('#ff6a12'),
    red: new THREE.Color('#a8220a'),
    ember: new THREE.Color('#3c0d05'),
    smokeDark: new THREE.Color('#2e241e'),
    smoke: new THREE.Color('#4a4643'),
    smokeLight: new THREE.Color('#6c6864'),
    water: new THREE.Color('#3f7fc0'),
    foam: new THREE.Color('#e8f2ff'),
    steam: new THREE.Color('#d8dde2')
};

// Światło na terenie (meteorLight.js) i dynamiczne (DynamicLight.js).

const LIGHT_FIRE = new THREE.Vector3(1.0, 0.45, 0.13);
const FIRE_LIGHT = [1, 0.55, 0.2];


function smoothstep(edge0, edge1, x) {

    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));

    return t * t * (3 - 2 * t);

}

function random(min, max) {

    return min + Math.random() * (max - min);

}


export class Skyfall {

    constructor(game) {

        this.game = game;

        // Ogień 0-1 (w powietrzu przy dużej prędkości).
        this.heat = 0;

        // Prędkość spadania (bloki/s), wstrząs kamery i mnożnik pola
        // widzenia (czyta Game).
        this.speed = 0;
        this.shake = 0;
        this.fovFactor = 1;

        // Źródło światła dla Meteorites.updateLighting (null = nie świeci)
        // i dynamiczne światło (Game.updateDynamicLight).
        this.glow = null;
        this.light = { position: new THREE.Vector3(), color: FIRE_LIGHT, strength: 0 };

        this.ignited = false;
        this.clock = 0;
        this.carry = { streaks: 0, embers: 0, smoke: 0 };

        // Wstrząs po plusku (krater ma własny - z Meteorites).
        this.splashShake = 0;


        // Kula ognia wokół gracza.

        this.group = new THREE.Group();

        this.core = createGlowSprite(new THREE.Color('#fff2c8'), 1.8);
        this.halo = createGlowSprite(new THREE.Color('#ff8a2a'), 5);
        this.aura = createGlowSprite(new THREE.Color('#ff4a12'), 14);

        this.halo.material.opacity = 0.8;
        this.aura.material.opacity = 0.35;

        this.group.add(this.aura, this.halo, this.core);

        this.group.visible = false;

        game.scene.add(this.group);


        // Płomienie na brzegach ekranu (wygląd: #reentry w hud.css).

        this.overlay = document.createElement('div');

        this.overlay.id = 'reentry';

        document.body.appendChild(this.overlay);

        this.overlayOpacity = 0;


        // Dźwięki: pęd powietrza i ryk ognia (pętle).

        this.windLoop = null;
        this.fireLoop = null;

        this.quiet = 0;


        this.tmp = new THREE.Vector3();
        this.tmp2 = new THREE.Vector3();

    }


    get particleScale() {

        return this.game.settings.get('potato') ? 0.4 : 1;

    }


    // Co klatkę (Game.update, po ruchu gracza, przed meteorytami).

    update(dt) {

        const game = this.game;
        const player = game.player;

        this.clock += dt;


        // Koniec spadania w tej klatce.

        if (player.skyfallImpact) {
            this.land(player.skyfallImpact);
        }

        if (player.skyfallSplash) {
            this.splash(player.skyfallSplash);
        }


        const falling = player.skyfall;

        const speed = falling ? Math.max(0, -player.vel.y) : 0;

        this.speed = speed;


        // Ogień: tylko w powietrzu (niżej niż granica kosmosu) i przy
        // dużej prędkości. Zapala się w ~sekundę, gaśnie szybciej.

        const air = 1 - smoothstep(SPACE_FULL * 0.9, SPACE_FULL * 1.4, player.pos.y);

        const target = smoothstep(90, 190, speed) * air;

        this.heat += (target - this.heat) * Math.min(1, dt * (target > this.heat ? 1.6 : 5));

        if (target === 0 && this.heat < 0.003) {
            this.heat = 0;
        }

        const heat = this.heat;


        // Zapłon - raz, przy wejściu w atmosferę.

        if (heat > 0.25 && !this.ignited) {

            this.ignited = true;

            game.sounds?.play('skyfall_ignite');

        }

        if (heat < 0.05) {
            this.ignited = false;
        }


        // Ogień migocze.

        const t = this.clock;

        const flicker = 1 + 0.15 * Math.sin(t * 31) + 0.08 * Math.sin(t * 53.7 + 1) + 0.06 * (Math.random() - 0.5);

        this.updateFireball(heat, flicker);

        this.emit(dt, heat);

        this.updateOverlay(heat, flicker);

        this.updateLight(heat, flicker);


        // Wstrząs i szersze pole widzenia: od ognia i od samego pędu.

        const rush = falling ? smoothstep(60, 400, speed) * (0.35 + 0.65 * air) : 0;

        this.splashShake = Math.max(0, this.splashShake - dt * 1.5);

        this.shake = Math.max(heat * 0.4 * flicker, rush * 0.12, this.splashShake);

        this.fovFactor = 1 + 0.15 * heat + 0.05 * rush;


        this.updateSounds(dt, rush, heat);

    }


    // Kula ognia: z oczu gracza tuż pod stopami (od strony, w którą
    // leci - widać ją, patrząc w dół), z trzeciej osoby otacza całą
    // postać.

    updateFireball(heat, flicker) {

        const group = this.group;

        group.visible = heat > 0.01;

        if (!group.visible) {
            return;
        }

        const p = this.game.player.pos;

        const firstPerson = this.game.cameraMode === 'first';

        group.position.set(p.x, p.y + (firstPerson ? -0.8 : 0.2), p.z);

        const glow = heat * flicker;

        const size = firstPerson ? 1 : 1.35;

        this.core.scale.setScalar(1.8 * size * glow);
        this.halo.scale.setScalar(5 * size * glow);
        this.aura.scale.setScalar(14 * size * heat * (0.9 + 0.1 * flicker));

        this.core.material.opacity = Math.min(1, heat * 1.2);
        this.halo.material.opacity = 0.8 * heat;
        this.aura.material.opacity = 0.35 * heat;

    }


    // Iskry przelatujące w górę, odpadające płomienie i dym.

    emit(dt, heat) {

        if (heat < 0.02) {
            return;
        }

        const meteorites = this.game.meteorites;
        const player = this.game.player;

        const p = player.pos;
        const v = player.vel;

        const scale = this.particleScale * heat;

        const position = this.tmp;
        const velocity = this.tmp2;


        // Iskry: lecą wolniej niż gracz, więc mijają go w górę.

        this.carry.streaks += PARTICLES.streaks * scale * dt;

        while (this.carry.streaks >= 1) {

            this.carry.streaks--;

            // Nie za blisko oczu (z bliska byłyby wielkie).

            const angle = Math.random() * Math.PI * 2;
            const radius = random(1.8, 4.5);

            position.set(p.x + Math.cos(angle) * radius, p.y + random(-3, 0.5), p.z + Math.sin(angle) * radius);

            velocity.copy(v).multiplyScalar(random(0.55, 0.85));
            velocity.x += Math.cos(angle) * random(1, 5);
            velocity.z += Math.sin(angle) * random(1, 5);

            meteorites.glowParticles.emit({
                position,
                velocity,
                life: random(0.25, 0.6),
                size: random(0.04, 0.12),
                sizeEnd: 0.02,
                fade: 0.3,
                colors: [Math.random() < 0.5 ? COLOR.white : COLOR.yellow, COLOR.orange, COLOR.ember],
                spin: 12
            });

        }


        // Większe płomienie odpadające na boki.

        this.carry.embers += PARTICLES.embers * scale * dt;

        while (this.carry.embers >= 1) {

            this.carry.embers--;

            const angle = Math.random() * Math.PI * 2;

            const radius = random(1.4, 2.2);

            position.set(p.x + Math.cos(angle) * radius, p.y + random(-1.5, -0.3), p.z + Math.sin(angle) * radius);

            velocity.copy(v).multiplyScalar(random(0.8, 0.95));
            velocity.x += Math.cos(angle) * random(6, 14);
            velocity.z += Math.sin(angle) * random(6, 14);

            meteorites.glowParticles.emit({
                position,
                velocity,
                life: random(0.4, 0.9),
                size: random(0.1, 0.24),
                sizeEnd: 0.05,
                fade: 0.35,
                colors: [COLOR.yellow, COLOR.orange, COLOR.red],
                drag: 1.2,
                spin: 8
            });

        }


        // Dym zostaje w powietrzu - smuga nad graczem.

        this.carry.smoke += PARTICLES.smoke * scale * dt;

        while (this.carry.smoke >= 1) {

            this.carry.smoke--;

            position.set(p.x + random(-2, 2), p.y + random(6, 12), p.z + random(-2, 2));

            velocity.set(random(-0.5, 0.5), v.y * 0.04, random(-0.5, 0.5));

            meteorites.solidParticles.emit({
                position,
                velocity,
                life: random(3, 5.5),
                size: random(0.5, 0.8),
                sizeEnd: random(1.8, 2.8),
                fade: 0.4,
                colors: [COLOR.smokeDark, COLOR.smoke, COLOR.smokeLight],
                drag: 0.8,
                lift: 0.2,
                spin: 1.2
            });

        }

    }


    // Płomienie na brzegach ekranu - mocno z oczu gracza, słabo z trzeciej
    // osoby (wtedy widać kulę ognia wokół modelu).

    updateOverlay(heat, flicker) {

        const firstPerson = this.game.cameraMode === 'first';

        const value = heat < 0.01 ? 0 : Math.min(1, heat * (firstPerson ? 0.9 : 0.35) * flicker);

        if (Math.abs(value - this.overlayOpacity) < 0.01 && !(value === 0 && this.overlayOpacity !== 0)) {
            return;
        }

        this.overlayOpacity = value;

        this.overlay.style.opacity = value.toFixed(3);

    }


    // Gracz w ogniu oświetla teren pod sobą (coraz mocniej, im bliżej).

    updateLight(heat, flicker) {

        if (heat < 0.01) {

            this.glow = null;

            this.light.strength = 0;

            return;

        }

        const position = this.group.position;

        this.glow = {
            power: 3.2 * heat * flicker,
            position,
            color: LIGHT_FIRE,
            range: 45,
            sky: 0.1 * heat * flicker
        };

        this.light.position.copy(position);

        this.light.strength = 15 * heat;

    }


    // Pęd powietrza (zawsze przy szybkim spadaniu w powietrzu) i ryk ognia.

    updateSounds(dt, rush, heat) {

        const sounds = this.game.sounds;

        if (!sounds) {
            return;
        }

        const wind = rush * 0.9;

        if (wind > 0.02 && !this.windLoop) {
            this.windLoop = sounds.loop('skyfall_wind', { volume: 0 });
        }

        if (heat > 0.02 && !this.fireLoop) {
            this.fireLoop = sounds.loop('meteor_flight', { volume: 0, pitch: 0.7 });
        }

        this.windLoop?.setVolume(wind, 0.15);
        this.windLoop?.setPitch(0.85 + 0.35 * rush);

        this.fireLoop?.setVolume(heat * 0.85, 0.15);
        this.fireLoop?.setPitch(0.7 + 0.35 * heat);


        // Długo cicho - pętle się kończą.

        this.quiet = wind < 0.01 && heat < 0.01 ? this.quiet + dt : 0;

        if (this.quiet > 1.5) {
            this.stopLoops(0.3);
        }

    }


    stopLoops(fade) {

        this.windLoop?.stop(fade);
        this.fireLoop?.stop(fade);

        this.windLoop = null;
        this.fireLoop = null;

    }


    // Uderzenie w ziemię: krater jak po meteorycie.

    land({ x, y, z }) {

        const game = this.game;

        this.heat = 0;

        this.stopLoops(0.15);

        const bottom = game.meteorites.explode(x, y, z, { scale: SKYFALL_CRATER_SCALE, meteorite: false, clear: 3 });

        game.onMessage?.(`Wylądowałeś jak meteoryt! Krater na ${x}, ${bottom}, ${z}.`);

        game.achieve?.('skyfallLanded', { x, y: bottom, z });

    }


    // Wpadnięcie do wody: fontanna kropli, para, huk i plusk.

    splash(speed) {

        const game = this.game;
        const meteorites = game.meteorites;
        const p = game.player.pos;

        this.heat = 0;

        this.stopLoops(0.1);

        this.splashShake = 0.9;

        const scale = this.particleScale;

        const position = this.tmp;
        const velocity = this.tmp2;


        for (let i = 0; i < Math.round(PARTICLES.splash * scale); i++) {

            const angle = Math.random() * Math.PI * 2;
            const out = random(2, 10);
            const r = random(2.5, 4);

            position.set(p.x + Math.cos(angle) * r, p.y + random(0, 1.5), p.z + Math.sin(angle) * r);

            velocity.set(Math.cos(angle) * out, random(10, 30), Math.sin(angle) * out);

            meteorites.solidParticles.emit({
                position,
                velocity,
                life: random(1.2, 2.6),
                size: random(0.12, 0.3),
                sizeEnd: 0.05,
                fade: 0.3,
                colors: [COLOR.foam, COLOR.water, COLOR.water],
                gravity: 24,
                drag: 0.3,
                spin: 6
            });

        }


        for (let i = 0; i < Math.round(PARTICLES.steam * scale); i++) {

            const angle = Math.random() * Math.PI * 2;
            const r = random(2.5, 5);

            position.set(p.x + Math.cos(angle) * r, p.y + random(0.5, 2), p.z + Math.sin(angle) * r);

            velocity.set(random(-1, 1), random(2, 5), random(-1, 1));

            meteorites.solidParticles.emit({
                position,
                velocity,
                life: random(3, 5),
                size: random(0.6, 0.9),
                sizeEnd: random(2, 3),
                fade: 0.5,
                colors: [COLOR.steam, COLOR.steam, COLOR.smokeLight],
                drag: 0.6,
                lift: 0.4,
                spin: 1
            });

        }


        const where = new THREE.Vector3(p.x, p.y + 1, p.z);

        game.sounds?.play('water_splash', { position: where, volume: 1, pitch: 0.55 });
        game.sounds?.play('meteor_impact', { position: where, volume: 0.5, pitch: 1.4 });

        game.onMessage?.(`Plusk! Wpadłeś do wody prosto z kosmosu (${Math.round(speed)} bloków na sekundę).`);

        game.achieve?.('skyfallSplash', { speed });

    }


    // Czy coś się dzieje (do /kosmos i testów).

    get active() {

        return this.heat > 0 || this.game.player.skyfall;

    }


    dispose() {

        this.stopLoops(0.1);

        this.group.removeFromParent();

        for (const sprite of [this.core, this.halo, this.aura]) {
            sprite.material.dispose();
        }

        this.overlay.remove();

        this.glow = null;
        this.light.strength = 0;

    }

}

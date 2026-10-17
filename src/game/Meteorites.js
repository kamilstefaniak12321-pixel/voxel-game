import * as THREE from 'three';

import {
    CHUNK_SIZE,
    CHUNK_HEIGHT,
    DAY_LENGTH_MINUTES,
    METEORITES_PER_NIGHT
} from '../config.js';

import {
    getBlockDefinition,
    getBlockTypeById,
    isPlantId,
    isSoilId
} from '../blocks/BlockRegistry.js';

import { createGlowSprite, getGlowTexture } from '../rendering/Glow.js';

import { CubeParticles } from '../rendering/CubeParticles.js';

import { meteorLightUniforms } from '../rendering/meteorLight.js';

import { blockAtlasTexture, getAtlasUV, getAtlasAverage } from '../rendering/TextureAtlas.js';

import { getFaceTexture } from '../rendering/BlockRenderData.js';

import { skyUniforms } from '../sky/skyShader.js';

// ------------------------------------------------------------
// METEORYTY SPADAJĄCE NA ZIEMIĘ
//
// W ciemną noc co jakiś czas (METEORITES_PER_NIGHT w config.js)
// z nieba spada meteoryt. Komenda /meteor zrzuca go od razu.
//
// 1. PRZELOT (FLIGHT_SECONDS): daleko na niebie pojawia się punkt
//    ognia i powoli się zbliża, coraz szybszy i jaśniejszy:
//      - rozżarzona, obracająca się bryła w kuli ognia (kilka
//        poświat), za nią świecący warkocz,
//      - sypią się z niej drobne, kanciaste iskry (świecące
//        sześciany, stygną z białego przez pomarańcz do czerwieni)
//        i ciągnie się smuga dymu, a co chwilę odpada płonący
//        odłamek z własną smugą iskier,
//      - niebo wokół kuli łuna na pomarańczowo, a teren, do którego
//        się zbliża, jaśnieje coraz mocniej (meteorLight.js - działa
//        na cały widoczny teren, też daleki; z bliska jeszcze
//        dynamiczne światło, które nie przechodzi przez ściany),
//      - tuż przed uderzeniem drży kamera.
//
// 2. UDERZENIE: błysk (ekran, niebo i cały teren), wstrząs kamery,
//    krater z wałem wyrzuconej ziemi i żwiru, osmalona ziemia
//    i spalone rośliny dookoła, a na dnie rozżarzony blok meteorytu
//    (czasem z odłamkami). W powietrze leci fala iskier po ziemi,
//    deszcz odłamków w kolorach rozbitych bloków (odbijają się
//    i leżą chwilę na ziemi), żar i pierścień pyłu.
//
// 3. PO UDERZENIU (IMPACT_SECONDS): z krateru bije słup dymu
//    podświetlony od dołu na pomarańczowo, sypią się iskry, a żar
//    powoli gaśnie.
//
// Meteoryt nigdy nie spada w chunki zmieniane przez gracza (żeby
// nie zniszczyć budowli).
// ------------------------------------------------------------

// Lot: od pojawienia się na niebie do uderzenia (sekundy).
export const FLIGHT_SECONDS = 8;

// Skąd przylatuje (bloki od miejsca upadku) i jak bardzo przyspiesza
// (1 = stała prędkość; więcej = na początku wolno, na końcu szybko).
const START_DISTANCE = 320;
const FLIGHT_EASE = 1.7;

const TRAIL_POINTS = 90;

// Krater, osmalona ziemia dookoła, wał z wyrzuconej ziemi.
const CRATER_RADIUS = 4.2;
const SCORCH_RADIUS = 8.5;
const RIM_WIDTH = 1.8;

// Dynamiczne światło błysku i całe "po uderzeniu" (dym, iskry, żar).
const FLASH_SECONDS = 2.2;
const IMPACT_SECONDS = 25;


// Ile cząsteczek (na sekundę albo na raz). Tryb ziemniaka: ~40%.
const PARTICLES = {
    trailEmbers: 260,    // iskry z lecącej kuli (na sekundę)
    trailSmoke: 40,      // dym za kulą (na sekundę)
    fragmentEmbers: 80,  // iskry z odpadającego odłamka (na sekundę)
    debris: 220,         // odłamki ziemi i skał przy uderzeniu
    embers: 340,         // żar przy uderzeniu
    column: 130,         // słup iskier prosto w górę
    shockwave: 160,      // fala iskier po ziemi
    dust: 100,           // pierścień pyłu
    smoke: 45,           // dym z krateru (na sekundę, na początku)
    sparks: 25           // iskry z krateru (na sekundę, na początku)
};


// Prędkość dźwięku (bloki na sekundę) - huk uderzenia dochodzi
// z opóźnieniem, jak grzmot po błyskawicy.
const SPEED_OF_SOUND = 343;


// Ciemna część nocy w sekundach (do przeliczenia "na noc" na "na sekundę").
const DARK_NIGHT_SECONDS = DAY_LENGTH_MINUTES * 60 * 0.35;


// Kolory cząsteczek (liniowe).
const COLOR = {
    white: new THREE.Color('#fff6e0'),
    yellow: new THREE.Color('#ffc845'),
    orange: new THREE.Color('#ff6a12'),
    red: new THREE.Color('#a8220a'),
    ember: new THREE.Color('#3c0d05'),
    smokeDark: new THREE.Color('#3a2a20'),
    smoke: new THREE.Color('#4a4643'),
    smokeLight: new THREE.Color('#6c6864'),
    dust: new THREE.Color('#6b5d4c')
};

// Dynamiczne światło (DynamicLight.js): kolor 0-1.
const FIRE_LIGHT = [1, 0.55, 0.2];
const FLASH_LIGHT = [1, 0.82, 0.6];

// Światło na terenie (meteorLight.js): kolor liniowy.
const LIGHT_FIRE = new THREE.Vector3(1.0, 0.45, 0.13);
const LIGHT_FLASH = new THREE.Vector3(1.0, 0.7, 0.4);
const LIGHT_EMBER = new THREE.Vector3(1.0, 0.26, 0.05);

// Łuna na niebie.
const SKY_FIRE = new THREE.Color(1.0, 0.4, 0.1);
const SKY_FLASH = new THREE.Color(1.0, 0.68, 0.42);


// Pomocnicze losowanie.

function random(min, max) {

    return min + Math.random() * (max - min);

}


function pick(list) {

    return list[Math.floor(Math.random() * list.length)];

}


// Losowy punkt w kuli o promieniu radius (do out).

function randomInSphere(out, radius) {

    do {
        out.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
    } while (out.lengthSq() > 1);

    return out.multiplyScalar(radius);

}


// Liczba 0-1 stała dla miejsca (nierówny brzeg krateru).

function hash01(x, z) {

    let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(z, 0x165667b1);

    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h ^= h >>> 13;

    return (h >>> 0) / 4294967296;

}


// Rozżarzona bryła meteorytu: sześcian z teksturą bloku meteorytu.

function createMeteorBody() {

    const geometry = new THREE.BoxGeometry(1, 1, 1);

    const uv = getAtlasUV(getFaceTexture(getBlockDefinition('meteorite').textures, 'front'));

    const uvs = geometry.attributes.uv;

    for (let i = 0; i < uvs.count; i++) {

        uvs.setXY(
            i,
            uv.uMin + uvs.getX(i) * (uv.uMax - uv.uMin),
            uv.vMin + uvs.getY(i) * (uv.vMax - uv.vMin)
        );

    }

    // Kolor powyżej 1 - tekstura świeci jak rozgrzana do białości.

    const material = new THREE.MeshBasicMaterial({
        map: blockAtlasTexture,
        color: new THREE.Color(2.4, 1.5, 0.9),
        fog: false
    });

    return new THREE.Mesh(geometry, material);

}


// Fala uderzeniowa: płaski, świecący pierścień, który rozchodzi się
// po ziemi (tekstura rysowana raz).

let ringTexture = null;

function createShockwave() {

    if (!ringTexture) {

        const size = 128;

        const canvas = document.createElement('canvas');

        canvas.width = size;
        canvas.height = size;

        const context = canvas.getContext('2d');

        const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);

        gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
        gradient.addColorStop(0.62, 'rgba(255, 255, 255, 0)');
        gradient.addColorStop(0.82, 'rgba(255, 255, 255, 0.9)');
        gradient.addColorStop(0.9, 'rgba(255, 255, 255, 0.5)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        context.fillStyle = gradient;
        context.fillRect(0, 0, size, size);

        ringTexture = new THREE.CanvasTexture(canvas);

        ringTexture.colorSpace = THREE.SRGBColorSpace;

    }


    const ring = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
            map: ringTexture,
            color: new THREE.Color('#ffb060'),
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            fog: false
        })
    );

    ring.rotation.x = -Math.PI / 2;

    return ring;

}


// Kolor odłamków danego bloku (średni kolor boku z atlasu).

function blockColor(type) {

    const definition = getBlockDefinition(type);

    if (!definition) {
        return COLOR.dust;
    }

    return getAtlasAverage(getFaceTexture(definition.textures, 'front')) ?? COLOR.dust;

}

// ------------------------------------------------------------

export class Meteorites {

    // game - Game (świat, scena, gracz, niebo, komunikaty)

    constructor(game) {

        this.game = game;

        this.flying = [];      // lecące meteoryty
        this.fragments = [];   // odpadające odłamki
        this.impacts = [];     // miejsca uderzeń (dym, iskry, żar)
        this.flashes = [];     // dynamiczne światło błysku

        // Tempo meteorytów (1 = normalnie; /meteor tempo 0.25 - zwolnione).
        this.timeScale = 1;

        // Wstrząs kamery 0-1 (Game.render).
        this.shake = 0;

        this.clock = 0;


        // Cząsteczki: świecące (iskry, żar) i zwykłe (odłamki, dym).

        this.glowParticles = new CubeParticles(game.scene, { capacity: 3500, glowing: true });
        this.solidParticles = new CubeParticles(game.scene, { capacity: 2000 });


        // Błysk na cały ekran przy uderzeniu.

        this.overlay = document.createElement('div');

        Object.assign(this.overlay.style, {
            position: 'fixed',
            inset: '0',
            pointerEvents: 'none',
            zIndex: '4',
            opacity: '0',
            mixBlendMode: 'screen',
            background: 'radial-gradient(circle at 50% 45%, rgba(255, 248, 228, 1), rgba(255, 196, 120, 0.7) 55%, rgba(255, 140, 60, 0.35))'
        });

        document.body.appendChild(this.overlay);

        this.overlayOpacity = 0;


        // Obiekty pomocnicze.

        this.tmp = new THREE.Vector3();
        this.tmp2 = new THREE.Vector3();
        this.color = new THREE.Color();

    }


    // W zwolnionym tempie (/meteor tempo) dźwięki są niższe.

    get soundPitch() {

        return Math.max(0.3, Math.min(1.5, this.timeScale));

    }


    // Tryb ziemniaka: mniej cząsteczek.

    get particleScale() {

        return this.game.settings.get('potato') ? 0.4 : 1;

    }

    // --------------------------------------------------------
    // NOWY METEORYT
    // --------------------------------------------------------

    // Zrzuca meteoryt. landing - miejsce upadku (blok na powierzchni)
    // albo null = wybierz samemu w pobliżu gracza. from - kierunek
    // (poziomy), z którego przylatuje; bez niego - losowy.
    // Zwraca meteoryt albo null, jeśli nie ma dobrego miejsca.

    spawn(landing = null, { from = null } = {}) {

        const target = landing ?? this.findLandingSpot();

        if (!target) {
            return null;
        }


        // Nadlatuje z daleka, nisko nad horyzontem (20-30 stopni).

        const flat = from
            ? new THREE.Vector3(from.x, 0, from.z).normalize()
            : new THREE.Vector3().setFromCylindricalCoords(1, Math.random() * Math.PI * 2, 0);

        const rise = random(0.36, 0.5);

        const direction = flat.multiplyScalar(Math.sqrt(1 - rise * rise)).setY(rise);

        const end = target.clone().add(new THREE.Vector3(0.5, 0.3, 0.5));

        const start = end.clone().addScaledVector(direction, START_DISTANCE);


        // Głowa: rozżarzona bryła, jasny środek, pomarańczowa poświata
        // i duża, słaba łuna (bez niej w trybie ziemniaka).

        const group = new THREE.Group();

        const body = createMeteorBody();

        body.scale.setScalar(1.3);

        const core = createGlowSprite(new THREE.Color('#fff4d0'), 3.5);
        const halo = createGlowSprite(new THREE.Color('#ff8a2a'), 12);
        const aura = createGlowSprite(new THREE.Color('#ff4a12'), 36);

        halo.material.opacity = 0.8;
        aura.material.opacity = 0.35;

        group.add(aura, halo, body, core);

        if (this.particleScale < 1) {
            aura.visible = false;
        }


        // Warkocz: świecące punkty tam, gdzie kula była przed chwilą.

        const trailGeometry = new THREE.BufferGeometry();

        trailGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_POINTS * 3), 3));
        trailGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_POINTS * 3), 3));

        const trail = new THREE.Points(
            trailGeometry,
            new THREE.PointsMaterial({
                map: getGlowTexture(),
                size: 7,
                vertexColors: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                transparent: true,
                fog: false
            })
        );

        trail.frustumCulled = false;


        this.game.scene.add(group, trail);


        const meteor = {
            start,
            end,
            landing: target,
            direction: end.clone().sub(start).normalize(),
            age: 0,
            progress: 0,
            flicker: 1,
            position: start.clone(),
            previous: start.clone(),
            velocity: new THREE.Vector3(),
            group,
            body,
            core,
            halo,
            aura,
            trail,
            history: [],
            carry: { embers: 0, smoke: 0 },
            nextFragment: random(1.2, 2),
            light: {
                position: start.clone(),
                color: FIRE_LIGHT,
                strength: 15
            }
        };

        // Huk lecącej kuli (pętla) - coraz głośniejszy i wyższy.

        meteor.sound = this.game.sounds?.loop('meteor_flight', {
            position: start,
            volume: 0.15,
            pitch: 0.75 * this.soundPitch
        }) ?? null;

        this.flying.push(meteor);

        return meteor;

    }


    // Miejsce na powierzchni 18-40 bloków od gracza, w chunkach,
    // których gracz nie zmieniał.

    findLandingSpot() {

        const world = this.game.world;
        const player = this.game.player.pos;


        for (let attempt = 0; attempt < 16; attempt++) {

            const angle = Math.random() * Math.PI * 2;
            const distance = 18 + Math.random() * 22;

            const x = Math.floor(player.x + Math.cos(angle) * distance);
            const z = Math.floor(player.z + Math.sin(angle) * distance);

            if (!this.areaUntouched(x, z)) {
                continue;
            }


            const y = world.getSurfaceY(x, z);

            if (y < 4 || y > CHUNK_HEIGHT - 8) {
                continue;
            }

            return new THREE.Vector3(x, y, z);

        }

        return null;

    }


    // Czy wszystkie chunki w zasięgu osmalenia są wczytane i niezmienione.

    areaUntouched(x, z) {

        const world = this.game.world;

        const reach = Math.ceil(SCORCH_RADIUS) + 2;

        for (let dx = -reach; dx <= reach; dx += reach) {

            for (let dz = -reach; dz <= reach; dz += reach) {

                const chunk = world.getChunk(
                    Math.floor((x + dx) / CHUNK_SIZE),
                    Math.floor((z + dz) / CHUNK_SIZE)
                );

                if (!chunk || chunk.modified) {
                    return false;
                }

            }

        }

        return true;

    }

    // --------------------------------------------------------
    // CO KLATKĘ
    // --------------------------------------------------------

    update(realDt) {

        // Ciemną nocą czasem spada sam (chyba że gracz wyłączył
        // meteoryty w ustawieniach - komenda /meteor działa zawsze).

        const state = this.game.sky.state;

        if (
            METEORITES_PER_NIGHT > 0 &&
            this.game.settings.get('meteorites') &&
            state.night > 0.7 &&
            Math.random() < METEORITES_PER_NIGHT / DARK_NIGHT_SECONDS * realDt
        ) {
            this.spawn();
        }


        const dt = realDt * this.timeScale;

        this.clock += dt;


        for (const meteor of this.flying) {
            this.updateMeteor(meteor, dt);
        }

        this.flying = this.flying.filter((meteor) => !meteor.done);


        this.updateFragments(dt);

        this.updateImpacts(dt);


        for (const flash of this.flashes) {

            flash.age += dt;

            const left = Math.max(0, 1 - flash.age / FLASH_SECONDS);

            flash.strength = 15 * left ** 1.5;

        }

        this.flashes = this.flashes.filter((flash) => flash.age < FLASH_SECONDS);


        this.glowParticles.update(dt, this.game.world);
        this.solidParticles.update(dt, this.game.world);


        this.updateLighting();

    }

    // --------------------------------------------------------
    // PRZELOT
    // --------------------------------------------------------

    updateMeteor(meteor, dt) {

        meteor.age += dt;

        const t = Math.min(1, meteor.age / FLIGHT_SECONDS);

        const progress = t ** FLIGHT_EASE;

        meteor.progress = progress;


        // Na początku wolno, potem coraz szybciej.

        const position = meteor.position;

        position.lerpVectors(meteor.start, meteor.end, progress);

        if (dt > 0) {
            meteor.velocity.subVectors(position, meteor.previous).divideScalar(dt);
        }

        meteor.previous.copy(position);

        meteor.light.position.copy(position);

        if (meteor.sound) {

            meteor.sound.setPosition(position);
            meteor.sound.setVolume(0.15 + 0.55 * progress, 0.2);
            meteor.sound.setPitch((0.75 + 0.45 * progress) * this.soundPitch);

        }


        // Ogień migocze.

        const age = meteor.age;

        meteor.flicker =
            1 + 0.14 * Math.sin(age * 29) + 0.09 * Math.sin(age * 47.3 + 1.3) + 0.06 * (Math.random() - 0.5);


        // Głowa: rośnie i jaśnieje w miarę zbliżania.

        meteor.group.position.copy(position);

        meteor.body.rotation.x += dt * 2.3;
        meteor.body.rotation.y += dt * 1.4;
        meteor.body.rotation.z += dt * 1.8;

        const glow = (0.75 + 0.5 * progress) * meteor.flicker;

        meteor.core.scale.setScalar(3.5 * glow);
        meteor.halo.scale.setScalar(12 * glow);
        meteor.aura.scale.setScalar(36 * (0.8 + 0.4 * progress) * (0.9 + 0.1 * meteor.flicker));


        this.updateTrail(meteor);

        this.emitTrail(meteor, dt);


        // Co chwilę odpada płonący odłamek.

        if (age >= meteor.nextFragment && t < 0.93) {

            meteor.nextFragment = age + random(0.35, 0.9);

            const side = randomInSphere(new THREE.Vector3(), 1);

            side.addScaledVector(meteor.direction, -side.dot(meteor.direction)).normalize();

            this.fragments.push({
                position: position.clone(),
                velocity: meteor.velocity.clone().multiplyScalar(random(0.75, 0.92)).addScaledVector(side, random(6, 13)),
                age: 0,
                life: random(0.9, 1.8),
                carry: 0
            });

        }


        if (t >= 1) {
            this.impact(meteor);
        }

    }


    // Warkocz: ostatnie pozycje, od gorącego do ciemnego.

    updateTrail(meteor) {

        meteor.history.unshift(meteor.position.clone());

        if (meteor.history.length > TRAIL_POINTS) {
            meteor.history.pop();
        }

        const attributes = meteor.trail.geometry.attributes;

        const positions = attributes.position.array;
        const colors = attributes.color.array;

        const color = this.color;

        meteor.history.forEach((point, i) => {

            const k = i / TRAIL_POINTS;

            if (k < 0.12) {
                color.lerpColors(COLOR.white, COLOR.yellow, k / 0.12);
            }
            else {
                color.lerpColors(COLOR.yellow, COLOR.red, Math.min(1, (k - 0.12) * 1.8));
            }

            color.multiplyScalar((1 - k) ** 1.2);

            point.toArray(positions, i * 3);
            color.toArray(colors, i * 3);

        });

        meteor.trail.geometry.setDrawRange(0, meteor.history.length);

        attributes.position.needsUpdate = true;
        attributes.color.needsUpdate = true;

    }


    // Iskry i dym z lecącej kuli.

    emitTrail(meteor, dt) {

        const scale = this.particleScale;

        const tmp = this.tmp;
        const velocity = this.tmp2;


        meteor.carry.embers += PARTICLES.trailEmbers * scale * dt;

        while (meteor.carry.embers >= 1) {

            meteor.carry.embers--;

            const position = randomInSphere(tmp, 0.7).add(meteor.position);

            randomInSphere(velocity, 3).addScaledVector(meteor.velocity, random(0.05, 0.35));

            this.glowParticles.emit({
                position,
                velocity,
                life: random(0.5, 1.7),
                size: random(0.07, 0.25),
                sizeEnd: 0.03,
                fade: 0.3,
                colors: [Math.random() < 0.5 ? COLOR.white : COLOR.yellow, COLOR.orange, COLOR.ember],
                gravity: 3,
                drag: 1.4,
                spin: 10
            });

        }


        meteor.carry.smoke += PARTICLES.trailSmoke * scale * dt;

        while (meteor.carry.smoke >= 1) {

            meteor.carry.smoke--;

            const position = randomInSphere(tmp, 0.9).add(meteor.position).addScaledVector(meteor.direction, -1);

            randomInSphere(velocity, 0.6).addScaledVector(meteor.velocity, 0.04);

            velocity.y += 0.3;

            this.solidParticles.emit({
                position,
                velocity,
                life: random(2.5, 4.5),
                size: random(0.3, 0.45),
                sizeEnd: random(0.9, 1.3),
                fade: 0.4,
                colors: [COLOR.smokeDark, COLOR.smoke, COLOR.smokeLight],
                drag: 0.9,
                lift: 0.2,
                spin: 1.5
            });

        }

    }


    // Odpadające odłamki: lecą łukiem, sypią iskrami i gasną.

    updateFragments(dt) {

        const scale = this.particleScale;

        const world = this.game.world;

        const velocity = this.tmp2;


        for (const fragment of this.fragments) {

            fragment.age += dt;

            fragment.velocity.y -= 9.8 * dt;

            fragment.velocity.multiplyScalar(Math.exp(-0.35 * dt));

            fragment.position.addScaledVector(fragment.velocity, dt);


            const p = fragment.position;

            if (
                fragment.age >= fragment.life ||
                world.isSolid(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))
            ) {
                fragment.done = true;
                continue;
            }


            const heat = 1 - fragment.age / fragment.life;

            // Sam odłamek - jasny sześcianik w miejscu, gdzie jest teraz.

            this.glowParticles.emit({
                position: p,
                life: 0.05,
                size: 0.3 * (0.5 + 0.5 * heat),
                fade: 0,
                colors: [COLOR.white, COLOR.yellow, COLOR.orange],
                spin: 12
            });

            fragment.carry += PARTICLES.fragmentEmbers * scale * heat * dt;

            while (fragment.carry >= 1) {

                fragment.carry--;

                randomInSphere(velocity, 1.5).addScaledVector(fragment.velocity, 0.2);

                this.glowParticles.emit({
                    position: p,
                    velocity,
                    life: random(0.3, 0.8),
                    size: random(0.05, 0.14),
                    sizeEnd: 0.02,
                    fade: 0.3,
                    colors: [COLOR.yellow, COLOR.orange, COLOR.ember],
                    gravity: 4,
                    drag: 1.2,
                    spin: 12
                });

            }

        }

        this.fragments = this.fragments.filter((fragment) => !fragment.done);

    }

    // --------------------------------------------------------
    // UDERZENIE
    // --------------------------------------------------------

    impact(meteor) {

        meteor.done = true;

        meteor.sound?.stop(0.15);

        this.removeObjects(meteor);


        const { x, y, z } = meteor.landing;

        const bottom = this.explode(x, y, z);


        const player = this.game.player.pos;

        const distance = Math.round(Math.hypot(player.x - x, player.z - z));

        this.game.onMessage?.(
            `Meteoryt spadł na ${x}, ${bottom}, ${z} (${distance} bloków od ciebie).`
        );

    }


    // Wybuch jak przy uderzeniu meteorytu w miejscu (x, y, z) - y to
    // pierwszy blok powietrza nad ziemią. Używa go też gracz spadający
    // z kosmosu (src/space/Skyfall.js).
    //   scale     - wielkość krateru i wybuchu (1 = jak meteoryt),
    //   meteorite - czy na dnie zostaje rozżarzony blok meteorytu,
    //   clear     - promień wolny od cząsteczek wokół środka (gracz
    //               stoi w środku wybuchu - odłamki, dym i iskry
    //               zaczynają się dalej, a nie na jego oczach).
    // Zwraca y dna krateru.

    explode(x, y, z, { scale = 1, meteorite = true, clear = 0 } = {}) {

        const world = this.game.world;

        const center = new THREE.Vector3(x + 0.5, y, z + 0.5);


        // Kolory odłamków: z bloków, które wylecą z krateru.

        const debrisColors = this.sampleCraterColors(x, y, z);


        this.carveCrater(x, y, z, scale);


        // Na dnie zostaje rozżarzony meteoryt, czasem z odłamkami obok.

        const bottom = world.getSurfaceY(x, z);

        if (meteorite) {

            world.setBlock(x, bottom, z, 'meteorite');

            const pieces = Math.floor(random(0, 3.2));

            for (let i = 0; i < pieces; i++) {

                const angle = Math.random() * Math.PI * 2;
                const distance = random(1, CRATER_RADIUS * scale * 0.6);

                const px = Math.floor(x + 0.5 + Math.cos(angle) * distance);
                const pz = Math.floor(z + 0.5 + Math.sin(angle) * distance);

                world.setBlock(px, world.getSurfaceY(px, pz), pz, 'meteorite');

            }

        }


        // Błysk (dynamiczne światło) nad krawędzią krateru.

        this.flashes.push({
            position: new THREE.Vector3(x + 0.5, y + 2.5, z + 0.5),
            color: FLASH_LIGHT,
            strength: 15,
            age: 0
        });

        // Kula ognia wybuchu: rośnie i gaśnie w ułamku sekundy.

        const blast = createGlowSprite(new THREE.Color('#ff8a30'), 4);
        const blastCore = createGlowSprite(new THREE.Color('#fff0c8'), 3);

        blast.position.set(center.x, center.y + 1.2, center.z);
        blastCore.position.copy(blast.position);

        const shockwave = createShockwave();

        shockwave.position.set(center.x, center.y + 0.15, center.z);

        this.game.scene.add(blast, blastCore, shockwave);

        // Dźwięk: huk dochodzi później niż błysk (prędkość dźwięku),
        // potem grad odłamków i trzaskający żar.

        const soundDelay = this.game.camera.position.distanceTo(center) / SPEED_OF_SOUND;

        const sounds = this.game.sounds;

        sounds?.play('meteor_impact', { position: center, delay: soundDelay / this.timeScale, pitch: this.soundPitch });
        sounds?.play('meteor_debris', { position: center, delay: (soundDelay + 0.3) / this.timeScale, pitch: this.soundPitch });

        this.impacts.push({
            center,
            age: 0,
            carry: { smoke: 0, sparks: 0 },
            debrisColors,
            blast,
            blastCore,
            shockwave,
            soundDelay,
            fire: null,
            clear
        });

        this.burst(center, debrisColors, scale, clear);

        return bottom;

    }


    // Kolory bloków w miejscu krateru (bez roślin i powietrza).

    sampleCraterColors(x, y, z) {

        const world = this.game.world;

        const colors = [];

        for (let dy = -1; dy >= -3; dy--) {

            for (let dx = -3; dx <= 3; dx++) {

                for (let dz = -3; dz <= 3; dz++) {

                    const id = world.getBlockId(x + dx, y + dy, z + dz);

                    if (id && !isPlantId(id)) {
                        colors.push(blockColor(getBlockTypeById(id)));
                    }

                }

            }

        }

        return colors.length > 0 ? colors : [COLOR.dust];

    }


    // Krater z nierównym brzegiem, wyłożony żwirem i spaloną ziemią,
    // wał wyrzuconej ziemi dookoła i osmalona okolica bez roślin.

    carveCrater(x, y, z, scale = 1) {

        const world = this.game.world;

        const R = CRATER_RADIUS * scale;

        const scorch = SCORCH_RADIUS * scale;

        const reach = Math.ceil(R) + 1;


        // Misa: środek pół bloku pod powierzchnią, spłaszczona w pionie.

        for (let dy = reach; dy >= -reach; dy--) {

            for (let dx = -reach; dx <= reach; dx++) {

                for (let dz = -reach; dz <= reach; dz++) {

                    const radius = R * (0.86 + 0.28 * hash01(x + dx, z + dz));

                    const distance = dx * dx + dz * dz + (dy + 0.5) * (dy + 0.5) * 1.6;

                    if (distance <= radius * radius && y + dy >= 1) {
                        world.setBlock(x + dx, y + dy, z + dz, null);
                    }

                }

            }

        }


        // Dookoła: spalone rośliny, osmalona ziemia, wał i wyłożone dno.

        const S = Math.ceil(scorch);

        for (let dx = -S; dx <= S; dx++) {

            for (let dz = -S; dz <= S; dz++) {

                const distance = Math.hypot(dx, dz);

                if (distance > scorch) {
                    continue;
                }

                const bx = x + dx;
                const bz = z + dz;

                const top = world.getSurfaceY(bx, bz);


                // Roślina na wierzchu spłonęła.

                if (isPlantId(world.getBlockId(bx, top, bz))) {
                    world.setBlock(bx, top, bz, null);
                }

                const groundId = world.getBlockId(bx, top - 1, bz);


                // Dno krateru: żwir i rozbita ziemia, czasem stopiona skała.

                if (distance < R) {

                    if (Math.random() < 0.55) {

                        const soil = isSoilId(groundId) || getBlockTypeById(groundId) === 'sand';

                        if (soil) {
                            world.setBlock(bx, top - 1, bz, Math.random() < 0.5 ? 'gravel' : 'coarse_dirt');
                        }
                        else if (Math.random() < 0.4) {
                            world.setBlock(bx, top - 1, bz, 'basalt');
                        }

                    }

                    continue;

                }


                // Wał z wyrzuconej ziemi tuż za brzegiem.

                const rim = 1 - Math.abs(distance - (R + RIM_WIDTH * scale * 0.5)) / (RIM_WIDTH * scale);

                if (rim > 0 && Math.random() < 0.55 * rim && top < CHUNK_HEIGHT - 1) {

                    world.setBlock(bx, top, bz, pick(['gravel', 'coarse_dirt', 'coarse_dirt', 'dirt']));

                    continue;

                }


                // Osmalona (czarna) ziemia: im bliżej krateru, tym więcej.

                const burn = 0.9 * (1 - (distance - R) / (scorch - R)) ** 0.7;

                const ground = getBlockTypeById(groundId);

                if (
                    Math.random() < burn &&
                    (ground === 'grass' || ground === 'forest_floor' || ground === 'dirt')
                ) {
                    world.setBlock(bx, top - 1, bz, Math.random() < 0.8 ? 'humus' : 'coarse_dirt');
                }

            }

        }

    }


    // Wybuch: fala iskier po ziemi, odłamki, żar i pył.

    burst(center, debrisColors, size = 1, clear = 0) {

        const scale = this.particleScale * size;

        const position = this.tmp;
        const velocity = this.tmp2;

        const count = (n) => Math.round(n * scale);

        // Z wolnym środkiem (clear): cząsteczki zaczynają się na pierścieniu.

        const ring = (angle, spread) => {

            const r = clear + random(0, spread);

            return position.set(center.x + Math.cos(angle) * r, center.y, center.z + Math.sin(angle) * r);

        };


        // Odłamki ziemi i skał - lecą wysoko, odbijają się i leżą chwilę.

        for (let i = 0; i < count(PARTICLES.debris); i++) {

            const angle = Math.random() * Math.PI * 2;
            const up = random(0.6, 1.6);
            const speed = random(9, 20);

            velocity.set(Math.cos(angle), up, Math.sin(angle)).normalize().multiplyScalar(speed);

            if (clear > 0) {
                ring(angle, 2).y += random(-0.5, 1);
            }
            else {

                position.set(
                    center.x + random(-2, 2),
                    center.y + random(-0.5, 1),
                    center.z + random(-2, 2)
                );

            }

            const color = pick(debrisColors).clone().multiplyScalar(random(0.8, 1.1));

            this.solidParticles.emit({
                position,
                velocity,
                life: random(4, 8),
                size: random(0.15, 0.5) * (clear > 0 ? 0.6 : 1),
                fade: 0.15,
                colors: color,
                gravity: 24,
                drag: 0.15,
                spin: 9,
                collide: true
            });

        }


        // Żar - świecące sześcianiki we wszystkie strony w górę.

        for (let i = 0; i < count(PARTICLES.embers); i++) {

            randomInSphere(velocity, 1);

            velocity.y = Math.abs(velocity.y) + 0.2;

            velocity.normalize().multiplyScalar(random(6, 26));

            if (clear > 0) {
                ring(Math.atan2(velocity.z, velocity.x), 0.5).y += 0.5;
            }
            else {
                position.set(center.x, center.y + 0.5, center.z);
            }

            this.glowParticles.emit({
                position,
                velocity,
                life: random(1, 3),
                size: random(0.07, 0.26),
                sizeEnd: 0.03,
                fade: 0.3,
                colors: [COLOR.white, COLOR.orange, COLOR.ember],
                gravity: 10,
                drag: 0.7,
                spin: 14
            });

        }


        // Słup iskier prosto w górę (nie wtedy, gdy w środku stoi gracz).

        for (let i = 0; i < (clear > 0 ? 0 : count(PARTICLES.column)); i++) {

            randomInSphere(velocity, 2.5);

            velocity.y = random(14, 32);

            position.set(center.x + random(-0.8, 0.8), center.y + 0.3, center.z + random(-0.8, 0.8));

            this.glowParticles.emit({
                position,
                velocity,
                life: random(1.2, 2.6),
                size: random(0.1, 0.3),
                sizeEnd: 0.04,
                fade: 0.35,
                colors: [COLOR.white, COLOR.yellow, COLOR.red],
                gravity: 12,
                drag: 0.9,
                spin: 10
            });

        }


        // Fala iskier tuż nad ziemią.

        for (let i = 0; i < count(PARTICLES.shockwave); i++) {

            const angle = Math.random() * Math.PI * 2;

            velocity.set(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(random(16, 25));

            velocity.y = random(0.3, 1.5);

            position.set(center.x + Math.cos(angle) * (0.6 + clear), center.y + 0.4, center.z + Math.sin(angle) * (0.6 + clear));

            this.glowParticles.emit({
                position,
                velocity,
                life: random(0.4, 0.75),
                size: random(0.12, 0.26),
                sizeEnd: 0.05,
                fade: 0.25,
                colors: [COLOR.white, COLOR.yellow, COLOR.orange],
                drag: 2.2,
                spin: 8
            });

        }


        // Pierścień pyłu - rośnie i rozchodzi się na boki.

        const dust = debrisColors.map((c) => c.clone().lerp(COLOR.dust, 0.5));

        for (let i = 0; i < count(PARTICLES.dust); i++) {

            const angle = Math.random() * Math.PI * 2;

            velocity.set(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(random(7, 12));

            velocity.y = random(0.5, 2.5);

            position.set(center.x + Math.cos(angle) * (1.5 + clear), center.y + random(0.2, 1), center.z + Math.sin(angle) * (1.5 + clear));

            const color = pick(dust);

            this.solidParticles.emit({
                position,
                velocity,
                life: random(1.5, 2.8),
                size: random(0.35, 0.5),
                sizeEnd: random(1.1, 1.5),
                fade: 0.5,
                colors: [color, color, COLOR.smokeLight],
                drag: 1.6,
                lift: 0.3,
                spin: 2
            });

        }

    }


    // Po uderzeniu: słup dymu i iskry z krateru (coraz słabsze).

    updateImpacts(dt) {

        const scale = this.particleScale;

        const position = this.tmp;
        const velocity = this.tmp2;


        for (const impact of this.impacts) {

            impact.age += dt;

            const age = impact.age;

            const c = impact.center;


            // Trzaskający żar (od chwili, gdy doszedł huk) - cichnie.

            if (!impact.fire && !impact.fireDone && age >= impact.soundDelay) {

                impact.fireDone = true;

                impact.fire = this.game.sounds?.loop('fire_crackle', {
                    position: new THREE.Vector3(c.x, c.y + 0.5, c.z),
                    pitch: this.soundPitch
                }) ?? null;

            }

            impact.fire?.setVolume(Math.exp(-age / 9), 0.3);

            if (age >= IMPACT_SECONDS) {
                impact.fire?.stop(1.5);
            }


            // Kula ognia wybuchu.

            if (impact.blast) {

                const grow = 1 - Math.exp(-age * 5);

                impact.blast.scale.setScalar(4 + 28 * grow);
                impact.blast.material.opacity = Math.exp(-age * 2.2);

                impact.blastCore.scale.setScalar(3 + 9 * (1 - Math.exp(-age * 9)));
                impact.blastCore.material.opacity = Math.exp(-age * 4);

                // Fala: w pół sekundy na 30 bloków, potem gaśnie.

                impact.shockwave.scale.setScalar(2 + 60 * (1 - Math.exp(-age * 3.2)));
                impact.shockwave.material.opacity = Math.max(0, 1 - age / 0.9) ** 1.5;

                if (age > 2.5) {
                    this.removeBlast(impact);
                }

            }


            impact.carry.smoke += age < 16 ? PARTICLES.smoke * scale * Math.exp(-age / 6) * dt : 0;

            while (impact.carry.smoke >= 1) {

                impact.carry.smoke--;

                this.craterPoint(impact, 1.6, -0.5, 0.8);

                velocity.set(random(-0.6, 0.6) + 0.5, random(3, 6), random(-0.6, 0.6));

                this.solidParticles.emit({
                    position,
                    velocity,
                    life: random(6, 9),
                    size: random(0.5, 0.8),
                    sizeEnd: random(1.8, 2.6),
                    fade: 0.35,
                    colors: [COLOR.smokeDark, COLOR.smoke, COLOR.smokeLight],
                    drag: 0.35,
                    lift: 0.25,
                    spin: 1.2
                });

            }


            impact.carry.sparks += age < 18 ? PARTICLES.sparks * scale * Math.exp(-age / 6) * dt : 0;

            while (impact.carry.sparks >= 1) {

                impact.carry.sparks--;

                this.craterPoint(impact, 1.2, -0.6, 0.4);

                velocity.set(random(-1.2, 1.2), random(2, 6), random(-1.2, 1.2));

                this.glowParticles.emit({
                    position,
                    velocity,
                    life: random(0.6, 1.4),
                    size: random(0.05, 0.12),
                    sizeEnd: 0.02,
                    fade: 0.3,
                    colors: [COLOR.yellow, COLOR.orange, COLOR.ember],
                    gravity: 3,
                    drag: 0.8,
                    spin: 12
                });

            }

        }

        this.impacts = this.impacts.filter((impact) => impact.age < IMPACT_SECONDS);

    }


    // Losowy punkt w kraterze (do this.tmp): w kwadracie +-spread wokół
    // środka, a z wolnym środkiem (impact.clear) - na pierścieniu za nim.

    craterPoint(impact, spread, low, high) {

        const c = impact.center;

        if (impact.clear > 0) {

            const angle = Math.random() * Math.PI * 2;
            const r = impact.clear + random(0, spread);

            return this.tmp.set(c.x + Math.cos(angle) * r, c.y + random(low, high), c.z + Math.sin(angle) * r);

        }

        return this.tmp.set(c.x + random(-spread, spread), c.y + random(low, high), c.z + random(-spread, spread));

    }


    removeBlast(impact) {

        for (const sprite of [impact.blast, impact.blastCore, impact.shockwave]) {

            sprite.removeFromParent();
            sprite.material.dispose();

        }

        impact.shockwave.geometry.dispose();

        impact.blast = null;
        impact.blastCore = null;
        impact.shockwave = null;

    }

    // --------------------------------------------------------
    // ŚWIATŁO, ŁUNA, BŁYSK, WSTRZĄS
    // --------------------------------------------------------

    // Najsilniejsze ze źródeł (lecąca kula albo świeże uderzenie)
    // oświetla teren i niebo. Błysk na ekranie i wstrząs zależą od
    // odległości od gracza.

    updateLighting() {

        const camera = this.game.camera;

        const eye = camera.position;

        let best = null;


        for (const meteor of this.flying) {

            const p = meteor.progress;

            const power = (0.8 + 2.2 * p * p) * meteor.flicker;

            if (!best || power > best.power) {

                best = {
                    power,
                    position: meteor.position,
                    color: LIGHT_FIRE,
                    range: 38,
                    sky: (0.3 + 1.1 * p) * meteor.flicker
                };

            }

        }


        // Gracz spadający z kosmosu jak meteoryt (src/space/Skyfall.js).

        const fall = this.game.skyfall?.glow;

        if (fall && (!best || fall.power > best.power)) {
            best = fall;
        }


        let flash = 0;
        let overlay = 0;
        let shake = 0;


        for (const impact of this.impacts) {

            const a = impact.age;

            const power = 3.6 * Math.exp(-a * 2.4) + 1.1 * Math.exp(-a / 7);

            if (!best || power > best.power) {

                const cool = 1 - Math.exp(-a * 1.5);

                best = {
                    power,
                    position: this.tmp.copy(impact.center).setY(impact.center.y + 2.2),
                    color: new THREE.Vector3().lerpVectors(LIGHT_FLASH, LIGHT_EMBER, cool),
                    range: 14 + 40 * Math.exp(-a * 1.3),
                    sky: 2.2 * Math.exp(-a * 2.2) + 0.35 * Math.exp(-a / 8)
                };

            }


            const distance = eye.distanceTo(impact.center);

            flash += 0.45 * Math.exp(-a * 3.5) / (1 + distance / 150);


            // Błysk na ekranie - mocniejszy, gdy patrzymy w tę stronę.

            const toImpact = this.tmp2.subVectors(impact.center, eye).normalize();

            const forward = camera.getWorldDirection(new THREE.Vector3());

            const facing = 0.35 + 0.65 * THREE.MathUtils.clamp((forward.dot(toImpact) + 0.2) / 1.2, 0, 1);

            overlay = Math.max(overlay, 0.85 * Math.exp(-a * 7) * facing / (1 + distance / 80));

            shake = Math.max(shake, Math.max(0, 1 - distance / 110) ** 1.3 * Math.exp(-a * 2.6));

        }


        // Tuż przed uderzeniem, gdy kula przelatuje blisko - drżenie.

        for (const meteor of this.flying) {

            const distance = eye.distanceTo(meteor.position);

            shake = Math.max(shake, 0.3 * Math.max(0, 1 - distance / 70) ** 2);

        }


        // Do shaderów.

        if (best) {

            meteorLightUniforms.uMeteorPosition.value.copy(best.position);
            meteorLightUniforms.uMeteorColor.value.copy(best.color).multiplyScalar(best.power);
            meteorLightUniforms.uMeteorRange.value = best.range;

            skyUniforms.uMeteorDirection.value.subVectors(best.position, eye).normalize();
            skyUniforms.uMeteorGlow.value.copy(SKY_FIRE).multiplyScalar(best.sky);

        }
        else {

            meteorLightUniforms.uMeteorColor.value.set(0, 0, 0);

            skyUniforms.uMeteorGlow.value.setRGB(0, 0, 0);

        }

        skyUniforms.uSkyFlash.value.copy(SKY_FLASH).multiplyScalar(flash);


        this.shake = shake;

        this.setOverlay(overlay);

    }


    setOverlay(opacity) {

        const value = opacity < 0.01 ? 0 : Math.min(1, opacity);

        if (Math.abs(value - this.overlayOpacity) < 0.005 && !(value === 0 && this.overlayOpacity !== 0)) {
            return;
        }

        this.overlayOpacity = value;

        this.overlay.style.opacity = value.toFixed(3);

    }

    // --------------------------------------------------------

    // Źródła dynamicznego światła: lecące meteoryty i błyski.

    getLightSources() {

        return [
            ...this.flying.map((meteor) => meteor.light),
            ...this.flashes
        ];

    }


    // Czy coś się teraz dzieje (do testów i komend).

    get active() {

        return this.flying.length + this.impacts.length + this.fragments.length > 0 ||
            this.glowParticles.count + this.solidParticles.count > 0;

    }


    removeObjects(meteor) {

        meteor.sound?.stop(0.1);

        meteor.group.removeFromParent();
        meteor.trail.removeFromParent();

        meteor.body.geometry.dispose();
        meteor.body.material.dispose();

        for (const sprite of [meteor.core, meteor.halo, meteor.aura]) {
            sprite.material.dispose();
        }

        meteor.trail.geometry.dispose();
        meteor.trail.material.dispose();

    }


    dispose() {

        for (const meteor of this.flying) {
            this.removeObjects(meteor);
        }

        for (const impact of this.impacts) {

            if (impact.blast) {
                this.removeBlast(impact);
            }

            impact.fire?.stop(0.1);

        }

        this.flying = [];
        this.fragments = [];
        this.impacts = [];
        this.flashes = [];

        this.glowParticles.dispose();
        this.solidParticles.dispose();

        this.overlay.remove();

        this.shake = 0;

        meteorLightUniforms.uMeteorColor.value.set(0, 0, 0);

        skyUniforms.uMeteorGlow.value.setRGB(0, 0, 0);
        skyUniforms.uSkyFlash.value.setRGB(0, 0, 0);

    }

}

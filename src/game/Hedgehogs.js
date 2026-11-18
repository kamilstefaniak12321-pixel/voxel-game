import * as THREE from 'three';
import { PLAYER_REACH } from '../config.js';
import { isPassableId, isSolidId } from '../blocks/BlockRegistry.js';
import { shrubInfo } from '../blocks/shrubs.js';
import { seasonAt } from '../sky/Seasons.js';
import { Hedgehog, HEDGEHOG, HEDGEHOG_FOODS, hedgehogVariant } from '../world/animals/Hedgehog.js';
import { HedgehogRenderer } from '../rendering/HedgehogRenderer.js';

// ------------------------------------------------------------
// JEŻYKI W ŚWIECIE (1.18.0)
//
// Jeżyków gra nie zapisuje. Każdy ma DOM - blok liści dzikiego krzewu
// jagodowego - wyliczany z ziarna świata (jak same krzewy): co któryś
// krzew ma lokatora, zawsze tego samego i w tym samym kolorze. Jeżyk
// pojawia się, gdy gracz jest w pobliżu domu (śpi w liściach albo żeruje
// obok - zależnie od pory), i znika, gdy gracz odejdzie. Jeśli krzew
// zniknął (wycięty), jeżyka nie ma.
//
// Zachowanie: world/animals/Hedgehog.js. Wygląd: HedgehogRenderer.js.
// Gracz: LPM - jeżyk zwija się w kulkę (nic mu nie jest), PPM z jagodami
// w ręce - je z ręki.
// W grze wieloosobowej każdy gracz ma własne jeżyki (te same domy
// i kolory, ale ruch liczony u siebie).
// ------------------------------------------------------------

// Jaka część dzikich krzewów ma jeżyka i ile krzew musi mieć bloków.
export const HEDGEHOG_HOME_CHANCE = 0.3;
export const HEDGEHOG_HOME_BLOCKS = 3;

// Z jakiej odległości od gracza (w poziomie) jeżyk się pojawia i znika,
// ile najwyżej naraz i co ile sekund szukamy domów.
export const HEDGEHOG_SPAWN_RANGE = 44;
export const HEDGEHOG_DESPAWN_RANGE = 60;
export const HEDGEHOG_LIMIT = 10;
const SCAN_SECONDS = 2;

function hash(seed, salt) {
    let h = Math.imul(seed ^ Math.imul(salt + 1, 0x9e3779b1), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Czy w krzewie z generatora mieszka jeżyk: null albo { dx, dz, variant,
// shift } - kolumna krzewu z domem, kolor i przesunięcie pory wstawania.
export function hedgehogHome(shrub) {
    if (shrub.shape.blocks.length < HEDGEHOG_HOME_BLOCKS || hash(shrub.seed, 1) >= HEDGEHOG_HOME_CHANCE) return null;
    const ground = shrub.shape.blocks.filter(([, dy, , type]) => dy === 0 && shrubInfo(type)?.part !== 'stem');
    if (!ground.length) return null;
    const [dx, , dz] = ground[Math.floor(hash(shrub.seed, 2) * ground.length)];
    return { dx, dz, variant: hedgehogVariant(hash(shrub.seed, 3)), shift: hash(shrub.seed, 4) * 0.03 };
}

// Najniższy blok liści krzewu w kolumnie (x, z) w pobliżu wysokości y
// albo null (krzewu już nie ma / chunk niewczytany).
export function findLeafCell(world, x, y, z) {
    for (let cy = y + 2; cy >= Math.max(1, y - 3); cy--) {
        if (!isPassableId(world.getBlockId(x, cy, z))) continue;
        while (cy > 1 && isPassableId(world.getBlockId(x, cy - 1, z))) cy--;
        const below = world.getBlockId(x, cy - 1, z);
        return isSolidId(below) && !isPassableId(below) ? { x, y: cy, z } : null;
    }
    return null;
}


export class Hedgehogs {

    constructor(game) {
        this.game = game;
        this.list = [];
        this.byHome = new Map();
        this.renderer = game.scene ? new HedgehogRenderer(game) : null;
        this.scanWait = 0;
        this.nextId = 1;
        this.env = { timeOfDay: 0.5, winter: false, players: [] };
        this.me = { id: 'me', x: 0, y: 0, z: 0, speed: 0, food: false };
        this.last = new THREE.Vector3();
        this.hasLast = false;
        this.ray = new THREE.Ray();
        this.direction = new THREE.Vector3();
        this.point = new THREE.Vector3();
        this.box = new THREE.Box3();
        this.soundWait = 0;
        this.met = new Set();
        this.disposed = false;
    }

    // Dodaje jeżyka z domem w komórce liści `home`. key - stały klucz domu
    // (dziki krzew) albo null (jeżyk z komendy).
    add(home, { variant = 'brown', shift = 0, key = null, x, y, z } = {}) {
        const hedgehog = new Hedgehog(this.game.world, { id: this.nextId++, variant, home, shift, x, y, z });
        hedgehog.key = key;
        this.list.push(hedgehog);
        if (key) this.byHome.set(key, hedgehog);
        return hedgehog;
    }

    remove(hedgehog) {
        const index = this.list.indexOf(hedgehog);
        if (index >= 0) this.list.splice(index, 1);
        if (hedgehog.key) this.byHome.delete(hedgehog.key);
        this.renderer?.removeView(hedgehog.id);
    }

    // Szuka domów w dzikich krzewach wokół gracza.
    scan(player) {
        const shrubs = this.game.world.generator?.shrubs;
        if (!shrubs) return;
        const world = this.game.world, R = HEDGEHOG_SPAWN_RANGE;
        shrubs.forEachShrub(player.x - R, player.z - R, player.x + R, player.z + R, (shrub) => {
            if (this.list.length >= HEDGEHOG_LIMIT) return;
            const key = `${shrub.x},${shrub.z}`;
            if (this.byHome.has(key)) return;
            const info = hedgehogHome(shrub);
            if (!info) return;
            const x = shrub.x + info.dx, z = shrub.z + info.dz;
            if (Math.hypot(x + 0.5 - player.x, z + 0.5 - player.z) > R) return;
            const home = findLeafCell(world, x, shrub.y, z);
            if (!home) return;
            const hedgehog = this.add(home, { variant: info.variant, shift: info.shift, key });
            // Pojawia się już "w trakcie dnia": w nocy żeruje w pobliżu domu.
            hedgehog.update(0, this.env);
        });
    }

    update(dt) {

        if (this.disposed) return;

        const game = this.game, player = game.player.pos;
        const days = game.time?.days ?? 0.5;
        const env = this.env;

        env.timeOfDay = days - Math.floor(days);
        env.winter = seasonAt(days).index === 3;

        // Gracz: prędkość z przebytej drogi (działa też na tratwie i w locie).
        const me = this.me;
        const moved = this.hasLast ? Math.hypot(player.x - this.last.x, player.z - this.last.z) : 0;
        me.speed = dt > 0 ? Math.min(20, moved / dt) : 0;
        me.x = player.x; me.y = player.y; me.z = player.z;
        me.food = HEDGEHOG_FOODS.has(game.selectedBlock);
        this.last.copy(player); this.hasLast = true;
        env.players.length = 0;
        env.players.push(me);

        this.scanWait -= dt;
        if (this.scanWait <= 0) {
            this.scanWait = SCAN_SECONDS;
            this.scan(player);
            for (const hedgehog of [...this.list]) {
                const away = Math.hypot(hedgehog.x - player.x, hedgehog.z - player.z);
                const homeGone = !isPassableId(game.world.getBlockId(hedgehog.home.x, hedgehog.home.y, hedgehog.home.z));
                // Dom zniknął: jeżyk odchodzi, gdy nikt nie patrzy z bliska.
                if (away > HEDGEHOG_DESPAWN_RANGE || (homeGone && hedgehog.key && away > 16)) this.remove(hedgehog);
            }
        }

        this.soundWait -= dt;

        for (const hedgehog of this.list) {
            hedgehog.update(Math.min(dt, 0.1), env);
            this.afterUpdate(hedgehog, player);
        }

        this.renderer?.sync(this.list, dt);

    }

    // Dźwięki i osiągnięcia po kroku zachowania.
    afterUpdate(hedgehog, player) {
        const game = this.game;
        const distance = Math.hypot(hedgehog.x - player.x, hedgehog.y - player.y, hedgehog.z - player.z);
        for (const event of hedgehog.events) {
            if (distance > 14) continue;
            const position = this.point.set(hedgehog.x, hedgehog.y + 0.2, hedgehog.z);
            if (event === 'curl') game.sounds?.play('hedgehog_curl', { position: position.clone() });
            else if (event === 'eat') game.sounds?.play('hedgehog_eat', { position: position.clone() });
            else if (event === 'sniff' && this.soundWait <= 0) {
                this.soundWait = 2.5;
                game.sounds?.play('hedgehog_sniff', { position: position.clone() });
            }
            if (event === 'curl' && distance < 6) game.achieve?.('hedgehogCurled', { variant: hedgehog.variant });
        }
        hedgehog.events.length = 0;
        if (hedgehog.awake && distance < 5 && !this.met.has(hedgehog.id)) {
            this.met.add(hedgehog.id);
            game.achieve?.('hedgehogMet', { variant: hedgehog.variant });
        }
    }

    // Jeżyk pod celownikiem (bliżej niż blok, na który patrzy gracz).
    hit(camera, terrainHit) {
        camera.getWorldDirection(this.direction);
        this.ray.set(camera.position, this.direction);
        const limit = Math.min(PLAYER_REACH, terrainHit?.hit ? terrainHit.distance : PLAYER_REACH);
        const [w, h, l] = HEDGEHOG.size;
        const half = Math.max(w, l) / 2 + 0.06;
        let best = null;
        for (const hedgehog of this.list) {
            this.box.min.set(hedgehog.x - half, hedgehog.y, hedgehog.z - half);
            this.box.max.set(hedgehog.x + half, hedgehog.y + h + 0.06, hedgehog.z + half);
            const point = this.ray.intersectBox(this.box, this.point);
            if (!point) continue;
            const distance = point.distanceTo(camera.position);
            if (distance <= limit && (!best || distance < best.distance)) best = { hedgehog, distance };
        }
        return best;
    }

    // LPM / PPM. Zwraca true, gdy kliknięcie trafiło w jeżyka.
    interact({ breakPressed, placePressed, terrainHit }) {
        if ((!breakPressed && !placePressed) || !this.list.length) return false;
        const game = this.game;
        const hit = this.hit(game.camera, terrainHit);
        if (!hit) return false;
        const hedgehog = hit.hedgehog;
        if (breakPressed) {
            hedgehog.hit();
            return true;
        }
        const item = game.selectedBlock;
        if (hedgehog.canEat(item)) {
            if (game.mode === 'adventure') game.inventory.remove(item, 1);
            hedgehog.feed();
            game.achieve?.('hedgehogFed', { item, variant: hedgehog.variant, fed: hedgehog.fed });
            return true;
        }
        // PPM bez jedzenia: nic się nie dzieje, ale klik nie stawia bloku w jeżyku.
        return true;
    }

    stats() {
        const states = {};
        for (const hedgehog of this.list) states[hedgehog.state] = (states[hedgehog.state] ?? 0) + 1;
        return { count: this.list.length, states, limit: HEDGEHOG_LIMIT };
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.renderer?.dispose();
        this.list.length = 0;
        this.byHome.clear();
    }

}



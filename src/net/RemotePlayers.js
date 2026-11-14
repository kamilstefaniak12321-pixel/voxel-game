// ------------------------------------------------------------
// INNI GRACZE W ŚWIECIE (0.92.0)
//
// Model gracza (PlayerModel, z jego skórką), animacje z ruchu
// (PlayerAnimator - ten sam co u nas), przedmiot w ręce, machnięcia
// i imię nad głową. Położenie przychodzi z sieci ok. 15 razy na sekundę;
// model płynnie dogania ostatnią pozycję.
// ------------------------------------------------------------

import * as THREE from 'three';
import { PlayerModel } from '../player/PlayerModel.js';
import { PlayerAnimator } from '../player/PlayerAnimator.js';
import { COLOR_LEVEL, lightToBrightness } from '../world/Light.js';
import { atmosphericLightToBrightness } from '../rendering/LightPolicy.js';
import { SHADOW_INDOOR_DARKNESS } from '../config.js';
import { itemExists } from '../items/ItemRegistry.js';
import { loadTextureRegion } from '../rendering/TextureSheets.js';

const DEFAULT_SKIN = 'assets/textures/player/skin.png';

const FOLLOW = 14;          // jak szybko model dogania pozycję z sieci (1/s)
const TELEPORT = 8;         // dalej - przeskok od razu (bloki)

function nameSprite(name) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const font = '600 30px system-ui, sans-serif';
    context.font = font;
    const width = Math.ceil(context.measureText(name).width) + 24;
    canvas.width = width;
    canvas.height = 44;
    context.font = font;
    context.fillStyle = 'rgba(0, 0, 0, 0.45)';
    context.fillRect(0, 0, width, 44);
    context.fillStyle = '#ffffff';
    context.textBaseline = 'middle';
    context.fillText(name, 12, 23);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, fog: false }));
    sprite.scale.set(width / 44 * 0.28, 0.28, 1);
    sprite.renderOrder = 10;
    return sprite;
}

function skinTextureFrom(dataUrl) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    const draw = (image) => {
        canvas.getContext('2d').drawImage(image, 0, 0, 64, 64);
        texture.needsUpdate = true;
    };
    // Bez skórki (albo zła) - domyślna skórka gry.
    const fallback = () => loadTextureRegion(DEFAULT_SKIN).then(draw, () => {});
    if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/png;base64,') && dataUrl.length < 200000) {
        const image = new Image();
        image.onload = () => image.width === 64 && image.height === 64 ? draw(image) : fallback();
        image.onerror = fallback;
        image.src = dataUrl;
    } else fallback();
    return texture;
}

const heldAllowed = (type) => (type && itemExists(type) ? type : null);

export class RemotePlayers {

    constructor(game) {
        this.game = game;
        this.players = new Map();
        this.lightWait = 0;
    }

    add(id, name, skin) {
        this.remove(id);
        const lighting = {
            uModelSky: { value: 1 },
            uModelBlock: { value: new THREE.Vector3() },
            uModelSun: { value: 1 },
            uModelAmbient: { value: 1 },
            uModelDistantShadows: { value: 1 },
            uModelBounce: { value: new THREE.Vector3() }
        };
        const texture = skinTextureFrom(skin);
        const model = new PlayerModel({ texture, lighting });
        model.setStyle(this.game.settings?.get('jointStyle') ?? 'smooth');
        model.object.visible = false;
        const label = nameSprite(name);
        model.object.add(label);
        label.position.set(0, 2.15, 0);
        this.game.scene.add(model.object);
        const entry = { id, name, model, texture, lighting, label, animator: new PlayerAnimator(),
            state: null, pos: new THREE.Vector3(), yaw: 0, pitch: 0, swings: 0, lastSeen: 0, landed: 0, wasGround: true };
        this.players.set(id, entry);
        return entry;
    }

    remove(id) {
        const entry = this.players.get(id);
        if (!entry) return;
        entry.model.dispose();
        entry.label.material.map.dispose();
        entry.label.material.dispose();
        entry.texture.dispose();
        this.players.delete(id);
    }

    // Stan z sieci (unpackPlayer).
    receive(id, state) {
        const entry = this.players.get(id);
        if (!entry || !state) return;
        if (!entry.state || entry.pos.distanceTo(new THREE.Vector3(state.x, state.y, state.z)) > TELEPORT) {
            entry.pos.set(state.x, state.y, state.z);
            entry.yaw = state.yaw;
        }
        if (entry.state && state.swings !== entry.swings) entry.animator.swing();
        entry.swings = state.swings;
        if (state.onGround && !entry.wasGround && (entry.state?.vy ?? 0) < -6) entry.landed = -(entry.state.vy);
        entry.wasGround = state.onGround;
        entry.state = state;
        entry.model.setHeldBlock(state.sleeping ? null : heldAllowed(state.held));
        entry.model.object.visible = true;
    }

    update(dt) {
        const rate = 1 - Math.exp(-FOLLOW * dt);
        this.lightWait -= dt;
        const relight = this.lightWait <= 0;
        if (relight) this.lightWait = 0.2;
        for (const entry of this.players.values()) {
            const state = entry.state;
            if (!state) continue;
            // Przewidujemy ruch do następnej wiadomości, potem doganiamy.
            entry.pos.x += (state.x + state.vx * 0.05 - entry.pos.x) * rate;
            entry.pos.y += (state.y - entry.pos.y) * rate;
            entry.pos.z += (state.z + state.vz * 0.05 - entry.pos.z) * rate;
            let turn = state.yaw - entry.yaw;
            turn -= Math.round(turn / (Math.PI * 2)) * Math.PI * 2;
            entry.yaw += turn * rate;
            entry.pitch += (state.pitch - entry.pitch) * rate;
            // Śpiący leży nieruchomo, tam gdzie się położył.
            const lying = Boolean(state.sleeping);
            if (lying) { entry.pos.set(state.x, state.y, state.z); entry.yaw = state.yaw; }
            const pose = entry.animator.update(dt, lying ? { vx: 0, vy: 0, vz: 0, onGround: true, yaw: entry.yaw, pitch: 0, landed: 0 } : {
                vx: state.vx, vy: state.vy, vz: state.vz, onGround: state.onGround, crouching: state.crouching,
                sprinting: state.sprinting, flying: state.flying, swimming: state.swimming,
                yaw: entry.yaw, pitch: entry.pitch, landed: entry.landed
            });
            entry.landed = 0;
            entry.model.setPose(pose);
            entry.model.place(entry.pos, lying ? entry.yaw : entry.animator.bodyYaw, 0, lying);
            // Leżący model jest obrócony: jego -z to góra świata.
            entry.label.position.set(0, lying ? 0.9 : state.crouching ? 1.95 : 2.15, lying ? -0.7 : 0);
            if (relight) this.updateLight(entry);
        }
    }

    updateLight(entry) {
        const game = this.game;
        const light = game.world.getLight(Math.floor(entry.pos.x), Math.floor(entry.pos.y + 1.2), Math.floor(entry.pos.z));
        const brightness = game.sky?.atmosphere ? atmosphericLightToBrightness : lightToBrightness;
        const sky = brightness(light.sky);
        const strongest = Math.max(light.red, light.green, light.blue);
        const lamp = strongest > 0 ? brightness(COLOR_LEVEL[strongest]) / strongest : 0;
        entry.lighting.uModelSky.value = sky;
        entry.lighting.uModelBlock.value.set(light.red * lamp, light.green * lamp, light.blue * lamp);
        const ambientStrength = game.shadows?.active ? (game.shadows.ambientStrength ?? 0) : 0;
        entry.lighting.uModelSun.value = sky ** 2.2;
        entry.lighting.uModelAmbient.value = sky ** (2.2 + SHADOW_INDOOR_DARKNESS * ambientStrength);
    }

    // Pozycje graczy (kto jest najbliżej chunka - wzrost roślin).
    positions() {
        return [...this.players.values()].filter((entry) => entry.state).map((entry) => entry.state);
    }

    dispose() {
        for (const id of [...this.players.keys()]) this.remove(id);
    }
}

import * as THREE from 'three';
import { SHADOW_INDOOR_DARKNESS } from '../config.js';
import { lightToBrightness, COLOR_LEVEL } from '../world/Light.js';
import { blockAtlasTexture, getAtlasUV } from './TextureAtlas.js';
import { atmosphericLightToBrightness } from './LightPolicy.js';
import { createModelMaterial } from './ModelMaterial.js';
import { SURFACE_PROFILES } from './SurfaceProfiles.js';
import { HEDGEHOG_PARTS } from './HedgehogModelData.js';

// ------------------------------------------------------------
// WYGLĄD JEŻYKA (1.18.0)
//
// Model Kamila (tools/wzorce/jezyk/jezyk.bbmodel -> HedgehogModelData.js):
// sześć części - korpus, pyszczek i cztery łapki - na kościach z pliku.
// Animacje z pliku są zapisane jako wzory (w pliku to gęsto wypieczone
// sinusy; wartości w pikselach modelu, 1 px = 1/16 bloku):
//   idle  (2,4 s) - oddech: korpus rośnie o 1,2%, pyszczek o 0,035 px,
//   walk  (0,8 s) - łapki na przemian +-25 stopni, uniesienie stawianej
//                   łapki 0,18 px, korpus podskakuje 0,08 px i kołysze
//                   się o 0,8 stopnia,
//   sniff (1,8 s) - korpus unosi przód o 1,8 stopnia i rozgląda się +-3
//                   stopnie, pyszczek krąży (0,045 px w pionie, 0,16 px
//                   w przód) cztery razy.
// Chód jest przypięty do przebytej drogi (łapki nie ślizgają się).
// Kulka (zwinięcie i sen) nie ma animacji w pliku - jest złożona z tych
// samych części: łapki i pyszczek chowają się pod korpus, korpus siada
// na ziemi i lekko się zaokrągla.
// ------------------------------------------------------------

const PX = 1 / 16;
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

// Droga jednego pełnego cyklu chodu (bloki): 0,8 s przy 0,7 bloku/s.
export const HEDGEHOG_STRIDE = 0.56;

const LEGS = [['legFrontRight', -1], ['legBackRight', 1], ['legBackLeft', -1], ['legFrontLeft', 1]];

// Pozy części w danej chwili - liczby, bez three.js (sprawdza je test).
//   body: { y, rotX, rotY, rotZ, scaleX, scaleY, scaleZ },
//   nose: { y, z, scale }, legs: [{ rotX, y, scaleY }] w kolejności LEGS.
export function hedgehogPose(hedgehog, out = { body: {}, nose: {}, legs: [{}, {}, {}, {}] }) {

    const t = hedgehog.clock, c = hedgehog.curl;
    const smooth = c * c * (3 - 2 * c);
    const body = out.body, nose = out.nose;

    body.y = 0; body.rotX = 0; body.rotY = 0; body.rotZ = 0;
    body.scaleX = 1; body.scaleY = 1; body.scaleZ = 1;
    nose.y = 0; nose.z = 0; nose.scale = 1;
    for (const leg of out.legs) { leg.rotX = 0; leg.y = 0; leg.scaleY = 1; }

    if (hedgehog.moving) {
        const phase = hedgehog.stride / HEDGEHOG_STRIDE * TAU;
        body.y = 0.04 * PX * (1 - Math.cos(2 * phase));
        body.rotZ = 0.8 * DEG * Math.sin(phase);
        LEGS.forEach(([, side], i) => {
            const swing = Math.sin(phase) * side;
            out.legs[i].rotX = 25 * DEG * swing;
            out.legs[i].y = (0.1 + 0.18 * Math.max(0, -swing)) * PX;
        });
    }
    else if (hedgehog.state === 'sniff' || hedgehog.state === 'watch' || hedgehog.state === 'beg') {
        const wave = (t % 0.45) / 0.45 * TAU;
        body.rotX = -1.8 * DEG;
        body.rotY = 3 * DEG * Math.sin(t / 0.8 * TAU);
        nose.y = 0.045 * PX * Math.sin(wave);
        nose.z = 0.08 * PX * (1 - Math.cos(wave));
    }
    else if (hedgehog.state === 'eat') {
        const chew = Math.sin(t * 16);
        body.rotX = 4 * DEG;
        nose.y = -0.05 * PX * Math.max(0, chew);
        nose.z = 0.05 * PX * chew;
    }

    // Oddech (zawsze; we śnie wolniejszy i głębszy).
    const asleep = hedgehog.state === 'sleep';
    const breath = Math.sin(t / (asleep ? 3.4 : 2.4) * TAU);
    body.scaleY *= 1 + (asleep ? 0.025 : 0.012) * breath;
    nose.z += 0.035 * PX * breath * (1 - smooth);

    // Kulka.
    if (smooth > 0) {
        body.y -= 1.8 * PX * smooth;
        body.scaleX *= 1 + 0.08 * smooth;
        body.scaleY *= 1 + 0.05 * smooth;
        body.scaleZ *= 1 - 0.1 * smooth;
        body.rotX *= 1 - smooth; body.rotY *= 1 - smooth;
        nose.scale = 1 - 0.9 * smooth;
        nose.z -= 1.1 * PX * smooth;
        for (const leg of out.legs) { leg.scaleY = 1 - 0.96 * smooth; leg.rotX *= 1 - smooth; }
    }

    return out;

}


export class HedgehogRenderer {

    constructor(game) {
        this.game = game;
        this.views = new Map();
        this.geometries = new Map();
        this.pose = { body: {}, nose: {}, legs: [{}, {}, {}, {}] };
        this.clock = 0;
    }

    // Geometria części z UV w kafelku wariantu, przesunięta do swojej kości.
    geometry(part, variant) {
        const key = `${part}:${variant}`;
        if (!this.geometries.has(key)) {
            const data = HEDGEHOG_PARTS[part];
            const tile = getAtlasUV(`mob_hedgehog_${variant}`, 0);
            const count = data.positions.length / 3;
            const position = new Float32Array(data.positions.length), uv = new Float32Array(count * 2);
            const profile = new Uint8Array(count * 2);
            for (let i = 0; i < count; i++) {
                position[i * 3] = data.positions[i * 3] - data.pivot[0];
                position[i * 3 + 1] = data.positions[i * 3 + 1] - data.pivot[1];
                position[i * 3 + 2] = data.positions[i * 3 + 2] - data.pivot[2];
                uv[i * 2] = tile.uMin + data.uvs[i * 2] * (tile.uMax - tile.uMin);
                uv[i * 2 + 1] = tile.vMax - data.uvs[i * 2 + 1] * (tile.vMax - tile.vMin);
                profile[i * 2] = SURFACE_PROFILES.wood[0]; profile[i * 2 + 1] = SURFACE_PROFILES.wood[1];
            }
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
            geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
            geometry.setAttribute('surfaceProfile', new THREE.BufferAttribute(profile, 2));
            geometry.setIndex(data.indices);
            geometry.computeVertexNormals();
            geometry.computeBoundingSphere();
            this.geometries.set(key, geometry);
        }
        return this.geometries.get(key);
    }

    createView(hedgehog) {
        const lighting = {
            uModelSky: { value: 1 }, uModelBlock: { value: new THREE.Vector3() }, uModelSun: { value: 1 },
            uModelAmbient: { value: 1 }, uModelDistantShadows: { value: 1 }, uModelBounce: { value: new THREE.Vector3() }
        };
        const material = createModelMaterial({ map: blockAtlasTexture, lighting });
        const root = new THREE.Group();
        root.name = 'Jeżyk';
        const bone = (part, parent, relative = [0, 0, 0]) => {
            const pivot = HEDGEHOG_PARTS[part].pivot;
            const group = new THREE.Group();
            group.position.set(pivot[0] - relative[0], pivot[1] - relative[1], pivot[2] - relative[2]);
            group.add(new THREE.Mesh(this.geometry(part, hedgehog.variant), material));
            parent.add(group);
            return group;
        };
        const body = bone('body', root);
        const nose = bone('nose', body, HEDGEHOG_PARTS.body.pivot);
        const legs = LEGS.map(([part]) => bone(part, root));
        this.game.scene.add(root);
        const view = { root, body, nose, legs, material, lighting, lightTime: 0 };
        this.views.set(hedgehog.id, view);
        return view;
    }

    removeView(id) {
        const view = this.views.get(id);
        if (!view) return;
        view.root.removeFromParent();
        view.material.dispose();
        this.views.delete(id);
    }

    // Ustawia modele według listy jeży (po kroku zachowania).
    sync(hedgehogs, dt) {
        this.clock += dt;
        const alive = new Set();
        for (const hedgehog of hedgehogs) {
            alive.add(hedgehog.id);
            const view = this.views.get(hedgehog.id) ?? this.createView(hedgehog);
            const pose = hedgehogPose(hedgehog, this.pose);
            const P = HEDGEHOG_PARTS;
            view.root.position.set(hedgehog.x, hedgehog.y, hedgehog.z);
            view.root.rotation.y = hedgehog.yaw;
            view.body.position.y = P.body.pivot[1] + pose.body.y;
            view.body.rotation.set(pose.body.rotX, pose.body.rotY, pose.body.rotZ);
            view.body.scale.set(pose.body.scaleX, pose.body.scaleY, pose.body.scaleZ);
            view.nose.position.y = P.nose.pivot[1] - P.body.pivot[1] + pose.nose.y;
            view.nose.position.z = P.nose.pivot[2] - P.body.pivot[2] + pose.nose.z;
            view.nose.scale.setScalar(pose.nose.scale);
            view.legs.forEach((leg, i) => {
                leg.rotation.x = pose.legs[i].rotX;
                leg.position.y = P[LEGS[i][0]].pivot[1] + pose.legs[i].y + pose.body.y * 0.5;
                leg.scale.y = pose.legs[i].scaleY;
            });
            if (this.clock >= view.lightTime) {
                view.lightTime = this.clock + 0.25;
                this.updateLight(view, hedgehog);
            }
        }
        for (const id of [...this.views.keys()]) if (!alive.has(id)) this.removeView(id);
    }

    updateLight(view, hedgehog) {
        const game = this.game;
        const light = game.world.getLight(Math.floor(hedgehog.x), Math.floor(hedgehog.y + 0.2), Math.floor(hedgehog.z));
        const brightness = game.sky?.atmosphere ? atmosphericLightToBrightness : lightToBrightness;
        const sky = brightness(light.sky), strongest = Math.max(light.red, light.green, light.blue);
        const lamp = strongest > 0 ? brightness(COLOR_LEVEL[strongest]) / strongest : 0;
        view.lighting.uModelSky.value = sky;
        view.lighting.uModelBlock.value.set(light.red * lamp, light.green * lamp, light.blue * lamp);
        view.lighting.uModelSun.value = sky ** 2.2;
        view.lighting.uModelAmbient.value = sky ** (2.2 + SHADOW_INDOOR_DARKNESS * (game.shadows?.ambientStrength ?? 0));
    }

    dispose() {
        for (const id of [...this.views.keys()]) this.removeView(id);
        for (const geometry of this.geometries.values()) geometry.dispose();
        this.geometries.clear();
    }

}

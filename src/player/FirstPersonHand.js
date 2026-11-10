import * as THREE from 'three';

import { getBlockDefinition } from '../blocks/BlockRegistry.js';
import { isItemType } from '../items/ItemRegistry.js';
import { getItemModel as getFruitItemModel } from '../rendering/ItemGeometry.js';
import { blockAtlasTexture } from '../rendering/TextureAtlas.js';
import { createModelMaterial } from '../rendering/ModelMaterial.js';
import { setPotatoDefine } from '../rendering/BlockRenderData.js';
import { VIEW_BOB_STEPS } from '../config.js';
import { skinTexture } from './skin.js';
import { buildArmGeometry, buildBlockGeometry } from './PlayerModel.js';
import { getTorchInfo } from '../blocks/torches.js';
import { createTorchModel, disposeTorchModel } from '../rendering/TorchMaterial.js';

// ------------------------------------------------------------
// RĘKA W WIDOKU Z OCZU
//
// W prawym dolnym rogu ekranu: blok albo przedmiot, który trzymasz
// (jak w Minecrafcie), a z pustą ręką - sama ręka ze skórki gracza
// (z rękawem, jeśli skórka go ma).
//
// Ręka ma własną scenę i kamerę, rysowaną na samym końcu, na wyczyszczonej
// głębi - nigdy nie wchodzi w ścianę. Kamera ręki stoi tam, gdzie kamera
// świata (ten sam obrót), a ręka jest przed nią: oświetla się więc jak
// model gracza (ModelMaterial.js - światło w miejscu gracza, słońce,
// lampa w ręce, meteoryt).
//
// Animacje (wszystko w układzie kamery):
//   - wyjęcie: po zmianie przedmiotu ręka chowa się w dół i wraca,
//   - machnięcie: przy kopaniu i stawianiu (swing),
//   - kołysanie przy chodzeniu (te same kroki co kołysanie kamery
//     w Game.js - bob), mocniej przy biegu,
//   - spóźnianie się za obrotem kamery (ręka "płynie" za wzrokiem),
//   - oddech: lekkie unoszenie się, gdy stoisz.
// ------------------------------------------------------------

// Pole widzenia kamery ręki (stałe - nie zależy od ustawień i biegu).
const HAND_FOV = 70;

// Ile trwa machnięcie i wyjęcie (s). Przy kopaniu machnięcie trwa tyle,
// co jedno uderzenie (MINING_HIT_SECONDS), więc kolejne machnięcia
// łączą się w jeden płynny ruch.
const SWING_SECONDS = 0.3;
const EQUIP_SECONDS = 0.22;

// Prędkość chodzenia (bloki/s), przy której kołysanie jest "pełne".
const WALK_SPEED = 4.3;


// Ułożenie (w układzie kamery: +X w prawo, +Y w górę, -Z do przodu).
// Dobrane dla ekranu 16:9 - na węższym ręka przesuwa się bliżej środka
// (aspectScale), żeby nie uciekła za prawą krawędź.

export const POSES = {

    // Pusta ręka: pięść z prawej, trochę poniżej środka; ręka idzie
    // w dół, w prawo i do tyłu (bark poza ekranem), obrócona tak, że
    // widać wierzch i bok (twist). Machnięcie (swing): cios do przodu.
    arm: {
        position: [0.36, -0.18, -0.75], toShoulder: [0.3, -0.5, 0.8], twist: -1, scale: 1,
        swing: { move: [-0.26, 0.1, -0.4], turn: [0.3, 0.4, -0.12] }
    },

    // Blok: sześcian obrócony tak, że widać dwa boki i wierzch.
    block: { position: [0.6, -0.36, -0.9], rotation: [0.3, 0.35, 0], scale: 0.3 },

    // Przedmiot (płaski obrazek): obrazek idzie w głąb ekranu, więc
    // trzonek jest w prawym dolnym rogu, a głowica wyżej, bliżej środka.
    item: { position: [0.45, -0.3, -0.75], rotation: [0, 2.07, 0.4], scale: 0.5 },

    // Bryłka owocu: widać bok i górę, bez obracania jak kartka.
    fruit: { position: [0.48, -0.3, -0.78], rotation: [0.2, -0.45, 0.12], scale: 0.38 },

    // Roślina: dwie skrzyżowane płaszczyzny.
    plant: { position: [0.55, -0.34, -0.8], rotation: [0.08, -0.4, 0.12], scale: 0.4 },

    // Chwyt za dolną część trzonka; płomień pozostaje nad dłonią.
    torch: { position: [0.43, -0.4, -0.75], rotation: [-0.12, -0.25, -0.12], scale: 0.75 }

};

// Machnięcie blokiem i przedmiotem: szeroki łuk - w górę i do środka
// ekranu (tam, gdzie celujesz), w dół na cel i z powrotem, z obrotem
// "na cios" (narzędzie uderza głowicą).
const SWING = { move: [-0.36, 0.16, -0.24], turn: [-1.25, 0.5, -0.4] };

const WIDE_ASPECT = 16 / 9;


function smooth(t) {

    return t * t * (3 - 2 * t);

}


export class FirstPersonHand {

    constructor(sky) {

        this.scene = new THREE.Scene();

        this.camera = new THREE.PerspectiveCamera(HAND_FOV, 1, 0.01, 10);

        this.scene.add(this.camera);

        sky.attachLights(this.scene);


        // Uchwyt: przesuwany przy animacjach; w nim ręka albo przedmiot.

        this.root = new THREE.Group();

        this.camera.add(this.root);


        this.armMaterials = [
            createModelMaterial({ map: skinTexture }),
            createModelMaterial({ map: skinTexture, alphaTest: 0.5 })
        ];

        this.arm = new THREE.Mesh(buildArmGeometry(), this.armMaterials);

        this.root.add(this.arm);


        this.heldMaterial = createModelMaterial({ map: blockAtlasTexture });
        this.heldCutoutMaterial = createModelMaterial({ map: blockAtlasTexture, alphaTest: 0.5, vertexColors: true });

        this.held = new THREE.Mesh(new THREE.BufferGeometry(), this.heldMaterial);

        this.root.add(this.held);
        this.torch = null;
        this.lowDetail = false;


        this.type = undefined;

        this.shown = null;          // co teraz widać (zmienia się w połowie wyjęcia)

        this.pose = POSES.arm;


        // Animacje.

        this.swingTime = Infinity;

        this.swingSeconds = SWING_SECONDS;

        this.equip = 1;             // 0 = schowana, 1 = wyjęta

        this.equipping = false;

        this.phase = 0;             // kroki (wspólne z kołysaniem kamery)

        this.amount = 0;            // jak mocno się kołysze (0 = stoi)

        this.time = 0;

        this.lagYaw = null;
        this.lagPitch = 0;

        this.aspectScale = 1;


        // Kołysanie dla kamery świata (Game.render).

        this.bob = { phase: 0, amount: 0 };

        this.setHeld(null);

        this.place();

    }


    // Blok albo przedmiot w ręce (nazwa) albo null - pusta ręka.

    setHeld(type) {

        if (type === this.type) {
            return;
        }

        const first = this.type === undefined;

        this.type = type;

        if (first) {

            this.show(type);

            return;

        }

        // Zmiana: ręka chowa się i wraca z nowym przedmiotem.

        this.equipping = true;

    }


    show(type) {

        this.shown = type;

        this.held.geometry.dispose();

        if (this.torch) {
            disposeTorchModel(this.torch);
            this.torch = null;
        }

        const block = type && !isItemType(type) ? getBlockDefinition(type) : null;

        const model = block?.model ?? 'cube';

        if (!type) {

            this.held.geometry = new THREE.BufferGeometry();

            this.held.visible = false;

            this.arm.visible = true;

            this.pose = POSES.arm;

            return;

        }

        const torch = getTorchInfo(type);
        if (torch) {
            this.held.geometry = new THREE.BufferGeometry();
            this.held.visible = this.arm.visible = false;
            this.torch = createTorchModel(torch.colorKey, 'down');
            this.root.add(this.torch);
            this.pose = POSES.torch;
            this.setLowDetail(this.lowDetail);
            return;
        }

        this.held.geometry = buildBlockGeometry(type);

        // Płaski obrazek: przodem do kamery (w modelu gracza stoi ukośnie),
        // a jego tył - jak tył prawdziwej kartki: odbity w poziomie (w modelu
        // gracza obie strony są czytelne). Tak ułożony przedmiot (POSES.item)
        // trzymasz jak w Minecrafcie: głowica / ostrze idzie w głąb ekranu
        // i do środka, trzonek - do prawego dolnego rogu.

        const fruit = Boolean(getFruitItemModel(type));
        const flat = (isItemType(type) && !fruit) || model === 'flat';

        // Gruby przedmiot (0.84.0) jest już w płaszczyźnie obrazka, a jego
        // tył - odbity jak prawdziwy przedmiot; dawny płaski - obracamy.

        if (flat && !this.held.geometry.userData.extruded) {
            const geometry = this.held.geometry;
            geometry.rotateY(-Math.PI / 4);

            const uv = geometry.attributes.uv;

            let uMin = Infinity;
            let uMax = -Infinity;

            for (let i = 4; i < 8; i++) {
                uMin = Math.min(uMin, uv.getX(i));
                uMax = Math.max(uMax, uv.getX(i));
            }

            for (let i = 4; i < 8; i++) {
                uv.setX(i, uMin + uMax - uv.getX(i));
            }

        }

        this.held.visible = true;

        this.arm.visible = false;

        this.pose =
            fruit ? POSES.fruit : flat ? POSES.item :
            model === 'cross' || model === 'riverPlant' ? POSES.plant :
            POSES.block;

        this.held.material = block && (model === 'cube')
            ? this.heldMaterial
            : this.heldCutoutMaterial;

        this.heldMaterial.userData.uniforms.uModelGlow.value = (block?.light ?? 0) / 15;

    }


    // Machnięcie (kopanie, stawianie). seconds - ile trwa (kopanie:
    // tyle co jedno uderzenie).

    swing(seconds = SWING_SECONDS) {

        this.swingTime = 0;

        this.swingSeconds = seconds;

    }


    // Co klatkę. player - Player (prędkość, czy na ziemi...).

    update(dt, player) {

        this.time += dt;


        // Wyjęcie / schowanie.

        if (this.equipping) {

            this.equip = Math.max(0, this.equip - dt / EQUIP_SECONDS * 2);

            if (this.equip === 0) {

                this.show(this.type);

                this.equipping = false;

            }

        }
        else if (this.equip < 1) {

            this.equip = Math.min(1, this.equip + dt / EQUIP_SECONDS * 2);

        }


        this.swingTime += dt;


        // Kroki: kołysanie tylko przy chodzeniu po ziemi.

        const speed = Math.hypot(player.vel.x, player.vel.z);

        const walking = player.onGround && !player.flying && !player.swimming;

        const target = walking ? Math.min(1.5, speed / WALK_SPEED) : 0;

        this.amount += (target - this.amount) * Math.min(1, dt * 8);

        if (walking) {
            this.phase += speed * dt * Math.PI * VIEW_BOB_STEPS;
        }

        this.bob.phase = this.phase;
        this.bob.amount = this.amount;


        // Ręka spóźnia się za obrotem kamery.

        if (this.lagYaw === null) {
            this.lagYaw = player.yaw;
            this.lagPitch = player.pitch;
        }

        let dyaw = player.yaw - this.lagYaw;

        dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));

        const follow = Math.min(1, dt * 14);

        this.lagYaw += dyaw * follow;
        this.lagPitch += (player.pitch - this.lagPitch) * follow;

        this.lag = {
            yaw: Math.max(-0.5, Math.min(0.5, dyaw)),
            pitch: Math.max(-0.5, Math.min(0.5, player.pitch - this.lagPitch))
        };

        this.place();

    }


    // Ustawia rękę / przedmiot według pozy i animacji.

    place() {

        const pose = this.pose;

        const root = this.root;

        const [px, py, pz] = pose.position;

        let x = px;
        let y = py;
        let z = pz;

        let rx = 0;
        let ry = 0;
        let rz = 0;


        // Wyjęcie: w dół, poza ekran.

        y -= (1 - smooth(this.equip)) * 0.6;


        // Kołysanie przy chodzeniu (ósemka) i oddech.

        const a = this.amount;

        x += Math.sin(this.phase) * 0.022 * a;
        y -= Math.abs(Math.cos(this.phase)) * 0.03 * a;
        rz += Math.sin(this.phase) * 0.03 * a;

        y += Math.sin(this.time * 1.6) * 0.004 * (1 - Math.min(1, a));


        // Spóźnianie się za wzrokiem.

        if (this.lag) {

            x -= this.lag.yaw * 0.12;
            y += this.lag.pitch * 0.1;

            ry += this.lag.yaw * 0.35;
            rx -= this.lag.pitch * 0.3;

        }


        // Machnięcie (jak w Minecrafcie): do środka, w górę i do przodu,
        // obrót w dół.

        if (this.swingTime < this.swingSeconds) {

            const t = this.swingTime / this.swingSeconds;

            const s = Math.sqrt(t);

            const { move, turn } = pose.swing ?? SWING;

            x += move[0] * Math.sin(s * Math.PI);
            y += move[1] * Math.sin(s * Math.PI * 2);
            z += move[2] * Math.sin(t * Math.PI);

            rx += turn[0] * Math.sin(s * Math.PI);
            ry += turn[1] * Math.sin(t * t * Math.PI);
            rz += turn[2] * Math.sin(s * Math.PI);

        }


        root.position.set(x * this.aspectScale, y, z);

        root.rotation.set(rx, ry, rz, 'YXZ');


        // Ręka: dłoń w uchwycie, oś ręki w stronę barku (toShoulder),
        // obrócona wokół własnej osi (twist) - widać wierzch i bok.

        if (this.arm.visible) {

            const axis = new THREE.Vector3(...POSES.arm.toShoulder).normalize();

            this.arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);

            this.arm.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), POSES.arm.twist));

            this.arm.scale.setScalar(POSES.arm.scale);

        }

        if (this.held.visible) {

            this.held.rotation.set(...pose.rotation);

            this.held.scale.setScalar(pose.scale);

        }

        if (this.torch) {
            this.torch.rotation.set(...pose.rotation);
            this.torch.scale.setScalar(pose.scale);
        }

    }


    // Rysuje rękę na wierzchu obrazu (po świecie): kamera ręki tam, gdzie
    // kamera świata (z kołysaniem i wstrząsem).

    render(renderer, worldCamera) {

        this.camera.position.copy(worldCamera.position);

        this.camera.quaternion.copy(worldCamera.quaternion);

        this.camera.updateMatrixWorld();

        renderer.clearDepth();

        renderer.render(this.scene, this.camera);

    }


    resize(aspect) {

        this.camera.aspect = aspect;

        this.aspectScale = Math.min(1, aspect / WIDE_ASPECT);

        this.camera.updateProjectionMatrix();

    }


    // Rękaw (wierzchnia warstwa skórki) - jak ustawienie "warstwa skórki".

    setOverlay(on) {

        this.armMaterials[1].visible = on;

    }


    setLowDetail(on) {

        this.lowDetail = Boolean(on);
        const materials = [...this.armMaterials, this.heldMaterial, this.heldCutoutMaterial];
        this.torch?.traverse(object => {
            if (object.isMesh) materials.push(...(Array.isArray(object.material) ? object.material : [object.material]));
        });
        setPotatoDefine(materials, this.lowDetail);

    }


    dispose() {

        if (this.torch) {
            disposeTorchModel(this.torch);
            this.torch = null;
        }

        this.arm.geometry.dispose();

        this.held.geometry.dispose();

        for (const material of [...this.armMaterials, this.heldMaterial, this.heldCutoutMaterial]) {
            material.dispose();
        }

    }

}

import * as THREE from 'three';

import { getBlockDefinition } from '../blocks/BlockRegistry.js';

import { atlasReady, loadPackImage } from '../rendering/TextureAtlas.js';

// ------------------------------------------------------------
// PĘKNIĘCIA KOPANEGO BLOKU (tryb przygody)
//
// Na blok, który kopiesz, kładziemy odrobinę większy sześcian z teksturą
// pęknięć - 10 etapów w pasku assets/textures/blocks/cracks.png
// (rysuje je tools/pekniecia.py). Etap = jak daleko jest kopanie (0-1).
// Tekstura to mnożnik (jak w Minecrafcie): kolor bloku x 2 x piksel -
// szary 128 nic nie zmienia, rysy przyciemniają, jasne brzegi rozjaśniają.
// Dzięki temu rysy pasują do każdego bloku i do światła (w nocy też są
// ciemne). Roślin (znikają od razu) i płaskich dekoracji nie pękamy.
// ------------------------------------------------------------

const STAGES = 10;

const texture = new THREE.TextureLoader().load(
    new URL('../../assets/textures/blocks/cracks.png', import.meta.url).href
);

texture.magFilter = THREE.NearestFilter;
texture.minFilter = THREE.NearestFilter;
texture.generateMipmaps = false;
texture.colorSpace = THREE.SRGBColorSpace;
texture.repeat.set(1 / STAGES, 1);

// Pęknięcia z paczki tekstur (TexturePacks.js: pekniecia.png) - zamiast
// oryginalnych, gdy paczka je ma.

atlasReady.then(async ({ extras }) => {

    if (!extras?.cracks) {
        return;
    }

    try {
        texture.image = await loadPackImage(extras.cracks);
        texture.needsUpdate = true;
    }
    catch (error) {
        console.warn('Paczka tekstur - pęknięcia:', error);
    }

}, () => {});


export class BlockCracks {

    constructor(scene) {

        // Mieszanie: wynik = tekstura x obraz + obraz x tekstura (2 x mnożenie).
        // Bez mgły - mgła zmieniałaby szary "nic nie zmieniaj".

        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            depthWrite: false,
            fog: false,
            blending: THREE.CustomBlending,
            blendEquation: THREE.AddEquation,
            blendSrc: THREE.DstColorFactor,
            blendDst: THREE.SrcColorFactor,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2
        });

        this.mesh = new THREE.Mesh(new THREE.BoxGeometry(1.004, 1.004, 1.004), material);

        this.mesh.visible = false;

        // Po zwykłych blokach (przezroczystość).
        this.mesh.renderOrder = 2;

        scene.add(this.mesh);

        this.stage = -1;

    }


    // block - { x, y, z, type } albo null (nic nie kopiemy),
    // progress - 0-1.

    update(block, progress) {

        const model = block ? getBlockDefinition(block.type)?.model ?? 'cube' : null;

        if (!block || progress <= 0 || (model !== 'cube' && model !== 'leaves')) {

            this.mesh.visible = false;

            this.stage = -1;

            return;

        }


        const stage = Math.min(STAGES - 1, Math.floor(progress * STAGES));

        if (stage !== this.stage) {

            this.stage = stage;

            texture.offset.set(stage / STAGES, 0);

        }

        this.mesh.position.set(block.x + 0.5, block.y + 0.5, block.z + 0.5);

        this.mesh.visible = true;

    }


    dispose() {

        this.mesh.removeFromParent();

        this.mesh.geometry.dispose();

        this.mesh.material.dispose();

    }

}

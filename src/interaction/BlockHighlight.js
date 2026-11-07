import * as THREE from 'three';

import { getBlockDefinition } from '../blocks/BlockRegistry.js';
import { riverPlantBounds } from './RiverPlantBounds.js';
import { spritePlantBounds } from './PlantBounds.js';
import { getTorchBounds } from '../rendering/TorchGeometry.js';


// Ramka płaskiej dekoracji (model 'flat'): wzdłuż której osi cienka
// i czy przy dalszej ścianie komórki.

const FLAT_THICKNESS = 0.08;

const FLAT_BOXES = {
    down: { axis: 1, far: false },
    north: { axis: 2, far: false },
    south: { axis: 2, far: true },
    east: { axis: 0, far: true },
    west: { axis: 0, far: false }
};


export class BlockHighlight {

    constructor(scene) {

        const boxGeometry =
            new THREE.BoxGeometry(
                1.005,
                1.005,
                1.005
            );


        const edgesGeometry =
            new THREE.EdgesGeometry(
                boxGeometry
            );


        const material =
            new THREE.LineBasicMaterial({
                color: 0xffffff
            });


        this.mesh =
            new THREE.LineSegments(
                edgesGeometry,
                material
            );


        this.mesh.visible = false;


        scene.add(this.mesh);

    }


    update(hit) {

        if (!hit || !hit.hit) {

            this.mesh.visible = false;

            return;

        }


        this.mesh.visible = true;


        // Roślina: węższa (i zwykle niższa) ramka niż pełny blok.
        // Płaska dekoracja: cienka ramka przy jej oparciu.

        const definition = getBlockDefinition(hit.block.type);

        const plant = definition?.plant;

        const height = plant ? Math.min(1, plant.height) : 1;

        const width = plant ? 0.8 : 1;

        const size = [width, height, width];

        const center = [0.5, height / 2, 0.5];

        const river = definition?.riverPlant;
        const torch = definition?.torch;
        const sprite = definition?.plant?.sprite
            ? spritePlantBounds(definition.id, hit.block.x, hit.block.y, hit.block.z)
            : null;
        if (torch || river || sprite) {
            const bounds = torch ? getTorchBounds(torch.attach) : sprite ?? riverPlantBounds(river, hit.block.x, hit.block.y, hit.block.z);
            for (let axis = 0; axis < 3; axis++) {
                size[axis] = Math.max(0.01, bounds.max[axis] - bounds.min[axis]);
                center[axis] = (bounds.min[axis] + bounds.max[axis]) / 2;
            }
        }

        const flat = FLAT_BOXES[definition?.flat?.attach];

        if (definition?.model === 'structure' && !torch) { size[1] = .5; center[1] = .25; }

        // Skrzynia: 14 x 14 pikseli, 14 wysokości.
        if (definition?.model === 'chest') {
            size[0] = size[2] = 14 / 16; size[1] = 14 / 16; center[1] = 7 / 16;
        }

        if (flat && definition?.model !== 'structure') {

            size[flat.axis] = FLAT_THICKNESS;

            center[flat.axis] = flat.far ? 1 - FLAT_THICKNESS / 2 : FLAT_THICKNESS / 2;

        }

        this.mesh.scale.set(...size);


        this.mesh.position.set(

            hit.block.x + center[0],

            hit.block.y + center[1],

            hit.block.z + center[2]

        );

    }


    // Zwalnia pamięć ramki podświetlenia.

    dispose() {

        this.mesh.removeFromParent();

        this.mesh.geometry.dispose();
        this.mesh.material.dispose();

    }

}

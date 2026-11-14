import * as THREE from 'three';

import { getBlockDefinition } from '../blocks/BlockRegistry.js';
import { riverPlantBounds } from './RiverPlantBounds.js';
import { spritePlantBounds } from './PlantBounds.js';
import { getTorchBounds } from '../rendering/TorchGeometry.js';


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


        // Ramka pokazuje dokładnie to, w co trafia celownik: kształt
        // z interaction/BlockBounds.js (hit.bounds - cienki mech, kępka
        // trawy, półblok, skrzynia) albo model rośliny czy pochodni.
        // Bez żadnego z nich - pełny blok.

        const definition = getBlockDefinition(hit.block.type);

        const size = [1, 1, 1];

        const center = [0.5, 0.5, 0.5];

        const river = definition?.riverPlant;
        const torch = definition?.torch;
        const sprite = definition?.plant?.sprite
            ? spritePlantBounds(definition.id, hit.block.x, hit.block.y, hit.block.z)
            : null;

        let box = hit.bounds ?? null;

        if (!box && (torch || river || sprite)) {
            const bounds = torch ? getTorchBounds(torch.attach) : sprite ?? riverPlantBounds(river, hit.block.x, hit.block.y, hit.block.z);
            box = [...bounds.min, ...bounds.max];
        }

        if (box) {
            for (let axis = 0; axis < 3; axis++) {
                size[axis] = Math.max(0.01, box[axis + 3] - box[axis]);
                center[axis] = (box[axis] + box[axis + 3]) / 2;
            }
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

import * as THREE from 'three';

import { getBlockDefinition } from '../blocks/BlockRegistry.js';


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

        const plant = getBlockDefinition(hit.block.type)?.plant;

        const height = plant ? Math.min(1, plant.height) : 1;

        const width = plant ? 0.8 : 1;

        this.mesh.scale.set(width, height, width);


        this.mesh.position.set(

            hit.block.x + 0.5,

            hit.block.y + height / 2,

            hit.block.z + 0.5

        );

    }


    // Zwalnia pamięć ramki podświetlenia.

    dispose() {

        this.mesh.removeFromParent();

        this.mesh.geometry.dispose();
        this.mesh.material.dispose();

    }

}

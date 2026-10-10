import * as THREE from 'three';


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


        this.mesh.position.set(

            hit.block.x + 0.5,

            hit.block.y + 0.5,

            hit.block.z + 0.5

        );

    }

}
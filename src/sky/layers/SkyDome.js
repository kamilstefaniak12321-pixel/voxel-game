import * as THREE from 'three';

import {
    skyUniforms,
    SKY_COLOR_GLSL
} from '../skyShader.js';

// ------------------------------------------------------------
// WARSTWA: KOPUŁA NIEBA
//
// Wielka kula dookoła kamery, od środka pomalowana kolorem nieba
// (gradient, zachody - patrz skyShader.js). Rysowana jako pierwsza,
// wszystko inne jest na niej.
// ------------------------------------------------------------

export const DOME_RADIUS = 100;


export class SkyDome {

    constructor() {

        this.material = new THREE.ShaderMaterial({

            uniforms: skyUniforms,

            vertexShader: /* glsl */ `
                varying vec3 vDirection;

                void main() {
                    vDirection = position;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,

            fragmentShader: /* glsl */ `
                varying vec3 vDirection;

                ${SKY_COLOR_GLSL}

                void main() {

                    gl_FragColor = vec4(skyColor(normalize(vDirection)), 1.0);

                    #include <colorspace_fragment>

                    // Odrobina szumu, żeby w ciemnym gradiencie nie było
                    // widać "schodków" między odcieniami.

                    float noise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);

                    gl_FragColor.rgb += (noise - 0.5) / 255.0;

                }
            `,

            side: THREE.BackSide,
            depthTest: false,
            depthWrite: false

        });


        this.object = new THREE.Mesh(
            new THREE.SphereGeometry(DOME_RADIUS, 48, 24),
            this.material
        );

        this.object.renderOrder = 0;
        this.object.frustumCulled = false;

    }


    // Kolory kopuły ustawia Sky.js przez wspólne skyUniforms.

    update() {}


    dispose() {

        this.object.geometry.dispose();
        this.material.dispose();

    }

}

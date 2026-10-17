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
//
// Wysoko nad ziemią (kosmos, uSpace) kopuła czernieje - najpierw
// w zenicie, na końcu przy horyzoncie. Z wysoka gradient zaczyna się
// od widocznego horyzontu (uHorizonDip), a nie od linii poziomu.
// ------------------------------------------------------------

export const DOME_RADIUS = 100;

// Kolor nieba w kosmosie (sRGB).

const SPACE_COLOR = new THREE.Color('#010208');


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

                uniform float uSpace;
                uniform float uHorizonDip;

                ${SKY_COLOR_GLSL}

                void main() {

                    vec3 direction = normalize(vDirection);

                    // Z wysoka horyzont jest niżej niż linia poziomu -
                    // gradient nieba zaczyna się od niego.

                    vec3 skyDirection = direction;

                    skyDirection.y = (direction.y - uHorizonDip) / (1.0 - uHorizonDip);

                    vec3 color = skyColor(normalize(skyDirection));

                    // Kosmos: czernieje od zenitu w dół.

                    float space = clamp(uSpace * 1.5 - (1.0 - direction.y) * 0.25, 0.0, 1.0);

                    color = mix(color, vec3(${SPACE_COLOR.r.toFixed(5)}, ${SPACE_COLOR.g.toFixed(5)}, ${SPACE_COLOR.b.toFixed(5)}), space);

                    gl_FragColor = vec4(color, 1.0);

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

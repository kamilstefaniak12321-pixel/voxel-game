import * as THREE from 'three';

// ------------------------------------------------------------
// WARSTWA: SPADAJĄCE GWIAZDY (meteory na niebie)
//
// Krótkie, świecące smugi przelatujące po niebie. Ile ich jest,
// liczy SkyColors.js (state.meteorsPerMinute): najwięcej w ciemne
// noce (nów), mało w pełni, wcale w dzień. W noc z deszczem
// meteorów jest ich kilka razy więcej i wszystkie lecą z jednego
// punktu nieba (radiantu) - tak jak naprawdę.
//
// Mniej więcej co dwudziesta jest bolidem: jaśniejsza, dłuższa,
// kolorowa.
// ------------------------------------------------------------

const MAX_METEORS = 32;

// Odległość od kamery: przed księżycem i gwiazdami
// (meteory spalają się w atmosferze).

const DISTANCE = 85;


// Punkt nieba, z którego lecą meteory w czasie deszczu
// (w układzie gwiazd - obraca się razem z nimi).

const RADIANT = new THREE.Vector3(-0.3, 0.8, 0.45).normalize();


const BOLIDE_COLORS = [
    new THREE.Color('#9dffb0'),
    new THREE.Color('#ffc27a'),
    new THREE.Color('#c9b6ff')
];

const WHITE = new THREE.Color('#e8f0ff');


const _point = new THREE.Vector3();
const _side = new THREE.Vector3();
const _radiant = new THREE.Vector3();


// Punkt na wielkim okręgu: start obrócony o kąt w kierunku `along`.

function pointOnArc(out, start, along, angle) {

    return out
        .copy(start)
        .multiplyScalar(Math.cos(angle))
        .addScaledVector(along, Math.sin(angle));

}


export class ShootingStars {

    constructor() {

        const positions = new Float32Array(MAX_METEORS * 4 * 3);
        const colors = new Float32Array(MAX_METEORS * 4 * 4);
        const sides = new Float32Array(MAX_METEORS * 4);

        const indices = [];

        for (let i = 0; i < MAX_METEORS; i++) {

            const v = i * 4;

            indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);

            // Wierzchołki: 0, 1 - głowa, 2, 3 - koniec ogona.

            sides.set([-1, 1, -1, 1], v);

        }


        this.geometry = new THREE.BufferGeometry();

        this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 4));
        this.geometry.setAttribute('aSide', new THREE.BufferAttribute(sides, 1));
        this.geometry.setIndex(indices);


        this.material = new THREE.ShaderMaterial({

            vertexShader: /* glsl */ `
                attribute vec4 aColor;
                attribute float aSide;

                varying vec4 vColor;
                varying float vSide;
                varying vec3 vWorld;

                void main() {
                    vColor = aColor;
                    vSide = aSide;
                    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,

            fragmentShader: /* glsl */ `
                varying vec4 vColor;
                varying float vSide;
                varying vec3 vWorld;

                void main() {

                    // Miękkie brzegi smugi, schowana pod horyzontem.

                    float edge = 1.0 - vSide * vSide;

                    float aboveHorizon = smoothstep(-0.01, 0.05, normalize(vWorld).y);

                    gl_FragColor = vec4(vColor.rgb * vColor.a * edge * aboveHorizon, 1.0);

                    #include <colorspace_fragment>

                }
            `,

            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide

        });


        this.object = new THREE.Mesh(this.geometry, this.material);

        this.object.renderOrder = 3.5;
        this.object.frustumCulled = false;


        this.meteors = [];

        // Ile meteorów pokazać od razu (komenda /meteory pokaz).

        this.burst = 0;

    }


    // Nowa spadająca gwiazda. shower - lecąca z radiantu,
    // celestial - do obrotu radiantu razem z niebem.

    spawn(shower = false, celestial = null) {

        if (this.meteors.length >= MAX_METEORS) {
            return;
        }


        // Start: losowe miejsce nieba, 20-70° nad horyzontem.

        const azimuth = Math.random() * Math.PI * 2;
        const elevation = (20 + Math.random() * 50) * Math.PI / 180;

        const start = new THREE.Vector3(
            Math.cos(elevation) * Math.cos(azimuth),
            Math.sin(elevation),
            Math.cos(elevation) * Math.sin(azimuth)
        );


        // Kierunek lotu (styczny do nieba): w deszczu - od radiantu,
        // normalnie losowy, ale raczej w dół.

        const along = new THREE.Vector3();

        if (shower && celestial) {

            _radiant.copy(RADIANT).applyQuaternion(celestial.starRotation);

            // Styczna w stronę radiantu, odwrócona = od radiantu.

            along.copy(_radiant).addScaledVector(start, -start.dot(_radiant)).multiplyScalar(-1);

        }

        if (along.lengthSq() < 0.0001) {

            along.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);

            along.addScaledVector(start, -start.dot(along));

            if (along.y > 0) {
                along.multiplyScalar(-1);
            }

        }

        along.normalize();


        const bolide = Math.random() < 0.05;

        this.meteors.push({
            start,
            along,
            age: 0,
            life: bolide ? 1.6 + Math.random() : 0.5 + Math.random() * 0.8,
            speed: 0.35 + Math.random() * 0.35,
            tail: bolide ? 0.25 : 0.08 + Math.random() * 0.1,
            width: bolide ? 0.5 : 0.18,
            brightness: bolide ? 2.2 : 0.5 + Math.random() * 0.6,
            color: bolide ? BOLIDE_COLORS[Math.floor(Math.random() * BOLIDE_COLORS.length)] : WHITE
        });

    }


    update(state, celestial, dt) {

        // Nowe meteory: średnio meteorsPerMinute na minutę.

        const chance = state.meteorsPerMinute / 60 * dt;

        if (Math.random() < chance) {
            this.spawn(state.meteorShower, celestial);
        }

        while (this.burst > 0) {
            this.spawn(state.meteorShower, celestial);
            this.burst--;
        }


        const positions = this.geometry.attributes.position.array;
        const colors = this.geometry.attributes.aColor.array;

        let alive = 0;


        for (const meteor of this.meteors) {

            meteor.age += dt;

            if (meteor.age >= meteor.life) {
                continue;
            }


            // Głowa leci po niebie, ogon za nią (na starcie rośnie).

            const head = meteor.speed * meteor.age;
            const tail = Math.max(0, head - meteor.tail * Math.min(1, meteor.age / 0.15));


            // Jasność: szybko się zapala, gaśnie pod koniec, w dzień
            // i o zmierzchu jej nie widać.

            const life = meteor.age / meteor.life;

            const fade = Math.sin(Math.PI * Math.min(1, life * 1.3)) ** 0.5;

            const alpha = meteor.brightness * fade * state.starVisibility;


            const v = alive * 4;

            pointOnArc(_point, meteor.start, meteor.along, head);

            // Szerokość smugi w stopniach.

            _side.crossVectors(_point, meteor.along).normalize().multiplyScalar(meteor.width * Math.PI / 180);

            for (let k = 0; k < 2; k++) {

                const sign = k === 0 ? -1 : 1;

                positions.set([
                    (_point.x + _side.x * sign) * DISTANCE,
                    (_point.y + _side.y * sign) * DISTANCE,
                    (_point.z + _side.z * sign) * DISTANCE
                ], (v + k) * 3);

                colors.set([meteor.color.r, meteor.color.g, meteor.color.b, alpha], (v + k) * 4);

            }


            pointOnArc(_point, meteor.start, meteor.along, tail);

            for (let k = 0; k < 2; k++) {

                const sign = k === 0 ? -1 : 1;

                positions.set([
                    (_point.x + _side.x * sign * 0.3) * DISTANCE,
                    (_point.y + _side.y * sign * 0.3) * DISTANCE,
                    (_point.z + _side.z * sign * 0.3) * DISTANCE
                ], (v + 2 + k) * 3);

                colors.set([meteor.color.r, meteor.color.g, meteor.color.b, 0], (v + 2 + k) * 4);

            }


            alive++;

        }


        this.meteors = this.meteors.filter((meteor) => meteor.age < meteor.life);

        this.geometry.setDrawRange(0, alive * 6);

        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.aColor.needsUpdate = true;

        this.object.visible = alive > 0;

    }


    dispose() {

        this.geometry.dispose();
        this.material.dispose();

    }

}

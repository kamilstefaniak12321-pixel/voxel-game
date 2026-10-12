import * as THREE from 'three';

// ------------------------------------------------------------
// ŚWIATŁO METEORYTU NA TERENIE
//
// Kula ognia oświetla teren z daleka - dużo dalej niż dynamiczne
// światło (pudełko 32 bloki wokół gracza, DynamicLight.js). To jedno
// "punktowe" światło liczone w shaderach bloków, roślin, dalekiego
// terenu, modelu gracza i odłamków:
//
//   jasność = siła * R² / (R² + odległość²) * (zwrot ściany)
//
// Im bliżej meteorytu, tym jaśniej, więc teren pod spadającą kulą
// rozjaśnia się coraz mocniej. Ściany odwrócone od meteorytu są
// ciemniejsze. Cieni nie ma (światło przechodzi przez góry) - przy
// kuli ognia na niebie tego nie widać, a z bliska i tak działa też
// dynamiczne światło, które przez ściany nie przechodzi.
//
// Wartości ustawia co klatkę game/Meteorites.js.
// ------------------------------------------------------------

export const meteorLightUniforms = {

    // Gdzie jest źródło światła (świat, w blokach).
    uMeteorPosition: { value: new THREE.Vector3() },

    // Kolor razy siła (liniowo; czarny = wyłączone). Siła powyżej 1
    // prześwietla teren (błysk uderzenia).
    uMeteorColor: { value: new THREE.Vector3() },

    // Zasięg R: w tej odległości światło ma połowę siły.
    uMeteorRange: { value: 40 }

};


// Funkcja dla shaderów: światło meteorytu w punkcie świata o danej
// normalnej (kolor do dodania, mnożony potem przez teksturę).

export const METEOR_LIGHT_GLSL = /* glsl */ `

    uniform vec3 uMeteorPosition;
    uniform vec3 uMeteorColor;
    uniform float uMeteorRange;

    vec3 meteorLight(vec3 worldPosition, vec3 worldNormal) {

        if (uMeteorColor.r + uMeteorColor.g + uMeteorColor.b <= 0.0) {
            return vec3(0.0);
        }

        vec3 toMeteor = uMeteorPosition - worldPosition;

        float distance2 = dot(toMeteor, toMeteor);

        float range2 = uMeteorRange * uMeteorRange;

        float falloff = range2 / (range2 + distance2);

        float facing = dot(worldNormal, toMeteor * inversesqrt(max(distance2, 0.0001)));

        return uMeteorColor * falloff * clamp(facing * 0.7 + 0.3, 0.0, 1.0);

    }

`;

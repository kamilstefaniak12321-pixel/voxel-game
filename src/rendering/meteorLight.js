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
//
// Od 1.13.0 z tego samego światła korzysta błysk pioruna (Game.updateStorm,
// weather/Thunderstorm.js) - gdy akurat nie leci meteoryt. Błyskawica
// świeci z nieba, więc oświetla tylko to, do czego dochodzi światło nieba
// (uMeteorSky = 1): w jaskini i w głębi domu zostaje ciemno.
// ------------------------------------------------------------

export const meteorLightUniforms = {

    // Gdzie jest źródło światła (świat, w blokach).
    uMeteorPosition: { value: new THREE.Vector3() },

    // Kolor razy siła (liniowo; czarny = wyłączone). Siła powyżej 1
    // prześwietla teren (błysk uderzenia).
    uMeteorColor: { value: new THREE.Vector3() },

    // Zasięg R: w tej odległości światło ma połowę siły.
    uMeteorRange: { value: 40 },

    // 0 - światło dochodzi wszędzie (meteoryt), 1 - tylko tam, dokąd
    // dochodzi światło nieba (błysk pioruna).
    uMeteorSky: { value: 0 }

};


// Funkcja dla shaderów: światło meteorytu w punkcie świata o danej
// normalnej (kolor do dodania, mnożony potem przez teksturę).

export const METEOR_LIGHT_GLSL = /* glsl */ `

    uniform vec3 uMeteorPosition;
    uniform vec3 uMeteorColor;
    uniform float uMeteorRange;
    uniform float uMeteorSky;

    // Przez tyle mnoży się światło w miejscu o danym świetle nieba (0-1).
    float meteorSky(float skyLight) {
        return mix(1.0, smoothstep(0.08, 0.7, skyLight), uMeteorSky);
    }

    vec3 meteorLight(vec3 worldPosition, vec3 worldNormal) {

        if (uMeteorColor.r + uMeteorColor.g + uMeteorColor.b <= 0.0) {
            return vec3(0.0);
        }

        vec3 toMeteor = uMeteorPosition - worldPosition;

        float distance2 = dot(toMeteor, toMeteor);

        float range2 = uMeteorRange * uMeteorRange;

        float falloff = range2 / (range2 + distance2);

        float facing = dot(worldNormal, toMeteor * inversesqrt(max(distance2, 0.0001)));

        float wrap = clamp(facing * 0.7 + 0.3, 0.0, 1.0);

        // Błysk pioruna odbija się od chmur i świeci zewsząd - ściany
        // odwrócone od niego nie są czarne.
        wrap = mix(wrap, 0.42 + 0.58 * wrap, uMeteorSky);

        return uMeteorColor * falloff * wrap;

    }

`;

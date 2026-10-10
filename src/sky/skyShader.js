import * as THREE from 'three';

// ------------------------------------------------------------
// WSPÓLNY KOLOR NIEBA
//
// Jedna funkcja skyColor(kierunek) liczy kolor nieba w danym
// kierunku (gradient, zachód słońca, poświata wokół słońca).
// Używają jej dwa shadery:
//   - kopuła nieba (layers/SkyDome.js),
//   - mgła na blokach (rendering/BlockRenderData.js).
// Dzięki temu daleki teren znika we mgle dokładnie w kolorze
// nieba za nim - także o zachodzie, gdy niebo z jednej strony
// jest pomarańczowe, a z drugiej niebieskie.
//
// Wartości (uniformy) ustawia co klatkę Sky.js.
// ------------------------------------------------------------

export const skyUniforms = {

    // Kolor nieba w zenicie (nad głową) i przy horyzoncie.

    uSkyZenith: { value: new THREE.Color() },
    uSkyHorizon: { value: new THREE.Color() },

    // Zachód/wschód: kolor przy horyzoncie od strony słońca,
    // kolor wyższego, różowego pasa i siła całego efektu (0-1).

    uSunsetColor: { value: new THREE.Color() },
    uSunsetHigh: { value: new THREE.Color() },
    uSunset: { value: 0 },

    // Kierunek do słońca i poświata wokół niego.

    uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
    uSunHalo: { value: new THREE.Color() },

    // Jasność mgły na blokach (ciemnieje w tunelach).

    uFogBrightness: { value: 1 }

};


export const SKY_COLOR_GLSL = /* glsl */ `

    uniform vec3 uSkyZenith;
    uniform vec3 uSkyHorizon;
    uniform vec3 uSunsetColor;
    uniform vec3 uSunsetHigh;
    uniform float uSunset;
    uniform vec3 uSunDirection;
    uniform vec3 uSunHalo;

    vec3 skyColor(vec3 direction) {

        // Wysokość nad horyzontem: 0 = horyzont, 1 = zenit.
        // Pod horyzontem kolor jest taki jak przy horyzoncie.

        float height = clamp(direction.y, 0.0, 1.0);

        vec3 color = mix(uSkyHorizon, uSkyZenith, pow(height, 0.5));


        // Jak bardzo patrzymy w stronę słońca (tylko w poziomie):
        // 1 = prosto na słońce, 0 = w przeciwną stronę.

        vec2 flatDirection = direction.xz;
        vec2 flatSun = uSunDirection.xz;

        float towardSun = 0.5;

        if (length(flatDirection) > 0.0001 && length(flatSun) > 0.0001) {
            towardSun = dot(normalize(flatDirection), normalize(flatSun)) * 0.5 + 0.5;
        }


        // Pod horyzontem (np. mgła na terenie w dole, gdy stoimy
        // na górze) łuna i poświata słabną.

        float below = clamp(-direction.y * 3.0, 0.0, 1.0);

        float aboveGround = 1.0 - below;


        // Zachód: pomarańczowa łuna nisko nad horyzontem od strony
        // słońca i różowy pas trochę wyżej dookoła nieba.

        float glow = uSunset * exp(-height * 7.0) * pow(towardSun, 2.5) * aboveGround;

        color = mix(color, uSunsetColor, clamp(glow, 0.0, 1.0));


        float band = uSunset * exp(-abs(height - 0.15) * 10.0) * (0.25 + 0.2 * (1.0 - towardSun));

        color = mix(color, uSunsetHigh, clamp(band, 0.0, 1.0));


        // Poświata wokół słońca (szeroka i wąska).

        float sun = max(dot(direction, uSunDirection), 0.0);

        color += uSunHalo * (pow(sun, 8.0) * 0.3 + pow(sun, 90.0) * 0.6) * aboveGround;


        return color;

    }

`;

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

    // Eksperyment: rzeczywiste zero w danych światła bloków; klasyczny
    // model zachowuje dawną minimalną jasność. Bez przebudowy chunków.
    uAtmosphericLight: { value: 0 },

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

    // Zaćmienie słońca: łuna dookoła całego horyzontu (siła i kolor).

    uEclipseGlow: { value: 0 },
    uEclipseGlowColor: { value: new THREE.Color() },

    // Jasność mgły na blokach (ciemnieje w tunelach).

    uFogBrightness: { value: 1 },

    // Nocą bloki oświetlone niebem tracą kolory i idą w barwę
    // światła księżyca (lampy zostają kolorowe).

    uNightDesaturation: { value: 0 },
    uNightTint: { value: new THREE.Color(1, 1, 1) },

    // Meteoryt (game/Meteorites.js): łuna na niebie wokół kuli ognia
    // (kierunek od kamery i kolor razy siła; czarny = brak) i błysk
    // uderzenia, który rozjaśnia całe niebo.

    uMeteorDirection: { value: new THREE.Vector3(0, 1, 0) },
    uMeteorGlow: { value: new THREE.Color(0, 0, 0) },
    uSkyFlash: { value: new THREE.Color(0, 0, 0) },

    // Kosmos (src/space/): 0 = zwykłe niebo, 1 = kamera wysoko nad
    // ziemią, niebo jest czarne. skyColor() zostaje kolorem powietrza
    // (mgiełka na terenie widzianym z góry), czernieje sama kopuła.

    uSpace: { value: 0 },

    // Gdzie jest widoczny horyzont (y kierunku, 0 = poziomo; z wysoka
    // niżej - Sky.horizonDip). Gradient kopuły zaczyna się od niego.

    uHorizonDip: { value: 0 }

};


export const SKY_COLOR_GLSL = /* glsl */ `

    uniform vec3 uSkyZenith;
    uniform vec3 uSkyHorizon;
    uniform vec3 uSunsetColor;
    uniform vec3 uSunsetHigh;
    uniform float uSunset;
    uniform vec3 uSunDirection;
    uniform vec3 uSunHalo;
    uniform float uEclipseGlow;
    uniform vec3 uEclipseGlowColor;
    uniform vec3 uMeteorDirection;
    uniform vec3 uMeteorGlow;
    uniform vec3 uSkyFlash;

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


        // Pełne zaćmienie: dookoła horyzontu jasno jak przy zachodzie
        // (tam cień księżyca już nie sięga).

        float eclipseGlow = uEclipseGlow * exp(-height * 9.0) * aboveGround;

        color = mix(color, uEclipseGlowColor, clamp(eclipseGlow, 0.0, 1.0));


        // Poświata wokół słońca (szeroka i wąska).

        float sun = max(dot(direction, uSunDirection), 0.0);

        color += uSunHalo * (pow(sun, 8.0) * 0.3 + pow(sun, 90.0) * 0.6) * aboveGround;


        // Meteoryt: łuna wokół kuli ognia (szeroka, węższa i jasny
        // środek) i błysk uderzenia na całym niebie.

        float meteor = max(dot(direction, uMeteorDirection), 0.0);

        color += uMeteorGlow * (pow(meteor, 5.0) * 0.06 + pow(meteor, 30.0) * 0.35 + pow(meteor, 400.0) * 1.2);

        color += uSkyFlash;


        return color;

    }

`;

// Ta sama korekta obniżenia horyzontu co w SkyDome. Osobny fragment
// pozwala zachować bazę A/B oraz nie dublować uniformu w samej kopule.
// Parametr blend płynnie wraca do poprzedniej atmosfery przy locie
// w kosmos; kolor nie jest przyciemniany globalnie po wejściu pod dach.
export const AERIAL_SKY_GLSL = /* glsl */ `
    uniform float uHorizonDip;
    vec3 atmosphereFogColor(vec3 offset, float blend, float legacyBrightness) {
        vec3 direction = offset / max(length(offset), 0.00001);
        float amount = clamp(blend, 0.0, 1.0);
        if (amount > 0.0) {
            float correctedY = (direction.y - uHorizonDip) / max(1.0 - uHorizonDip, 0.05);
            direction.y = mix(direction.y, correctedY, amount);
            direction = normalize(direction);
        }
        // Jedno wywołanie rozbudowanego skyColor: kompilator ANGLE/D3D
        // rozwija funkcje inline, więc oddzielne gałęzie mnożyły kod.
        // Krańce przejścia pozostają identyczne; pomiędzy nimi zmienia
        // się kierunek gradientu i dostępna jasność, nie dwie kopie nieba.
        return skyColor(direction) * mix(legacyBrightness, 1.0, amount);
    }
`;

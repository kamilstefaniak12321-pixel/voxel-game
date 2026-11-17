import * as THREE from 'three';

// ------------------------------------------------------------
// WSPÓLNE DANE CHMUR DLA SHADERÓW (1.11.0)
//
// Chmury na niebie (sky/layers/Clouds.js) i cienie chmur na terenie
// (bloki, daleki teren) czytają te same dwie tekstury:
//   uWeatherMap - mapa pogody wokół gracza (Weather.js): R pokrycie
//                 chmur niskich, G ich piętrzenie, B chmury średnie,
//                 A wysokie; jeden punkt = WEATHER_MAP_TEXEL bloków,
//   uCloudNoise - kształt chmur (CloudNoise.js).
// Mapa mówi "ile chmur", szum "gdzie dokładnie" - dlatego cień na ziemi
// leży pod tą samą chmurą, którą widać na niebie.
//
// Chmury niskie są zbudowane z kolumn o boku CLOUD_CELL bloków: mają
// płaską podstawę i wierzch tym wyżej, im głębiej w chmurze - z bliska
// wyglądają jak ułożone z dużych klocków.
// ------------------------------------------------------------

// Bok kolumny chmury niskiej i oczka chmur wyższych (bloki).
export const CLOUD_CELL = 8;

// Wysokości (y świata): podstawa chmur niskich, chmury średnie, wysokie.
// Teren kończy się na 128, więc chmury zawsze są nad nim.
export const CLOUD_LEVELS = { low: 210, mid: 470, high: 760 };

// Grubość kolumny: od cienkiej warstwy do chmury burzowej (piętrzenie 0-1).
export const CLOUD_THICKNESS = [18, 420];

// Jak daleko widać chmury (bloki w poziomie) - trochę mniej niż pół
// boku mapy pogody.
export const CLOUD_REACH = 7600;

// Powtarzalność wzorów (bloki): po tylu blokach szum się zawija, więc
// przesunięcia z wiatrem (uCloudDrift) trzyma się w tym zakresie.
export const CLOUD_TILES = { low: 2048, group: 7168, mid: 3072, high: 3072 };


export const cloudUniforms = {

    uWeatherMap: { value: null },
    uCloudNoise: { value: null },

    // 1 / bok mapy pogody w blokach.
    uWeatherScale: { value: 1 / 16384 },

    // Przesunięcie wzorów z wiatrem: [0] niskie (xy kłęby, zw grupy),
    // [1] xy średnie, zw wysokie.
    uCloudDrift: { value: [new THREE.Vector4(), new THREE.Vector4()] },

    // x podstawa niskich, y największa grubość w okolicy, z średnie, w wysokie.
    uCloudLevels: { value: new THREE.Vector4(CLOUD_LEVELS.low, 120, CLOUD_LEVELS.mid, CLOUD_LEVELS.high) },

    // Cień chmur na terenie: x siła (0 - brak), yz - o ile bloków w bok
    // przesuwa się cień na każdy blok wysokości (kierunek do światła).
    uCloudShadow: { value: new THREE.Vector3(0, 0, 0) },

    // Druga mapa pogody (od 1.12.0): R opad, G burza, B mokra ziemia, A mgła.
    uWeatherRain: { value: null },

    // Kurtyny deszczu pod chmurami: x - czy w okolicy pada (0/1),
    // y - kierunek wiatru (radiany), z - pochylenie smug.
    uRainVeil: { value: new THREE.Vector4(0, 0, 0, 0) },

    // Kolor zasłony deszczu (z koloru chmur w cieniu - sky/layers/Clouds.js);
    // ten sam na niebie i na dalekim terenie pod deszczem.
    uRainVeilColor: { value: new THREE.Color(0.42, 0.45, 0.5) },

    // x - tęcza (0-1), y - halo wokół słońca albo księżyca (0-1).
    uSkyOptics: { value: new THREE.Vector4(0, 0, 0, 0) },

    // Mokra ziemia i kałuże na terenie: 1 - wł., 0 - wył. (ustawienie).
    uWetness: { value: 0 },

    // Burza (od 1.13.0): x - czy w okolicy jest burza (ciemniejsze chmury),
    // y - czy coś teraz błyska (0/1).
    uStorm: { value: new THREE.Vector4(0, 0, 0, 0) },

    // Błyski w chmurach (weather/Thunderstorm.js): xy - miejsce (x, z
    // świata), z - promień poświaty, w - poziom błysku.
    uCloudFlash: { value: [new THREE.Vector4(0, 0, 1, 0), new THREE.Vector4(0, 0, 1, 0), new THREE.Vector4(0, 0, 1, 0)] },
    uCloudFlashColor: { value: new THREE.Color(0.74, 0.82, 1.0) },

    // Grad na ziemi: xy - miejsce, w którym spadł (x, z świata),
    // z - ile go leży (0-1).
    uHailGround: { value: new THREE.Vector3(0, 0, 0) },

    // Zima (od 1.14.0). Trzecia mapa pogody: R świeży opad, G temperatura
    // teraz, B temperatura powolna (obie na poziomie morza, bajt = zakres
    // od -40 do 40 stopni), A szron.
    uWeatherSnow: { value: null },

    // x - czy śnieg jest możliwy (0/1), y - o ile stopni chłodniej na blok
    // wysokości, z - poziom morza, w - pokrywa z komendy (-1: z mapy).
    uSnow: { value: new THREE.Vector4(0, 0.08, 48, -1) },
    uSnowColor: { value: new THREE.Color(0.86, 0.9, 0.96) },

    // Szron: -2 wyłączony, -1 z mapy, 0-1 z komendy.
    uFrost: { value: -2 }

};


// Gdzie są chmury niskie: wspólne dla nieba i cieni.

export const CLOUD_FIELD_GLSL = /* glsl */ `
    uniform sampler2D uWeatherMap;
    uniform sampler2D uCloudNoise;
    uniform float uWeatherScale;
    uniform vec4 uCloudDrift[2];
    uniform vec4 uCloudLevels;

    // Pokrycie nieba (0-1) -> próg szumu. Szum to suma dwóch wyrównanych
    // wzorów (0.62 i 0.38), więc środek zależności jest liniowy, a końce
    // dociągnięte tak, żeby 0 znaczyło "ani jednej chmury", a 1 - "bez dziur".
    float cloudThreshold(float cover) {
        return 0.19 + 0.62 * cover
            + 0.2 * smoothstep(0.8, 1.0, cover)
            - 0.2 * (1.0 - smoothstep(0.0, 0.12, cover));
    }

    // Zapas: > 0 - w punkcie p jest chmura niska (im więcej, tym głębiej
    // w chmurze). cover - kanał R mapy pogody w tym miejscu.
    float lowCloudMargin(vec2 p, float cover, float lod) {
        float puffs = textureLod(uCloudNoise, (p + uCloudDrift[0].xy) / ${CLOUD_TILES.low.toFixed(1)}, lod).r;
        float groups = textureLod(uCloudNoise, (p + uCloudDrift[0].zw) / ${CLOUD_TILES.group.toFixed(1)}, max(0.0, lod - 1.8)).g;
        return cloudThreshold(cover) - (0.62 * puffs + 0.38 * groups);
    }
`;


// Cień chmur na terenie: cloudShadowAt(pozycja w świecie) -> 0-1, przez
// tyle mnoży się światło słońca (albo księżyca).

export const CLOUD_SHADOW_GLSL = /* glsl */ `
    ${CLOUD_FIELD_GLSL}
    uniform vec3 uCloudShadow;

    float cloudShadowAt(vec3 worldPosition) {

        if (uCloudShadow.x <= 0.0) {
            return 1.0;
        }

        // Punkt, w którym promień do światła przecina chmury.
        vec2 p = worldPosition.xz + uCloudShadow.yz * (uCloudLevels.x + 24.0 - worldPosition.y);
        vec4 weather = texture2D(uWeatherMap, p * uWeatherScale);
        float puffs = texture2D(uCloudNoise, (p + uCloudDrift[0].xy) / ${CLOUD_TILES.low.toFixed(1)}).r;
        float groups = texture2D(uCloudNoise, (p + uCloudDrift[0].zw) / ${CLOUD_TILES.group.toFixed(1)}).g;
        float margin = cloudThreshold(weather.r) - (0.62 * puffs + 0.38 * groups);

        // Cienka chmura daje jaśniejszy cień niż gruba.
        float shade = smoothstep(0.0, 0.05, margin) * (0.62 + 0.38 * weather.g);

        return 1.0 - uCloudShadow.x * shade;

    }

    // Mokra ziemia (od 1.12.0): 0-1 w danym miejscu - z mapy pogody,
    // która pamięta niedawny deszcz (moknie w pół minuty, schnie kilka).
    uniform sampler2D uWeatherRain;
    uniform float uWetness;

    float groundWetness(vec3 worldPosition) {

        if (uWetness <= 0.0) {
            return 0.0;
        }

        return texture2D(uWeatherRain, worldPosition.xz * uWeatherScale).b * uWetness;

    }

    // Kałuża (0 albo 1) na płaskim wierzchu bloku: plamy z szumu, tym
    // większe, im mokrzej; brzeg z pikseli wielkości pikseli tekstur.
    float puddleAt(vec3 worldPosition, float wet) {

        vec2 q = (floor(worldPosition.xz * 16.0) + 0.5) / 16.0;
        float spots = 0.6 * textureLod(uCloudNoise, q / 37.0, 0.0).a + 0.4 * textureLod(uCloudNoise, q / 9.0 + 0.31, 0.0).r;

        return step(1.22 - 0.5 * wet, spots);

    }

    // Grad na ziemi (od 1.13.0): białe ziarna na płaskich wierzchach
    // w okolicy miejsca, gdzie spadł - 0 albo 1 dla piksela tekstury.
    uniform vec3 uHailGround;

    float hailAt(vec3 worldPosition) {

        if (uHailGround.z <= 0.0) {
            return 0.0;
        }

        vec2 q = floor(worldPosition.xz * 16.0);
        float grain = fract(sin(dot(mod(q, 509.0), vec2(12.9898, 78.233))) * 43758.5453);
        float near = 1.0 - smoothstep(70.0, 150.0, length(worldPosition.xz - uHailGround.xy));

        return step(1.0 - 0.2 * uHailGround.z * near, grain);

    }

    // ŚNIEG (od 1.14.0). Pokrywa śnieżna 0-1 w punkcie świata: zimowa
    // (średnia temperatura pory roku i klimatu, niższa w górach) albo
    // świeży śnieg z niedawnego opadu, gdy jest dość zimno. Ten sam
    // rachunek co w Weather.js (snowCover).
    uniform sampler2D uWeatherSnow;
    uniform vec4 uSnow;
    uniform vec3 uSnowColor;
    uniform float uFrost;

    float snowCoverAt(vec3 worldPosition) {

        if (uSnow.x <= 0.0) {
            return 0.0;
        }

        if (uSnow.w >= 0.0) {
            return uSnow.w;
        }

        vec4 snow = texture2D(uWeatherSnow, worldPosition.xz * uWeatherScale);
        float drop = uSnow.y * max(0.0, worldPosition.y - uSnow.z);
        float now = snow.g * 80.0 - 40.0 - drop;
        float slow = snow.b * 80.0 - 40.0 - drop;

        return max(1.0 - smoothstep(-3.0, 1.0, slow), snow.r * (1.0 - smoothstep(-1.0, 1.5, now)));

    }

    // Czy piksel tekstury (1/16 bloku) leży pod śniegiem: płaty rosną
    // razem z pokrywą - od pojedynczych plam po zwartą biel.
    float snowPixel(vec3 worldPosition, float cover) {

        vec2 q = (floor(worldPosition.xz * 16.0) + 0.5) / 16.0;
        float patches = 0.5 * textureLod(uCloudNoise, q / 23.0, 0.0).a
            + 0.34 * textureLod(uCloudNoise, q / 5.3 + 0.37, 0.0).r
            + 0.16 * fract(sin(dot(mod(q * 16.0, 509.0), vec2(12.9898, 78.233))) * 43758.5453);

        return step(patches, cover * 1.08 - 0.04);

    }

    // Szron 0-1 w punkcie świata (mroźne, pogodne noce i ranki).
    float frostAt(vec3 worldPosition) {

        if (uFrost < -1.5) {
            return 0.0;
        }

        return uFrost >= 0.0 ? uFrost : texture2D(uWeatherSnow, worldPosition.xz * uWeatherScale).a;

    }

    // Opad nad danym miejscem (0-1) - daleki teren pod deszczem tonie
    // w szarej zasłonie. Bez deszczu w okolicy nic nie czyta.
    uniform vec4 uRainVeil;
    uniform vec3 uRainVeilColor;

    float rainAt(vec3 worldPosition) {

        if (uRainVeil.x < 0.5) {
            return 0.0;
        }

        return texture2D(uWeatherRain, worldPosition.xz * uWeatherScale).r;

    }
`;


// Shader chmur na niebie. Wymaga skyColor(kierunek) (skyShader.js).

export const CLOUD_LAYERS_GLSL = /* glsl */ `
    ${CLOUD_FIELD_GLSL}

    uniform vec3 uCloudCamera;      // kamera w świecie
    uniform vec3 uCloudLight;       // kierunek do światła (słońce albo księżyc)
    uniform vec3 uCloudLit;         // kolor chmury w pełnym świetle
    uniform vec3 uCloudShade;       // kolor chmury w cieniu (światło z nieba)
    uniform vec3 uCloudGlow;        // światło od spodu o wschodzie i zachodzie
    uniform vec3 uCloudLayerLit;    // ile światła dostają: niskie, średnie, wysokie
    uniform vec4 uCloudView;        // x przebieg, y jakość, z kąt piksela, w widoczność
    uniform vec2 uCloudFlow;        // kierunek, z którego płyną (smugi pierzastych)
    uniform sampler2D uWeatherRain; // R opad, G burza, B mokra ziemia, A mgła
    uniform vec4 uRainVeil;         // x czy pada w okolicy, y kierunek wiatru, z pochylenie
    uniform vec3 uRainVeilColor;    // kolor zasłony deszczu
    uniform vec4 uSkyOptics;        // x tęcza, y halo
    uniform vec4 uStorm;            // x burza w okolicy, y coś błyska
    uniform vec4 uCloudFlash[3];    // błyski: xy miejsce, z promień, w poziom
    uniform vec3 uCloudFlashColor;

    const float CLOUD_CELL = ${CLOUD_CELL.toFixed(1)};
    const float CLOUD_REACH = ${CLOUD_REACH.toFixed(1)};

    // Środek oczka (w ramie płynącej z wiatrem), do którego należy p.
    // snap 1 - klocki, 0 - gładko (daleko, gdzie klocki są mniejsze niż piksel).
    vec2 cloudCell(vec2 p, vec2 drift, float cell, float snap) {
        vec2 q = (floor((p + drift) / cell) + 0.5) * cell - drift;
        return mix(p, q, snap);
    }

    // Wysokość kolumny chmury niskiej nad podstawą w punkcie p (0 - brak).
    float lowColumn(vec2 p, float lod, float snap) {

        vec2 c = cloudCell(p, uCloudDrift[0].xy, CLOUD_CELL, snap);
        vec4 weather = textureLod(uWeatherMap, c * uWeatherScale, 0.0);
        float margin = lowCloudMargin(c, weather.r, lod);

        if (margin <= 0.0) {
            return 0.0;
        }

        // Wierzch: tym wyżej, im głębiej w chmurze; z bliska układa się
        // w tarasy po dwa oczka wysokości - jak chmura z klocków.
        float rough = textureLod(uCloudNoise, (c + uCloudDrift[0].xy) / 2048.0, lod).a;
        float full = mix(${CLOUD_THICKNESS[0].toFixed(1)}, ${CLOUD_THICKNESS[1].toFixed(1)}, weather.g);
        float height = full * smoothstep(-0.02, 0.3, margin) * (0.8 + 0.4 * rough);
        float step2 = CLOUD_CELL * 2.0;

        return max(CLOUD_CELL, mix(height, ceil(height / step2) * step2, snap));

    }

    // Zanikanie z odległością (brzeg mapy pogody) i zamglenie.
    float cloudFade(float range) {
        return 1.0 - smoothstep(CLOUD_REACH * 0.7, CLOUD_REACH, range);
    }

    float cloudHaze(float range) {
        return 1.0 - exp(-range / 7000.0);
    }

    // Poświata błysków w miejscu p (x, z świata): chmura świeci wokół
    // wyładowania. Wołane tylko, gdy coś błyska (uStorm.y).
    float cloudFlash(vec2 p) {

        float glow = 0.0;

        for (int i = 0; i < 3; i++) {
            vec2 d = p - uCloudFlash[i].xy;
            glow += uCloudFlash[i].w * exp(-dot(d, d) / (uCloudFlash[i].z * uCloudFlash[i].z));
        }

        return glow;

    }

    // Mieszanie "z przodu na tył": front zasłania to, co za nim.
    void cloudOver(inout vec4 result, vec3 color, float alpha) {
        result.rgb += (1.0 - result.a) * alpha * color;
        result.a += (1.0 - result.a) * alpha;
    }

    // Chmury niskie na promieniu (ro, rd). Zwraca kolor i krycie.
    vec4 lowClouds(vec3 ro, vec3 rd, vec3 sky) {

        float base = uCloudLevels.x;
        float top = base + uCloudLevels.y;
        float tBase = (base - ro.y) / rd.y;
        float tTop = (top - ro.y) / rd.y;
        float tNear = max(min(tBase, tTop), 0.0);
        float tFar = max(tBase, tTop);
        float flat2 = length(rd.xz);

        if (tFar <= 0.0 || tNear * flat2 > CLOUD_REACH) {
            return vec4(0.0);
        }

        tFar = min(tFar, CLOUD_REACH / max(flat2, 1e-4));

        // Klocki widać z bliska; dalej są mniejsze od piksela i mieniłyby
        // się w ruchu, więc kształt przechodzi w gładki.
        float footprint = tNear * uCloudView.z;
        float snap = 1.0 - smoothstep(0.35, 1.2, footprint / CLOUD_CELL);
        float lod = max(0.0, log2(max(footprint / max(abs(rd.y), 0.12), 1e-3) / CLOUD_CELL));

        // Czyste niebo na całym odcinku promienia - nie ma czego szukać
        // (mapa pogody jest gładka, cztery próbki wystarczą).
        vec2 from = (ro.xz + rd.xz * tNear) * uWeatherScale;
        vec2 to = (ro.xz + rd.xz * tFar) * uWeatherScale;
        float cover = max(
            max(textureLod(uWeatherMap, from, 0.0).r, textureLod(uWeatherMap, mix(from, to, 0.33), 0.0).r),
            max(textureLod(uWeatherMap, mix(from, to, 0.67), 0.0).r, textureLod(uWeatherMap, to, 0.0).r));

        if (cover < 0.012) {
            return vec4(0.0);
        }

        // Szukanie pierwszej kolumny na promieniu: od wejścia w warstwę
        // do wyjścia, potem dokładniej między dwoma ostatnimi krokami.
        int steps = uCloudView.y > 0.5 ? 9 : 1;

        // Chmury płaskie (tańsze): liczy się tylko podstawa.
        if (steps == 1) {
            if (tBase <= 0.0) return vec4(0.0);
            tNear = tBase;
        }

        float t = tNear;
        float previous = tNear;
        float column = 0.0;
        bool hit = false;

        for (int i = 0; i < 9; i++) {

            if (i >= steps) break;

            // Kroki gęściej przy podstawie - tam jest większość chmur.
            float along = float(i) / float(max(steps - 1, 1));

            t = mix(tNear, tFar, ro.y < base ? along * along : along);

            vec3 p = ro + rd * t;

            column = lowColumn(p.xz, lod, snap);

            if (column > 0.0 && p.y - base <= column + 0.01) {
                hit = true;
                break;
            }

            previous = t;

        }

        if (!hit) {
            return vec4(0.0);
        }

        bool first = t <= tNear + 1e-3;
        float before = previous;

        if (!first) {

            float a = previous;
            float b = t;

            for (int i = 0; i < 5; i++) {

                float m = 0.5 * (a + b);
                vec3 p = ro + rd * m;
                float h = lowColumn(p.xz, lod, snap);

                if (h > 0.0 && p.y - base <= h + 0.01) {
                    b = m;
                    column = h;
                } else {
                    a = m;
                }

            }

            before = a;
            t = b;

        }

        vec3 p = ro + rd * t;
        float above = clamp(p.y - base, 0.0, column);

        // Która ściana klocka: spód (wejście przez podstawę), wierzch
        // albo bok - po tym, przez którą granicę oczka wszedł promień.
        float bottom = first && ro.y < base ? 1.0 : 0.0;
        vec3 normal = vec3(0.0, bottom > 0.5 ? -1.0 : 1.0, 0.0);

        if (!first) {

            vec2 outside = floor(((ro + rd * before).xz + uCloudDrift[0].xy) / CLOUD_CELL);
            vec2 inside = floor((p.xz + uCloudDrift[0].xy) / CLOUD_CELL);
            vec2 side = outside - inside;

            if (side != vec2(0.0)) {
                normal = abs(side.x) >= abs(side.y) ? vec3(sign(side.x), 0.0, 0.0) : vec3(0.0, 0.0, sign(side.y));
            }

        }

        // Wierzch dostaje światło według wysokości słońca; boki jednakowo
        // (osobne cieniowanie ścian x i z dawało pasy na wysokich chmurach)
        // - o tym, czy bok jest jasny, decyduje to, co stoi przed słońcem.
        float facing = normal.y > 0.5 ? mix(0.6, max(uCloudLight.y, 0.0), snap) : 0.6;

        // Światło: ile chmury stoi między tym miejscem a słońcem
        // (dwie próbki w stronę światła; dla spodu - własna grubość).
        vec2 toLight = uCloudLight.xz / max(length(uCloudLight.xz), 1e-3);
        float rise = uCloudLight.y / max(length(uCloudLight.xz), 0.08);
        float blocked =
            max(0.0, lowColumn(p.xz + toLight * 24.0, lod, snap) - above - rise * 24.0) +
            max(0.0, lowColumn(p.xz + toLight * 72.0, lod, snap) - above - rise * 72.0);
        float depth = exp(-column / 170.0);

        // Każdy klocek trochę jaśniejszy albo ciemniejszy - jak piksele
        // tekstury.
        vec2 cell = floor((p.xz + uCloudDrift[0].xy) / CLOUD_CELL);
        float grain = 1.0 + snap * 0.07 * (fract(sin(dot(mod(cell, 509.0), vec2(12.9898, 78.233))) * 43758.5453) - 0.5);

        // Kłęby: boki i wierzch raz jaśniejsze, raz ciemniejsze (z bliska
        // klocek po klocku) - bez tego daleka ściana chmur byłaby gładka.
        vec2 spot = mix(p.xz, (cell + 0.5) * CLOUD_CELL - uCloudDrift[0].xy, snap) + uCloudDrift[0].xy;
        float level = mix(above, floor(above / CLOUD_CELL) * CLOUD_CELL, snap);
        float billow = textureLod(uCloudNoise, (spot + vec2(level * 0.9, level * 0.5)) / 512.0, lod).a;

        float direct = mix((0.25 + 0.75 * facing) * exp(-blocked / 70.0) * (0.66 + 0.6 * billow), 0.85 * exp(-column / 45.0), bottom);
        float ambient = grain * mix(
            mix(0.7, 1.0, clamp(above / 160.0, 0.0, 1.0)) * (normal.y > 0.5 ? 1.0 : 0.84),
            mix(0.3, 0.96, exp(-column / 200.0)),
            bottom);

        // Spód o wschodzie i zachodzie świeci od dołu.
        vec3 color = uCloudShade * ambient
            + uCloudLit * uCloudLayerLit.x * direct
            + uCloudGlow * (0.3 + 0.7 * bottom) * (0.35 + 0.65 * depth);

        // Chmura burzowa jest ciemna i sina - tym bardziej, im silniejsza
        // burza w tym miejscu (kanał G drugiej mapy pogody).
        if (uStorm.x > 0.5) {
            float storm = textureLod(uWeatherRain, p.xz * uWeatherScale, 0.0).g;
            color *= mix(vec3(1.0), vec3(0.4, 0.44, 0.55), smoothstep(0.0, 0.7, storm) * mix(0.85, 1.0, bottom));
        }

        // Błysk: podstawa świeci najmocniej (światło wychodzi dołem),
        // boki i wierzch słabiej.
        if (uStorm.y > 0.5) {
            color += uCloudFlashColor * cloudFlash(p.xz) * mix(0.7, 1.15, bottom);
        }

        float range = t * flat2;
        float alpha = mix(1.0, clamp(0.62 + column / 48.0, 0.0, 1.0), bottom) * cloudFade(range);

        color = mix(color, sky, cloudHaze(range));

        return vec4(color, alpha);

    }

    // Płaska warstwa na wysokości level: pokrycie z kanału mapy pogody.
    // Zwraca krycie; point - miejsce przecięcia.
    bool cloudPlane(vec3 ro, vec3 rd, float level, out vec2 point, out float range) {

        float t = (level - ro.y) / rd.y;

        point = ro.xz + rd.xz * t;
        range = t * length(rd.xz);

        return t > 0.0 && range < CLOUD_REACH;

    }

    // Chmury średnie: drobne kłębki albo jednolita zasłona.
    vec4 midClouds(vec3 ro, vec3 rd, vec3 sky) {

        vec2 point;
        float range;

        if (!cloudPlane(ro, rd, uCloudLevels.z, point, range)) {
            return vec4(0.0);
        }

        float footprint = range * uCloudView.z / max(abs(rd.y), 0.1);
        float snap = 1.0 - smoothstep(0.3, 1.0, footprint / 12.0);
        float lod = max(0.0, log2(max(footprint, 1e-3) / 6.0));
        vec2 c = cloudCell(point, uCloudDrift[1].xy, 12.0, snap);
        float cover = textureLod(uWeatherMap, c * uWeatherScale, 0.0).b;

        if (cover <= 0.01) {
            return vec4(0.0);
        }

        float cells = textureLod(uCloudNoise, (c + uCloudDrift[1].xy) / 768.0, lod).r;
        float sheets = textureLod(uCloudNoise, (c + uCloudDrift[1].xy) / 3072.0, max(0.0, lod - 2.0)).g;
        float margin = cloudThreshold(cover) - (0.62 * cells + 0.38 * sheets);

        if (margin <= 0.0) {
            return vec4(0.0);
        }

        float dense = smoothstep(0.0, 0.3, margin);
        float alpha = (0.55 + 0.35 * dense) * cloudFade(range);

        // Widziane od spodu: cienkie brzegi jasne, środek szarzeje.
        vec3 color = uCloudShade * mix(0.95, 0.62, dense)
            + uCloudLit * uCloudLayerLit.y * mix(0.7, 0.22, dense)
            + uCloudGlow * 0.8;

        // Błysk pod chmurami średnimi (kowadło burzy) - słabszy.
        if (uStorm.y > 0.5) {
            color += uCloudFlashColor * cloudFlash(point) * 0.4;
        }

        color = mix(color, sky, cloudHaze(range));

        return vec4(color, alpha);

    }

    // Chmury wysokie (pierzaste): cienkie smugi ułożone z wiatrem.
    vec4 highClouds(vec3 ro, vec3 rd, vec3 sky) {

        vec2 point;
        float range;

        if (!cloudPlane(ro, rd, uCloudLevels.w, point, range)) {
            return vec4(0.0);
        }

        float footprint = range * uCloudView.z / max(abs(rd.y), 0.1);
        float snap = 1.0 - smoothstep(0.3, 1.0, footprint / 12.0);
        float lod = max(0.0, log2(max(footprint, 1e-3) / 6.0));
        vec2 c = cloudCell(point, uCloudDrift[1].zw, 12.0, snap);
        float cover = textureLod(uWeatherMap, c * uWeatherScale, 0.0).a;

        if (cover <= 0.01) {
            return vec4(0.0);
        }

        // Smugi leżą wzdłuż kierunku, z którego płyną chmury.
        vec2 d = c + uCloudDrift[1].zw;
        vec2 along = vec2(dot(d, uCloudFlow), dot(d, vec2(-uCloudFlow.y, uCloudFlow.x)));
        // Smugi falują w poprzek - pióra, nie proste kreski.
        along.y += 46.0 * sin(along.x / 190.0) + 22.0 * sin(along.x / 71.0 + 1.3);

        float streaks = textureLod(uCloudNoise, along / 768.0, lod).b;
        float patches = textureLod(uCloudNoise, d / 1536.0, max(0.0, lod - 1.0)).r;
        float margin = cloudThreshold(cover * 0.72) - (0.5 * streaks + 0.5 * patches);

        if (margin <= 0.0) {
            return vec4(0.0);
        }

        float dense = smoothstep(0.0, 0.36, margin);
        float alpha = (0.1 + 0.4 * dense) * cloudFade(range);
        vec3 color = uCloudShade * 0.5 + uCloudLit * uCloudLayerLit.z * 0.9 + uCloudGlow * 0.6;

        if (uStorm.y > 0.5) {
            color += uCloudFlashColor * cloudFlash(point) * 0.3;
        }

        color = mix(color, sky, cloudHaze(range) * 0.8);

        return vec4(color, alpha);

    }

    // Kurtyna deszczu: szara zasłona między ziemią a podstawą chmur tam,
    // gdzie pada. Z daleka widać ją jako smugi pod chmurą - i po tym,
    // gdzie stoi, widać, dokąd zmierza deszcz. Blisko gracza deszcz rysują
    // krople (rendering/RainStreaks.js), więc zasłona zaczyna się dalej.
    vec4 rainVeil(vec3 ro, vec3 rd, vec3 sky) {

        float flat2 = length(rd.xz);
        float reach = min((uCloudLevels.x - ro.y) / rd.y * flat2, CLOUD_REACH * 0.85);

        if (reach < 220.0) {
            return vec4(0.0);
        }

        // Pionowe smugi, pochylone z wiatrem (patrząc w poprzek wiatru).
        float azimuth = atan(rd.z, rd.x);
        float lean = uRainVeil.z * sin(azimuth - uRainVeil.y);
        vec2 grain = vec2(azimuth * 2.5464790 + rd.y * lean * 2.0, 0.37 + rd.y * 0.2);
        float streaks = textureLod(uCloudNoise, grain, 0.0).g;

        // Ile deszczu stoi na drodze promienia pod chmurami. Próbki co
        // kilkaset bloków, przesunięte inaczej w każdym kierunku - wąska
        // komórka burzowa nie wypada między nimi.
        vec2 step2 = rd.xz / max(flat2, 1e-4);
        float shift = textureLod(uCloudNoise, grain * 3.0, 0.0).a;
        float depth = 0.0;

        for (int i = 0; i < 14; i++) {
            float d = mix(140.0, reach, (float(i) + shift) / 14.0);
            depth += textureLod(uWeatherRain, (ro.xz + step2 * d) * uWeatherScale, 0.0).r;
        }

        depth *= (reach - 140.0) / 14.0;

        if (depth < 3.0) {
            return vec4(0.0);
        }

        // Stromo w górę zasłona jest cienka - zanika łagodnie (bez kręgu
        // nad głową).
        float alpha = (1.0 - exp(-depth / 380.0)) * (0.72 + 0.4 * streaks) * smoothstep(220.0, 800.0, reach);
        vec3 color = mix(uRainVeilColor, sky, 0.1);

        // Deszcz rozprasza błysk: zasłona jaśnieje razem z chmurą.
        if (uStorm.y > 0.5) {
            color += uCloudFlashColor * cloudFlash(ro.xz + step2 * min(reach, 1400.0) * 0.6) * 0.5;
        }

        return vec4(color, clamp(alpha, 0.0, 0.94));

    }

    // Tęcza (łuk 42 stopnie wokół miejsca naprzeciw słońca, siedem pasów
    // jak z klocków) i halo (pierścień 22 stopnie wokół światła).
    vec4 skyOptics(vec3 rd) {

        vec4 result = vec4(0.0);

        if (uSkyOptics.x > 0.01) {

            float angle = acos(clamp(dot(rd, -uSunDirection), -1.0, 1.0));
            float band = (angle - 0.698) / 0.07;

            if (band > 0.0 && band < 1.0) {

                // Od środka łuku: fiolet, na zewnątrz czerwień.
                float stripe = floor(band * 7.0);
                vec3 color = stripe < 0.5 ? vec3(0.56, 0.3, 0.9)
                    : stripe < 1.5 ? vec3(0.3, 0.34, 0.95)
                    : stripe < 2.5 ? vec3(0.2, 0.62, 0.95)
                    : stripe < 3.5 ? vec3(0.25, 0.85, 0.35)
                    : stripe < 4.5 ? vec3(0.98, 0.92, 0.25)
                    : stripe < 5.5 ? vec3(1.0, 0.6, 0.15)
                    : vec3(0.96, 0.22, 0.18);

                cloudOver(result, color, uSkyOptics.x * 0.42 * smoothstep(0.0, 0.05, rd.y) * (0.75 + 0.25 * sin(band * 3.14159)));

            }

        }

        if (uSkyOptics.y > 0.01) {

            float angle = acos(clamp(dot(rd, uCloudLight), -1.0, 1.0));
            float ring = exp(-pow((angle - 0.384) / 0.022, 2.0));

            cloudOver(result, uCloudLit + vec3(0.25), uSkyOptics.y * 0.3 * ring * smoothstep(0.0, 0.05, rd.y));

        }

        result.rgb /= max(result.a, 1e-4);

        return result;

    }

    // Wszystkie warstwy na promieniu z kamery w kierunku rd.
    //   przebieg 0 (uCloudView.x) - chmury nad kamerą, rysowane przed
    //     terenem (teren je zasłania),
    //   przebieg 1 - chmury pod kamerą (lot ponad chmurami), rysowane po
    //     terenie.
    vec4 cloudLayers(vec3 rd) {

        vec3 ro = uCloudCamera;
        bool below = uCloudView.x > 0.5;

        if ((rd.y > 0.0) == below || abs(rd.y) < 1e-4) {
            return vec4(0.0);
        }

        vec3 sky = skyColor(normalize(vec3(rd.x, max(rd.y, 0.0), rd.z)));
        vec4 result = vec4(0.0);

        // Kamera w środku chmury: biało dookoła.
        if (ro.y > uCloudLevels.x) {

            float inside = lowColumn(ro.xz, 0.0, 1.0) - (ro.y - uCloudLevels.x);

            if (inside > 0.0) {
                cloudOver(result, uCloudShade * 0.9 + uCloudLit * uCloudLayerLit.x * 0.25, clamp(inside / 20.0, 0.0, 0.94));
            }

        }

        // Najbliżej kamery: tęcza i halo, potem deszcz pod chmurami.
        if (!below && ro.y < uCloudLevels.x) {

            vec4 optics = skyOptics(rd);

            cloudOver(result, optics.rgb, optics.a);

            if (uRainVeil.x > 0.5) {
                vec4 veil = rainVeil(ro, rd, sky);
                cloudOver(result, veil.rgb, veil.a);
            }

        }

        // Od najbliższej warstwy do najdalszej.
        if (below) {

            if (ro.y > uCloudLevels.w) { vec4 c = highClouds(ro, rd, sky); cloudOver(result, c.rgb, c.a); }
            if (ro.y > uCloudLevels.z) { vec4 c = midClouds(ro, rd, sky); cloudOver(result, c.rgb, c.a); }
            if (ro.y > uCloudLevels.x) { vec4 c = lowClouds(ro, rd, sky); cloudOver(result, c.rgb, c.a); }

        } else {

            if (ro.y < uCloudLevels.x + uCloudLevels.y) { vec4 c = lowClouds(ro, rd, sky); cloudOver(result, c.rgb, c.a); }
            if (result.a < 0.99 && ro.y < uCloudLevels.z) { vec4 c = midClouds(ro, rd, sky); cloudOver(result, c.rgb, c.a); }
            if (result.a < 0.99 && ro.y < uCloudLevels.w) { vec4 c = highClouds(ro, rd, sky); cloudOver(result, c.rgb, c.a); }

        }

        result.rgb /= max(result.a, 1e-4);
        result.a *= uCloudView.w;

        return result;

    }
`;

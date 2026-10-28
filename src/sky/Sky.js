import * as THREE from 'three';

import { Celestial } from './Celestial.js';
import { SkyState } from './SkyColors.js';
import { skyUniforms } from './skyShader.js';
import { sampleSolarAtmosphere } from './SolarAtmosphere.js';
import { sampleNightIllumination } from './NightIllumination.js';

import { SkyDome } from './layers/SkyDome.js';
import { Moon } from './layers/Moon.js';
import { Sun } from './layers/Sun.js';
import { Stars } from './layers/Stars.js';
import { Galaxies } from './layers/Galaxies.js';
import { ShootingStars } from './layers/ShootingStars.js';
import { Planets } from './layers/Planets.js';

import { POTATO_STAR_SHARE, SHADOW_SUN_BOOST, SHADOW_AMBIENT } from '../config.js';

// ------------------------------------------------------------
// NIEBO
//
// Trzy kroki co klatkę:
//   1. Celestial  - gdzie są słońce, księżyc i gwiazdy (z czasu świata),
//   2. SkyState   - kolory nieba i światła o tej porze (SkyColors.js),
//   3. warstwy    - każda warstwa nieba ustawia się według tego stanu.
//
// Niebo ma własną scenę i kamerę (obraca się razem z kamerą gracza,
// ale stoi w miejscu), rysowaną przed światem. Teren zawsze jest
// przed niebem, a niebo nie miesza się z mgłą ani z blokami.
//
// WARSTWY to osobne klasy w src/sky/layers/ z tymi samymi metodami:
//   object                          - obiekt three.js w scenie nieba
//   update(state, celestial, dt, pixelRatio)
//   dispose()
// Nowa rzecz na niebie (meteoryty, chmury, zorza...) = nowa warstwa
// dopisana do listy w konstruktorze. Kolejność rysowania ustala
// object.renderOrder.
//
// Niebo steruje też światłem świata: światło z całego nieba
// (ambient), słońce i księżyc (światła kierunkowe). Bloki dostają
// je bez przebudowy chunków - w meshach jest tylko poziom światła
// nieba 0-15, a jego jasność i kolor zmienia się tutaj.
// ------------------------------------------------------------

// Czy tej nocy jest deszcz meteorów - mniej więcej co siódma noc,
// zawsze te same noce (liczone z numeru nocy, nie losowane).
// Noc trwa od południa do południa, więc cała ma jeden numer.

export function isMeteorShowerNight(days) {

    const night = Math.floor(days + 0.5);

    if (night < 2) {
        return false;
    }

    const hash = Math.imul(night, 2654435761) >>> 0;

    return (hash >>> 8) % 7 === 3;

}


export class Sky {

    // worldScene - scena świata, do której trafiają światła

    constructor(worldScene) {

        this.celestial = new Celestial();

        this.state = new SkyState();

        this.solarAtmosphere = false;
        this.atmosphere = null;
        this.sunLightDirection = new THREE.Vector3(0, 1, 0);


        // WARIANT NIEBA - zmiany wyglądu względem zwykłego nieba.
        // Kolor światła na blokach liczy się z kolorów nieba, więc
        // wariant zabarwia też świat. Teraz ustawiają go komendy
        // (/niebo, /ksiezyc); w przyszłości np. losowy wariant zachodu
        // na każdy dzień albo krwawy księżyc.
        //   sunsetColor  - kolor łuny wschodu/zachodu (THREE.Color albo null)
        //   moonColor    - kolor księżyca (THREE.Color albo null)
        //   meteorShower - deszcz meteorów: null = sam wybiera noce
        //                  (isMeteorShowerNight), true/false = wymuszony
        //   eclipse      - zaćmienie wymuszone komendą /zacmienie:
        //                  { cycle, latitude } (patrz Celestial.js) albo null

        this.variant = {
            sunsetColor: null,
            moonColor: null,
            meteorShower: null,
            eclipse: null
        };


        this.scene = new THREE.Scene();

        this.camera = new THREE.PerspectiveCamera(75, 1, 0.5, 1000);


        // Gdzie jest widoczny horyzont: y kierunku (0 = dokładnie
        // poziomo, ujemne = niżej). Z dalekim terenem i z wysoka brzeg
        // terenu jest trochę pod linią poziomu - ustawia to Game.
        // Słońce i księżyc chowają się dopiero pod nim.

        this.horizonDip = 0;

        // Kosmos (0-1): kamera wysoko nad ziemią - czarne niebo,
        // gwiazdy i planety (ustawia src/space/SpaceView.js).

        this.space = 0;


        this.shootingStars = new ShootingStars();

        this.galaxies = new Galaxies();

        this.stars = new Stars();

        this.planets = new Planets();

        this.layers = [
            new SkyDome(),
            new Moon(),
            this.planets,
            new Sun(),
            this.galaxies,
            this.stars,
            this.shootingStars
        ];

        for (const layer of this.layers) {
            this.scene.add(layer.object);
        }


        // Światło dla bloków. Każda scena, w której coś oświetla niebo
        // (świat, daleki teren), dostaje własny komplet świateł.

        this.lightSets = [];

        this.attachLights(worldScene);

    }


    // Dodaje do sceny światło nieba: otoczenie, słońce i księżyc
    // (ustawiane co klatkę w update).

    attachLights(scene) {

        const set = {
            ambient: new THREE.AmbientLight(),
            diffuse: new THREE.HemisphereLight(0xffffff, 0xffffff, 0),
            sun: new THREE.DirectionalLight(),
            moon: new THREE.DirectionalLight()
        };

        scene.add(set.ambient, set.diffuse, set.sun, set.moon);

        this.lightSets.push(set);

        return set;

    }


    // Tryb ziemniaka: bez Drogi Mlecznej i galaktyk, mniej gwiazd.

    setLowDetail(on) {

        this.galaxies.enabled = !on;

        this.stars.setLowDetail(on, POTATO_STAR_SHARE);

    }


    // Przelicza tylko położenie ciał niebieskich i stan nieba
    // (bez warstw i świateł) - np. dla komend, które zmieniły czas
    // i od razu chcą podać, jak wygląda niebo.

    refresh(days) {

        this.celestial.update(days, this.variant.eclipse);

        this.state.meteorShower =
            this.variant.meteorShower ?? isMeteorShowerNight(days);

        this.state.space = this.space;

        this.state.update(this.celestial, this.variant);

        this.state.solarAtmosphere = this.solarAtmosphere;
        // Tarcza pozostaje na pozycji astronomicznej. Światło częściowo
        // widocznej tarczy biegnie ze środka jej odsłoniętego fragmentu.
        this.sunLightDirection ??= new THREE.Vector3();
        this.sunLightDirection.copy(this.celestial.sunDirection);

        this.atmosphere = this.solarAtmosphere
            ? sampleSolarAtmosphere(this.celestial.sunHeight, this.state.eclipse)
            : null;

        if (this.atmosphere) {
            const state = this.state;
            const sample = this.atmosphere;
            const intensity = Math.max(...sample.direct);
            state.sunLightIntensity = intensity;
            state.sunLightColor.setRGB(...sample.direct).multiplyScalar(1 / Math.max(intensity, 1e-8));

            const horizontal = Math.hypot(this.sunLightDirection.x, this.sunLightDirection.z);
            if (horizontal > 1e-10) {
                const scale = Math.sqrt(Math.max(0, 1 - sample.lightHeight ** 2)) / horizontal;
                this.sunLightDirection.x *= scale;
                this.sunLightDirection.z *= scale;
            }
            this.sunLightDirection.y = sample.lightHeight;

            // Księżyc i słabe tło nocne są osobnymi źródłami. Nie dodajemy
            // starej krzywej zmierzchu do zmierzchu obliczonego przez atmosferę.
            sample.night = sampleNightIllumination(this.celestial.sunHeight, state.moonAmbientLight.toArray());
            sample.sky = sample.sky.map((c, i) => c + sample.night.sky[i]);
            sample.ground = sample.ground.map((c, i) => c + sample.night.ground[i]);

            // Kula planety używa jednego koloru otoczenia zamiast półkul.
            state.ambientColor.setRGB(...sample.sky.map((c, i) => (c + sample.ground[i]) * 0.5));
            state.ambientIntensity = 1;

            if (sample.discVisibility > 0 && this.space === 0) {
                state.sunDiscColor.setRGB(...sample.transmission).multiplyScalar(1 / sample.transmission[0]);
            }
        }

    }


    // days       - czas świata (WorldTime.days)
    // dt         - czas klatki w sekundach (migotanie gwiazd itp.)
    // pixelRatio - gęstość pikseli ekranu (rozmiar gwiazd)

    update(days, dt, pixelRatio = 1) {

        const celestial = this.celestial;
        const state = this.state;

        this.refresh(days);

        // W kosmosie nic nie chowa się za horyzontem - zasłania to
        // dopiero kula Ziemi (src/space/Globe.js).

        state.horizonDip = Math.min(this.horizonDip, -3 * this.space);


        // Wspólne wartości dla kopuły i mgły na blokach.

        skyUniforms.uSkyZenith.value.copy(state.zenith);
        skyUniforms.uAtmosphericLight.value = this.atmosphere ? 1 : 0;
        skyUniforms.uSkyHorizon.value.copy(state.horizon);
        skyUniforms.uSunsetColor.value.copy(state.sunsetColor);
        skyUniforms.uSunsetHigh.value.copy(state.sunsetHigh);
        skyUniforms.uSunset.value = state.sunset;
        skyUniforms.uSunDirection.value.copy(celestial.sunDirection);
        skyUniforms.uSunHalo.value.copy(state.sunHalo);
        skyUniforms.uEclipseGlow.value = state.eclipseGlow;
        skyUniforms.uEclipseGlowColor.value.copy(state.eclipseGlowColor);
        skyUniforms.uNightDesaturation.value = state.nightDesaturation;
        skyUniforms.uNightTint.value.copy(state.nightTint);
        skyUniforms.uSpace.value = this.space;
        skyUniforms.uHorizonDip.value = Math.max(-0.95, Math.min(0, this.horizonDip));


        // Światła świata.

        for (const set of this.lightSets) {

            set.ambient.color.copy(state.ambientColor);
            set.ambient.intensity = this.atmosphere ? 0 : state.ambientIntensity;
            set.diffuse.intensity = this.atmosphere ? 1 : 0;
            if (this.atmosphere) {
                set.diffuse.color.setRGB(...this.atmosphere.sky);
                set.diffuse.groundColor.setRGB(...this.atmosphere.ground);
            }

            set.sun.position.copy(this.sunLightDirection).multiplyScalar(100);
            set.sun.color.copy(state.sunLightColor);
            set.sun.intensity = state.sunLightIntensity;

            set.moon.position.copy(celestial.moonDirection).multiplyScalar(100);
            set.moon.color.copy(state.moonLightColor);
            set.moon.intensity = state.moonLightIntensity;

        }


        for (const layer of this.layers) {
            layer.update(state, celestial, dt, pixelRatio);
        }

    }


    // Z cieniami słońca (Game, amount = siła cieni 0-1) słońce i księżyc
    // świecą mocniej, a światło z całego nieba słabiej - plamy słońca
    // i cienie są wyraźniejsze. Po update (które ustawia zwykłe wartości).

    applyShadowContrast(amount) {

        if (amount <= 0 || this.atmosphere) {
            return;
        }

        const direct = 1 + (SHADOW_SUN_BOOST - 1) * amount;
        const ambient = 1 + (SHADOW_AMBIENT - 1) * amount;

        for (const set of this.lightSets) {

            set.sun.intensity *= direct;
            set.moon.intensity *= direct;
            set.ambient.intensity *= ambient;

        }

    }


    // Rysuje niebo widziane z kamery gracza (bez czyszczenia ekranu
    // przed i bez rysowania świata - to robi Game.render).

    render(renderer, camera) {

        const skyCamera = this.camera;

        camera.getWorldQuaternion(skyCamera.quaternion);

        if (
            skyCamera.fov !== camera.fov ||
            skyCamera.aspect !== camera.aspect
        ) {

            skyCamera.fov = camera.fov;
            skyCamera.aspect = camera.aspect;

            skyCamera.updateProjectionMatrix();

        }


        renderer.render(this.scene, skyCamera);

    }


    dispose() {

        for (const layer of this.layers) {
            layer.dispose();
        }

        for (const set of this.lightSets) {

            set.ambient.removeFromParent();
            set.diffuse.removeFromParent();
            set.sun.removeFromParent();
            set.moon.removeFromParent();

        }

    }

}

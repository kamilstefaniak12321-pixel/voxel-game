import * as THREE from 'three';

import { Celestial } from './Celestial.js';
import { SkyState } from './SkyColors.js';
import { skyUniforms } from './skyShader.js';

import { SkyDome } from './layers/SkyDome.js';
import { Moon } from './layers/Moon.js';
import { Sun } from './layers/Sun.js';
import { Stars } from './layers/Stars.js';
import { Galaxies } from './layers/Galaxies.js';
import { ShootingStars } from './layers/ShootingStars.js';

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


        // WARIANT NIEBA - zmiany wyglądu względem zwykłego nieba.
        // Kolor światła na blokach liczy się z kolorów nieba, więc
        // wariant zabarwia też świat. Teraz ustawiają go komendy
        // (/niebo, /ksiezyc); w przyszłości np. losowy wariant zachodu
        // na każdy dzień albo krwawy księżyc.
        //   sunsetColor  - kolor łuny wschodu/zachodu (THREE.Color albo null)
        //   moonColor    - kolor księżyca (THREE.Color albo null)
        //   meteorShower - deszcz meteorów: null = sam wybiera noce
        //                  (isMeteorShowerNight), true/false = wymuszony

        this.variant = {
            sunsetColor: null,
            moonColor: null,
            meteorShower: null
        };


        this.scene = new THREE.Scene();

        this.camera = new THREE.PerspectiveCamera(75, 1, 0.5, 1000);


        this.shootingStars = new ShootingStars();

        this.layers = [
            new SkyDome(),
            new Moon(),
            new Sun(),
            new Galaxies(),
            new Stars(),
            this.shootingStars
        ];

        for (const layer of this.layers) {
            this.scene.add(layer.object);
        }


        // Światło dla bloków.

        this.ambientLight = new THREE.AmbientLight();
        this.sunLight = new THREE.DirectionalLight();
        this.moonLight = new THREE.DirectionalLight();

        worldScene.add(this.ambientLight, this.sunLight, this.moonLight);

    }


    // Przelicza tylko położenie ciał niebieskich i stan nieba
    // (bez warstw i świateł) - np. dla komend, które zmieniły czas
    // i od razu chcą podać, jak wygląda niebo.

    refresh(days) {

        this.celestial.update(days);

        this.state.meteorShower =
            this.variant.meteorShower ?? isMeteorShowerNight(days);

        this.state.update(this.celestial, this.variant);

    }


    // days       - czas świata (WorldTime.days)
    // dt         - czas klatki w sekundach (migotanie gwiazd itp.)
    // pixelRatio - gęstość pikseli ekranu (rozmiar gwiazd)

    update(days, dt, pixelRatio = 1) {

        const celestial = this.celestial;
        const state = this.state;

        this.refresh(days);


        // Wspólne wartości dla kopuły i mgły na blokach.

        skyUniforms.uSkyZenith.value.copy(state.zenith);
        skyUniforms.uSkyHorizon.value.copy(state.horizon);
        skyUniforms.uSunsetColor.value.copy(state.sunsetColor);
        skyUniforms.uSunsetHigh.value.copy(state.sunsetHigh);
        skyUniforms.uSunset.value = state.sunset;
        skyUniforms.uSunDirection.value.copy(celestial.sunDirection);
        skyUniforms.uSunHalo.value.copy(state.sunHalo);
        skyUniforms.uNightDesaturation.value = state.nightDesaturation;
        skyUniforms.uNightTint.value.copy(state.nightTint);


        // Światła świata.

        this.ambientLight.color.copy(state.ambientColor);
        this.ambientLight.intensity = state.ambientIntensity;

        this.sunLight.position.copy(celestial.sunDirection).multiplyScalar(100);
        this.sunLight.color.copy(state.sunLightColor);
        this.sunLight.intensity = state.sunLightIntensity;

        this.moonLight.position.copy(celestial.moonDirection).multiplyScalar(100);
        this.moonLight.color.copy(state.moonLightColor);
        this.moonLight.intensity = state.moonLightIntensity;


        for (const layer of this.layers) {
            layer.update(state, celestial, dt, pixelRatio);
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

        this.ambientLight.removeFromParent();
        this.sunLight.removeFromParent();
        this.moonLight.removeFromParent();

    }

}

// Testy materiałów porównują samo światło i mgiełkę na małych próbkach.
// Od 1.11.0 teren dostaje cień chmur, a od 1.12.0 ciemnieje od deszczu
// i tonie w zasłonie deszczu - modele jeszcze nie (docs/pogoda.md, braki),
// a świat testu może akurat trafić na deszcz. Od 1.13.0 dochodzi biały
// nalot gradu i błysk burzy (teren i modele mają inne światło nieba).
// Na czas takiego testu pogoda w shaderach jest więc wyłączona; zwrócona
// funkcja przywraca wartości.
import { cloudUniforms } from '../src/weather/cloudShader.js';
import { meteorLightUniforms } from '../src/rendering/meteorLight.js';
import { skyUniforms } from '../src/sky/skyShader.js';

export function withoutWeather() {
    const before = [cloudUniforms.uWetness.value, cloudUniforms.uCloudShadow.value.x, cloudUniforms.uRainVeil.value.x,
        cloudUniforms.uHailGround.value.z, meteorLightUniforms.uMeteorSky.value];
    const flash = skyUniforms.uStormFlash.value.clone();
    const light = meteorLightUniforms.uMeteorColor.value.clone();

    cloudUniforms.uWetness.value = 0; cloudUniforms.uCloudShadow.value.x = 0; cloudUniforms.uRainVeil.value.x = 0;
    cloudUniforms.uHailGround.value.z = 0;
    skyUniforms.uStormFlash.value.setRGB(0, 0, 0);

    // Światło błysku pioruna (to samo miejsce co światło meteorytu -
    // meteorytu nie ruszamy).
    if (meteorLightUniforms.uMeteorSky.value > 0.5) {
        meteorLightUniforms.uMeteorColor.value.set(0, 0, 0);
        meteorLightUniforms.uMeteorSky.value = 0;
    }

    return () => {
        [cloudUniforms.uWetness.value, cloudUniforms.uCloudShadow.value.x, cloudUniforms.uRainVeil.value.x,
            cloudUniforms.uHailGround.value.z, meteorLightUniforms.uMeteorSky.value] = before;
        skyUniforms.uStormFlash.value.copy(flash);
        meteorLightUniforms.uMeteorColor.value.copy(light);
    };
}

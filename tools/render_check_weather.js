// Testy materiałów porównują samo światło i mgiełkę na małych próbkach.
// Od 1.11.0 teren dostaje cień chmur, a od 1.12.0 ciemnieje od deszczu
// i tonie w zasłonie deszczu - modele jeszcze nie (docs/pogoda.md, braki),
// a świat testu może akurat trafić na deszcz. Od 1.13.0 dochodzi biały
// nalot gradu i błysk burzy (teren i modele mają inne światło nieba),
// od 1.14.0 śnieg i szron, od 1.15.0 zasłona pyłu i piana sztormu na
// dalekim terenie.
// Na czas takiego testu pogoda w shaderach jest więc wyłączona; zwrócona
// funkcja przywraca wartości.
import { cloudUniforms } from '../src/weather/cloudShader.js';
import { meteorLightUniforms } from '../src/rendering/meteorLight.js';
import { skyUniforms } from '../src/sky/skyShader.js';

export function withoutWeather() {
    const before = [cloudUniforms.uWetness.value, cloudUniforms.uCloudShadow.value.x, cloudUniforms.uRainVeil.value.x,
        cloudUniforms.uHailGround.value.z, meteorLightUniforms.uMeteorSky.value];
    const snow = [cloudUniforms.uSnow.value.x, cloudUniforms.uFrost.value];
    const desert = [cloudUniforms.uDust.value.x, cloudUniforms.uSea.value.x];
    const flash = skyUniforms.uStormFlash.value.clone();
    const light = meteorLightUniforms.uMeteorColor.value.clone();

    cloudUniforms.uWetness.value = 0; cloudUniforms.uCloudShadow.value.x = 0; cloudUniforms.uRainVeil.value.x = 0;
    cloudUniforms.uHailGround.value.z = 0;
    cloudUniforms.uSnow.value.x = 0;
    cloudUniforms.uFrost.value = -2;
    cloudUniforms.uDust.value.x = 0;
    cloudUniforms.uSea.value.x = 0;
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
        [cloudUniforms.uSnow.value.x, cloudUniforms.uFrost.value] = snow;
        [cloudUniforms.uDust.value.x, cloudUniforms.uSea.value.x] = desert;
        skyUniforms.uStormFlash.value.copy(flash);
        meteorLightUniforms.uMeteorColor.value.copy(light);
    };
}

// Testy materiałów porównują samo światło i mgiełkę na małych próbkach.
// Od 1.11.0 teren dostaje cień chmur, a od 1.12.0 ciemnieje od deszczu
// i tonie w zasłonie deszczu - modele jeszcze nie (docs/pogoda.md, braki),
// a świat testu może akurat trafić na deszcz. Na czas takiego testu pogoda
// w shaderach jest więc wyłączona; zwrócona funkcja przywraca wartości.
import { cloudUniforms } from '../src/weather/cloudShader.js';

export function withoutWeather() {
    const before = [cloudUniforms.uWetness.value, cloudUniforms.uCloudShadow.value.x, cloudUniforms.uRainVeil.value.x];
    cloudUniforms.uWetness.value = 0; cloudUniforms.uCloudShadow.value.x = 0; cloudUniforms.uRainVeil.value.x = 0;
    return () => {
        [cloudUniforms.uWetness.value, cloudUniforms.uCloudShadow.value.x, cloudUniforms.uRainVeil.value.x] = before;
    };
}

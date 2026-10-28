import { LIGHT_CURVE } from '../config.js';
import { MAX_LIGHT } from '../world/Light.js';

// Ta sama krzywa poziomów co w świetle dynamicznym, ale bez klasycznego
// minimum czytelności. Brak źródła pozostaje zerem również przed gamma/AO.
export function atmosphericLightToBrightness(level) {
    return (Math.max(0, Math.min(MAX_LIGHT, level)) / MAX_LIGHT) ** LIGHT_CURVE;
}

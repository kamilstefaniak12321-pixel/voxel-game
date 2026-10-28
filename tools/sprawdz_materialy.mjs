// Referencja CPU wspólnego kontraktu. Kompilację i wygląd rzeczywistych
// materiałów sprawdza osobny test WebGL; tutaj wartości są niezależnymi
// przykładami energii liniowej, nie kopią kodu shadera.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
    load(url, context, next) {
        return next(url, url.endsWith('/src/rendering/SurfaceLighting.js')
            ? { ...context, format: 'module' } : context);
    }
});

const { composeSurfaceRadiance } = await import('../src/rendering/SurfaceLighting.js');
let checks = 0;
const closeRGB = (actual, expected, label) => {
    assert.equal(actual.length, 3, label);
    actual.forEach((value, i) => {
        assert.ok(Number.isFinite(value), `${label}: wynik nie jest skończony`);
        assert.ok(Math.abs(value - expected[i]) < 1e-12,
            `${label}, kanał ${i}: ${value} != ${expected[i]}`);
    });
    checks++;
};
const neutral = { albedo: [.2, .4, .8], natural: [0, 0, 0] };

for (const atmosphere of [false, true]) {
    closeRGB(composeSurfaceRadiance({ ...neutral, atmosphere }), [0, 0, 0], 'Brak źródeł pozostaje czarny');
    closeRGB(composeSurfaceRadiance({ ...neutral, atmosphere, natural: [.1, .2, .3] }),
        [.1, .2, .3], 'Naturalne światło już zawiera albedo i odpowiedź Lamberta');
    closeRGB(composeSurfaceRadiance({ ...neutral, atmosphere, local: [.5, 0, 0] }),
        [.1, 0, 0], 'Lampa działa bez słońca i nie dodaje obcych kanałów');
    closeRGB(composeSurfaceRadiance({ ...neutral, atmosphere, bounce: [0, .5, 0] }),
        [0, .2, 0], 'Odbicie mnoży albedo dokładnie raz');
    closeRGB(composeSurfaceRadiance({ ...neutral, atmosphere, emission: [0, 0, 7 / 15] }),
        [0, 0, 28 / 75], 'Emisja meteorytu jest liniowa, bez krzywej jasności lamp');
    closeRGB(composeSurfaceRadiance({ albedo: [0, 0, 0], natural: [0, 0, 0],
        local: [1, 1, 1], bounce: [1, 1, 1], emission: [1, 1, 1], atmosphere }),
        [0, 0, 0], 'Czarne albedo nie odzyskuje sztucznej barwy');
}

const mixed = { albedo: [.2, .4, .8], natural: [.1, .2, .3],
    local: [.25, .5, .75], bounce: [.5, .25, .125], emission: [.75, .5, .25] };
closeRGB(composeSurfaceRadiance({ ...mixed, atmosphere: true }), [.4, .7, 1.2],
    'Atmosfera sumuje niezależne źródła i zachowuje HDR powyżej 1');
closeRGB(composeSurfaceRadiance({ ...mixed, atmosphere: false }), [.2, .3, .6],
    'Klasyczny model wybiera maksimum zamiast sumy');

// Po desaturacji luminancja światła naturalnego + odbitego wynosi 0.28596.
// Lampy i własna emisja dochodzą po niej, zachowując swoje kanały RGB.
closeRGB(composeSurfaceRadiance({ ...mixed, nightDesaturation: 1, nightTint: [.5, .8, 1] }),
    [.34298, .628768, 1.08596], 'Noc odbarwia tylko światło naturalne i odbite');
closeRGB(composeSurfaceRadiance({ ...neutral, local: [.5, 0, 0], emission: [0, .5, 0],
    nightDesaturation: 1, nightTint: [0, 0, 1] }), [.1, .2, 0], 'Noc nie odbarwia lamp ani emisji');

// 0.5 sRGB to 0.21404114048223255 w liniowym RGB. Konwersja tekstury
// zachodzi przed kontraktem; połowa tej energii nie może ponownie
// przechodzić przez pow(..., 2.2), sRGB ani skalowanie Lamberta.
closeRGB(composeSurfaceRadiance({ albedo: [.21404114048223255, .21404114048223255, .21404114048223255],
    natural: [0, 0, 0], local: [.5, .5, .5] }),
    [.10702057024111628, .10702057024111628, .10702057024111628], 'Albedo i światło są już liniowe');

// Oświetlenie jest jednorodne względem energii źródeł. Nie ma ukrytego
// minimum, saturacji ani dodatkowej gammy wewnątrz wspólnej kompozycji.
for (const atmosphere of [false, true]) {
    for (const scale of [0, .125, .5, 1, 4]) {
        const scaled = { ...mixed, atmosphere, nightDesaturation: .35, nightTint: [.8, .9, 1] };
        for (const key of ['natural', 'local', 'bounce', 'emission']) scaled[key] = mixed[key].map(v => v * scale);
        const baseline = composeSurfaceRadiance({ ...mixed, atmosphere, nightDesaturation: .35, nightTint: [.8, .9, 1] });
        closeRGB(composeSurfaceRadiance(scaled), baseline.map(v => v * scale), `Skalowanie energii ${scale}, atmosfera ${atmosphere}`);
    }
}

const before = JSON.stringify(mixed);
const first = composeSurfaceRadiance(mixed);
closeRGB(composeSurfaceRadiance(mixed), first, 'Kolejne klatki nie akumulują energii');
assert.equal(JSON.stringify(mixed), before, 'Referencja nie może modyfikować uniformów wejściowych');
assert.notEqual(first, mixed.natural, 'Wynik nie może być współdzieloną tablicą źródła');

console.log(`OK: ${checks} przypadków kontraktu materiałów: ciemność, suma/maksimum, emisja, noc, liniowy kolor, energia i brak akumulacji.`);

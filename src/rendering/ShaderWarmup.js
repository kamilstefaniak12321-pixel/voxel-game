// ------------------------------------------------------------
// PROGRAMY CIENIUJĄCE PRZED GRĄ (1.1.2)
//
// Karta graficzna kompiluje program cieniujący dopiero wtedy, gdy coś
// pierwszy raz się nim rysuje - i na ten moment gra staje. Dawniej
// działo się to w pierwszej klatce świata oraz w trakcie gry: przy
// pierwszej pochodni, pierwszym deszczu, pierwszym wyrzuconym
// przedmiocie, pierwszym ognisku...
//
// Tutaj wszystkie programy powstają pod ekranem wczytywania:
//   1. prewarmScenes() prosi Three o programy dla KAŻDEGO obiektu sceny,
//      także ukrytego (deszcz, ramka celownika, kręgi na wodzie),
//   2. rzeczy, które powstają dopiero w grze (pochodnia, ognisko,
//      wyrzucony przedmiot, meteoryt), zostawiają w scenie ukryty wzór
//      z tym samym materiałem i takimi samymi atrybutami wierzchołków
//      (warmupObject) - nic nie rysuje, ale daje programowi powstać.
//
// Gdy karta umie kompilować w tle (KHR_parallel_shader_compile - prawie
// każda), programy kompilują się równolegle i gra w tym czasie nie stoi;
// czekamy tylko, aż wszystkie będą gotowe.
//
// Program zależy od: materiału, atrybutów geometrii (kolory wierzchołków,
// uv), rodzaju obiektu (siatka / linie / punkty), świateł i mgły sceny
// oraz celu rysowania (ekran albo liniowy cel HDR). Dlatego wzór musi
// mieć te same atrybuty co prawdziwy obiekt, a kompilacja odbywa się
// z tym samym celem, co prawdziwe rysowanie.
//
// Nowy efekt tworzony dopiero w grze: dodaj jego wzór przez warmupObject.
// Czy niczego nie brakuje, mówi licznik programów: lateShaderPrograms()
// (widać go też w raporcie /wydajnosc).
// ------------------------------------------------------------
import * as THREE from 'three';

// Ukryty obiekt-wzór: materiał + pusta geometria o podanych atrybutach.
// attributes: { nazwa: rozmiar } albo { nazwa: [rozmiar, znormalizowany] }.
// kind: 'mesh' | 'lines' | 'points'.
export function warmupObject(material, attributes, kind = 'mesh') {

    const geometry = new THREE.BufferGeometry();

    for (const [name, spec] of Object.entries(attributes)) {
        const [size, normalized] = Array.isArray(spec) ? spec : [spec, false];
        geometry.setAttribute(name, normalized
            ? new THREE.Uint8BufferAttribute([], size, true)
            : new THREE.Float32BufferAttribute([], size));
    }

    const object = kind === 'lines' ? new THREE.LineSegments(geometry, material)
        : kind === 'points' ? new THREE.Points(geometry, material)
        : new THREE.Mesh(geometry, material);

    object.visible = false;
    object.frustumCulled = false;
    object.matrixAutoUpdate = false;
    object.name = 'shader-warmup';
    object.userData.shaderWarmup = true;

    return object;

}

// Atrybuty modeli z ModelMaterial (ręka, przedmioty, pochodnia).
export const MODEL_ATTRIBUTES = { position: 3, normal: 3, uv: 2, surfaceProfile: 2 };
export const COLORED_MODEL_ATTRIBUTES = { position: 3, normal: 3, uv: 2, color: 3, surfaceProfile: 2 };


// Programy materiałów (Three trzyma je przy materiale; przezroczysty
// dwustronny ma dwa: tył i przód).
function programsOf(renderer, materials) {

    const programs = new Set();

    for (const material of materials) {
        const stored = renderer.properties.get(material).programs;
        if (stored) for (const program of stored.values()) programs.add(program);
    }

    return programs;

}

// jobs: [{ scene, camera, targetScene? }] - sceny rysowane do renderTarget.
// Zwraca liczbę przygotowanych programów.
export async function prewarmScenes(renderer, jobs, renderTarget = null) {

    const previous = renderer.getRenderTarget();
    const face = renderer.getActiveCubeFace?.() ?? 0;
    const level = renderer.getActiveMipmapLevel?.() ?? 0;
    const viewport = renderer.getViewport(new THREE.Vector4());
    const scissor = renderer.getScissor(new THREE.Vector4());
    const scissorTest = renderer.getScissorTest();

    const materials = new Set();

    try {
        // Cel ustawiamy tylko na czas zgłoszenia programów (to dzieje się
        // od razu); czekanie na kompilację nie trzyma już stanu renderera.
        renderer.setRenderTarget(renderTarget);
        for (const { scene, camera, targetScene } of jobs) {
            if (!scene || !camera) continue;
            for (const material of renderer.compile(scene, camera, targetScene ?? null)) materials.add(material);
        }
    }
    finally {
        renderer.setRenderTarget(previous, face, level);
        renderer.setViewport(viewport);
        renderer.setScissor(scissor);
        renderer.setScissorTest(scissorTest);
    }

    const programs = programsOf(renderer, materials);

    // Kompilacja w tle: pytamy, nie blokując. Bez rozszerzenia isReady()
    // od razu mówi "tak", a czekanie następuje niżej, w getUniforms -
    // dalej pod ekranem wczytywania.
    const deadline = performance.now() + 20000;
    while ([...programs].some((program) => !program.isReady()) && performance.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 8));
    }

    // Kończy przygotowanie programu (adresy uniformów i atrybutów), żeby
    // pierwsze rysowanie nie miało już nic do zrobienia.
    for (const program of programs) {
        try { program.getUniforms(); } catch (error) { console.warn('Program cieniujący: błąd przygotowania', error); }
    }

    return programs.size;

}


// LICZNIK: ile programów powstało dopiero w trakcie gry (po przygotowaniu).
// Każdy taki to krótkie przycięcie - i brakujący wzór do dopisania.
const counters = new WeakMap();

export function markShadersReady(renderer) {
    counters.set(renderer, renderer.info.programs?.length ?? 0);
}

export function lateShaderPrograms(renderer) {
    const ready = counters.get(renderer);
    return ready === undefined ? 0 : Math.max(0, (renderer.info.programs?.length ?? 0) - ready);
}

import * as THREE from 'three';

import {
    CHUNK_HEIGHT,
    WORLD_BORDER,
    GRAVITY,
    MOVE_SPEED,
    JUMP_SPEED,
    MAX_FALL_SPEED,
    MOUSE_SENSITIVITY,
    CROUCH_SPEED_FACTOR,
    CROUCH_HEIGHT,
    CROUCH_EYE_HEIGHT,
    SPRINT_SPEED_FACTOR,
    SPRINT_DOUBLE_TAP,
    WATER_SPEED_FACTOR,
    RIVER_PUSH,
    WATER_GRAVITY_FACTOR,
    WATER_DRAG,
    WATER_FLOAT_START,
    WATER_FLOAT_SUBMERGED,
    WATER_SWIM_SUBMERGED,
    WATER_FLOAT_DRAG,
    SWIM_DOWN_ACCELERATION,
    WATER_CLIMB_SPEED,
    SEA_LEVEL,
    FLY_BOOST_START,
    FLY_BOOST_BLOCKS,
    SPACE_MAX_ALTITUDE,
    SKYFALL_START,
    SKYFALL_SPEED,
    SKYFALL_SPEED_PER_BLOCK,
    SKYFALL_MAX_SPEED
} from '../config.js';

import { isLiquidId, isFallingWaterId } from '../blocks/BlockRegistry.js';
import { waterSurfaceHeight } from '../world/WaterSurface.js';

// Maksymalna odległość pokonywana w jednym kroku kolizji.
// Szybszy ruch jest dzielony na kilka krótszych kroków,
// żeby gracz nie mógł "przeskoczyć" przez blok.

const MAX_STEP_DISTANCE = 0.25;

// Malutki odstęp zostawiany między graczem a blokiem,
// żeby błędy zaokrągleń nie wciskały gracza w ścianę.

const COLLISION_EPSILON = 0.0001;

// Najwyższy stopień, na który się wchodzi bez skoku (schody, półbloki).
const STEP_HEIGHT = 0.5 + 0.01;

const FULL_BLOCK = [[0, 0, 0, 1, 1, 1]];

// Ile razy szybciej gracz porusza się w locie (/latanie).

const FLY_SPEED_FACTOR = 2;

// Wzrost i wysokość oczu stojącego gracza.

const STAND_HEIGHT = 1.8;
const STAND_EYE_HEIGHT = 1.6;


function clamp01(value) {

    return Math.max(0, Math.min(1, value));

}


// Ile razy szybszy jest lot w pionie na wysokości y (1 przy ziemi).

export function flyBoost(y) {

    return 1 + Math.max(0, y - FLY_BOOST_START) / FLY_BOOST_BLOCKS;

}


// Prędkość spadania z kosmosu na wysokości y (bloki na sekundę).

export function skyfallSpeed(y) {

    return Math.min(
        SKYFALL_MAX_SPEED,
        SKYFALL_SPEED + SKYFALL_SPEED_PER_BLOCK * Math.max(0, y - SEA_LEVEL)
    );

}

export class Player {

    constructor(world, camera) {

        this.world = world;
        this.camera = camera;


        this.pos = new THREE.Vector3();

        this.vel = new THREE.Vector3();


        this.width = 0.6;
        this.height = STAND_HEIGHT;
        this.eyeHeight = STAND_EYE_HEIGHT;


        // Kucanie (Shift) i bieg (dwa razy W albo R).

        this.crouching = false;
        this.sprinting = false;

        // Bieg włączony dwuklikiem W trwa, dopóki W jest wciśnięte.
        this.sprintLatched = false;
        this.lastForwardPress = -Infinity;
        this.clock = 0;

        // Po uderzeniu w ścianę bieg na chwilę się wyłącza (sekundy).
        this.sprintPause = 0;

        // Prędkość, z jaką gracz właśnie wylądował (0 = nie lądował
        // w tej klatce) - dla animacji.
        this.landed = 0;

        // Prędkość ruchu w tej chwili (bloki/s) - dla animacji.
        this.moveSpeed = MOVE_SPEED;


        this.yaw = 0;
        this.pitch = 0;


        this.onGround = false;


        // Czułość myszy i odwrócona oś Y (ustawienia gracza).

        this.mouseSensitivity = MOUSE_SENSITIVITY;

        this.invertMouse = false;


        // Do testowania (komendy /latanie i /predkosc).

        this.flying = false;

        // Tryb kreatywny: dwa razy Spacja włącza i wyłącza latanie
        // (ustawia Game). Lądowanie na ziemi kończy lot.
        this.canFly = false;
        this.lastJumpPress = -Infinity;

        this.speedMultiplier = 1;


        // Woda (updateWater):
        //   submerged - jaka część ciała jest w wodzie (0 - sucho, 1 - cały),
        //   swimming  - pływa (głęboko w wodzie i nie stoi na dnie),
        //   splash    - wpadł do wody w tej klatce: z jaką prędkością
        //               (0 = nie), dla dźwięku plusku,
        //   leftWater - wyszedł z wody w tej klatce.
        this.submerged = 0;
        // Struga spadająca zwilża ciało, ale sama nie podtrzymuje go
        // przy tafli. Spacja nadal pozwala świadomie płynąć w niej w górę.
        this.buoyantSubmerged = 0;
        this.waterCellY = null;
        this.swimming = false;
        this.splash = 0;
        this.leftWater = false;

        // Nurt rzeki: [x, z] (bloki/s) w tej klatce albo null; jak mocno
        // niesie gracza (/rzeka nurt).
        this.current = null;
        this.riverPush = RIVER_PUSH;
        this.riverDistance = 0;

        // Czy w ostatniej klatce gracz oparł się o ścianę (wyjście
        // z wody na brzeg).
        this.touchingWall = false;


        // Spadanie z kosmosu (patrz updateSkyfall):
        //   skyfall       - spada jak meteoryt,
        //   skyfallImpact - uderzył w ziemię w tej klatce:
        //                   { speed, x, y, z } albo null (krater robi
        //                   src/space/Skyfall.js),
        //   skyfallSplash - wpadł z kosmosu do wody w tej klatce
        //                   (prędkość, 0 = nie).
        this.skyfall = false;
        this.skyfallImpact = null;
        this.skyfallSplash = 0;


        this.spawn();

    }

// Ustawia gracza na powierzchni terenu w miejscu startu.

spawn() {

    // Miejsce startu świata (World.spawnPoint - środek bloku).

    const { x, z } = this.world.spawnPoint;


    // Chunk w miejscu startu musi istnieć, żeby znaleźć powierzchnię.

    this.world.ensureColumnLoaded(x, z);


    // Na ziemi - nie na koronie drzewa.

    this.pos.set(
        x,
        this.world.getGroundY(
            Math.floor(x),
            Math.floor(z)
        ),
        z
    );


    this.vel.set(0, 0, 0);

    this.skyfall = false;

}

updateLook(input) {

    const mouse = input.consumeMouseDelta();


    // Odwrócona mysz (ustawienie): ruch w górę = patrzenie w dół.

    const vertical = this.invertMouse ? -1 : 1;

    this.yaw -= mouse.x * this.mouseSensitivity;
    this.pitch -= mouse.y * this.mouseSensitivity * vertical;


    const maxPitch = Math.PI / 2 - 0.01;


    this.pitch = Math.max(
        -maxPitch,
        Math.min(maxPitch, this.pitch)
    );

}

collidesAt(pos) {

    return this.collisionExtent(pos, null, 0) !== null;

}


// Kolizje z pudełkami bloków (0.90.0: schody, półbloki, płoty 1,5 bloku
// - World.collisionBoxes). Zwraca null (wolne) albo - dla osi - najbliższą
// ścianę pudełka w kierunku ruchu: dla direction > 0 najmniejsze min,
// dla direction < 0 największe max. Bez osi - true przy pierwszej kolizji.

collisionExtent(pos, axis, direction) {

    const half = this.width / 2;

    const minX = pos.x - half, maxX = pos.x + half;
    const minY = pos.y, maxY = pos.y + this.height;
    const minZ = pos.z - half, maxZ = pos.z + half;

    const index = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    let extent = null;

    // Płot sięga 1,5 bloku - sprawdzamy też warstwę pod stopami.
    for (let x = Math.floor(minX); x <= Math.floor(maxX); x++) {

        for (let y = Math.floor(minY) - 1; y <= Math.floor(maxY); y++) {

            for (let z = Math.floor(minZ); z <= Math.floor(maxZ); z++) {

                const boxes = this.world.collisionBoxes
                    ? this.world.collisionBoxes(x, y, z)
                    : (this.world.isSolid(x, y, z) ? FULL_BLOCK : null);

                if (!boxes) continue;

                for (const box of boxes) {

                    if (maxX > x + box[0] && minX < x + box[3] &&
                        maxY > y + box[1] && minY < y + box[4] &&
                        maxZ > z + box[2] && minZ < z + box[5]) {

                        if (!axis) return true;

                        const origin = index === 0 ? x : index === 1 ? y : z;
                        const value = direction > 0 ? origin + box[index] : origin + box[index + 3];

                        extent = extent === null ? value
                            : direction > 0 ? Math.min(extent, value) : Math.max(extent, value);

                    }

                }

            }

        }

    }

    return extent;

}

intersectsBlock(x, y, z) {

    const half =
        this.width / 2;


    const playerMinX =
        this.pos.x - half;

    const playerMaxX =
        this.pos.x + half;


    const playerMinY =
        this.pos.y;

    const playerMaxY =
        this.pos.y + this.height;


    const playerMinZ =
        this.pos.z - half;

    const playerMaxZ =
        this.pos.z + half;


    const blockMinX = x;
    const blockMaxX = x + 1;

    const blockMinY = y;
    const blockMaxY = y + 1;

    const blockMinZ = z;
    const blockMaxZ = z + 1;


    return (

        playerMaxX > blockMinX &&
        playerMinX < blockMaxX &&

        playerMaxY > blockMinY &&
        playerMinY < blockMaxY &&

        playerMaxZ > blockMinZ &&
        playerMinZ < blockMaxZ

    );

}

updateMovement(dt, input) {

    const forward = new THREE.Vector3(
        -Math.sin(this.yaw),
        0,
        -Math.cos(this.yaw)
    );


    const right = new THREE.Vector3(
        Math.cos(this.yaw),
        0,
        -Math.sin(this.yaw)
    );


    const move = new THREE.Vector3();


    if (input.isKeyDown('KeyW')) {
        move.add(forward);
    }

    if (input.isKeyDown('KeyS')) {
        move.sub(forward);
    }

    if (input.isKeyDown('KeyD')) {
        move.add(right);
    }

    if (input.isKeyDown('KeyA')) {
        move.sub(right);
    }


    if (move.lengthSq() > 0) {
        move.normalize();
    }


    this.updateStance(input);


    // Woda (w locie nie przeszkadza): 0 - sucho, 1 - cały w wodzie.

    const water = this.flying ? 0 : this.submerged;

    // Od kolan w górę woda spowalnia (w pełni od piersi).

    const wade = clamp01((water - 0.15) / 0.5);


    // Prędkość: zwykła razy mnożnik z komendy /predkosc,
    // w locie dwa razy szybciej, kucając wolniej, biegnąc szybciej,
    // w wodzie wolniej.

    const speed =
        MOVE_SPEED *
        this.speedMultiplier *
        (this.flying ? FLY_SPEED_FACTOR : 1) *
        (this.crouching ? CROUCH_SPEED_FACTOR : 1) *
        (this.sprinting ? SPRINT_SPEED_FACTOR : 1) *
        (1 + (WATER_SPEED_FACTOR - 1) * wade);

    this.moveSpeed = speed;

    this.vel.x = move.x * speed;
    this.vel.z = move.z * speed;


    // Nurt rzeki niesie gracza - tym mocniej, im głębiej jest w wodzie
    // (po kolana prawie wcale). Pod prąd da się płynąć tylko tam, gdzie
    // nurt jest wolny.

    this.current = null;

    if (water > 0.1) {

        const x = Math.floor(this.pos.x), z = Math.floor(this.pos.z);
        const y = this.waterCellY ?? Math.floor(this.pos.y + Math.min(this.height, water * STAND_HEIGHT) / 2);
        const flow = this.world.getWaterFlow
            ? this.world.getWaterFlow(x, y, z)
            : this.world.getFlow?.(x, z);

        if (flow) {

            const push = this.riverPush * clamp01((water - 0.1) / 0.5);

            this.vel.x += flow[0] * push;
            this.vel.z += flow[1] * push;

            this.current = flow;

            // Ile bloków poniósł gracza nurt (osiągnięcie "Spływ").

            this.riverDistance += Math.hypot(flow[0], flow[1]) * push * dt;

        }

    }


    // Latanie (komenda /latanie): bez grawitacji,
    // Spacja - w górę, Shift - w dół.

    if (this.flying) {

        let vertical = 0;

        if (input.isKeyDown('Space')) {
            vertical += 1;
        }

        if (input.isKeyDown('ShiftLeft') || input.isKeyDown('ShiftRight')) {
            vertical -= 1;
        }

        // Wysoko lot w pionie przyspiesza (do kosmosu i z powrotem).

        this.vel.y = vertical * speed * flyBoost(this.pos.y);

        this.skyfall = false;

        return;

    }



    const space = input.isKeyDown('Space');


    if (water > 0) {

        this.updateSwimming(dt, water, space, input);

        return;

    }


    // Z kosmosu spada się jak meteoryt.

    if (this.pos.y > SKYFALL_START) {
        this.skyfall = true;
    }

    if (this.skyfall) {

        this.updateSkyfall(dt);

        return;

    }


    this.vel.y += GRAVITY * dt;


    // Limit prędkości spadania.

    if (this.vel.y < -MAX_FALL_SPEED) {
        this.vel.y = -MAX_FALL_SPEED;
    }


    if (
        space &&
        this.onGround
    ) {

        this.vel.y = JUMP_SPEED;

        this.onGround = false;

    }

}


// Spadanie z kosmosu: prędkość graniczna zależy od wysokości - w górze
// kilkaset bloków na sekundę, przy ziemi mniej (gęstsze powietrze),
// ale wciąż jak meteoryt. Na początku gracz szybko się rozpędza,
// a niżej zwalnia razem z prędkością graniczną.

updateSkyfall(dt) {

    const terminal = skyfallSpeed(this.pos.y);

    const acceleration = -GRAVITY + terminal * 0.5;

    this.vel.y = Math.max(this.vel.y - acceleration * dt, -terminal);

}


// Ruch w pionie w wodzie (water - jaka część ciała jest zanurzona):
//   - wyporność podtrzymuje gracza z oczami nad taflą,
//   - Spacja - płynie trochę wyżej, także świadomie w spadającej wodzie,
//   - Shift - nurkuje,
//   - Spacja przy ścianie brzegu - wybicie w górę (wyjście z wody),
//   - w płytkiej wodzie (do pasa) Spacja to zwykły skok z dna.

updateSwimming(dt, water, space, input) {

    if (space && this.onGround && water < 0.6) {

        this.vel.y = JUMP_SPEED;

        this.onGround = false;

        return;

    }

    const deep = clamp01(water / 0.5);
    const shift = input.isKeyDown('ShiftLeft') || input.isKeyDown('ShiftRight');
    // Automatycznie podtrzymuje tylko spokojna i rozlana woda. Woda
    // falling pozostaje w pomiarze oporu, plusku i świadomego pływania.
    const support = space ? water : this.buoyantSubmerged;
    const floating = !shift && support > WATER_FLOAT_START;
    let acceleration = GRAVITY * (1 + (WATER_GRAVITY_FACTOR - 1) * deep);

    if (floating) {
        const target = space ? WATER_SWIM_SUBMERGED : WATER_FLOAT_SUBMERGED;
        acceleration += -GRAVITY * WATER_GRAVITY_FACTOR
            * (support - WATER_FLOAT_START) / (target - WATER_FLOAT_START);
    }

    if (shift && water > 0.5) {
        acceleration -= SWIM_DOWN_ACCELERATION;
    }

    // Dokładny krok prędkości dla stałej siły i oporu liniowego.
    // Wyporność i ciężar muszą wejść do tego samego kroku: dodawanie
    // jednej siły dopiero po tłumieniu przesuwa równowagę wraz z FPS.
    const drag = (floating ? WATER_FLOAT_DRAG : WATER_DRAG) * deep;
    const decay = Math.exp(-drag * dt);
    const response = drag > 0 ? -Math.expm1(-drag * dt) / drag : dt;
    this.vel.y = this.vel.y * decay + acceleration * response;

    if (space && !shift && this.touchingWall && water > 0.2) {
        this.vel.y = Math.max(this.vel.y, WATER_CLIMB_SPEED);
    }

}


// Wysokość powierzchni wody nad stopami gracza (w kolumnie, w której
// stoi), albo -Infinity, gdy przy jego ciele nie ma wody.

waterLevel() {

    const world = this.world;

    const x = Math.floor(this.pos.x);
    const z = Math.floor(this.pos.z);

    const top = Math.floor(this.pos.y + this.height);

    let y = Math.floor(this.pos.y);

    while (y <= top && !isLiquidId(world.getBlockId(x, y, z))) {
        y++;
    }

    if (y > top) {
        return -Infinity;
    }

    while (isLiquidId(world.getBlockId(x, y + 1, z))) {
        y++;
    }

    // Ten sam trójkąt tafli co w siatce: także cienka struga, spadek
    // między poziomami i pełny słup spadającej wody.
    return y + waterSurfaceHeight(world, x, y, z, this.pos.x - x, this.pos.z - z);

}


// Ile gracza jest w wodzie (submerged) i czy pływa.

updateWater() {

    const x = Math.floor(this.pos.x), z = Math.floor(this.pos.z);
    const top = this.pos.y + this.height;
    let depth = 0, buoyantDepth = 0;
    this.waterCellY = null;

    // Liczymy tylko część ciała rzeczywiście przecinającą wodę.
    // Powietrze pod wiszącą strugą nie daje wyporności ani nurtu.
    for (let y = Math.floor(this.pos.y); y < top; y++) {
        const id = this.world.getBlockId(x, y, z);
        if (!isLiquidId(id)) continue;
        const surface = y + waterSurfaceHeight(this.world, x, y, z, this.pos.x - x, this.pos.z - z);
        const wet = Math.max(0, Math.min(top, surface) - Math.max(this.pos.y, y));
        if (wet > 0 && this.waterCellY === null) this.waterCellY = y;
        depth += wet;
        if (!isFallingWaterId(id)) buoyantDepth += wet;
    }

    this.submerged = clamp01(depth / STAND_HEIGHT);
    this.buoyantSubmerged = clamp01(buoyantDepth / STAND_HEIGHT);

    this.swimming = !this.flying && this.submerged > 0.6 && !this.onGround;

}

// Kucanie i bieg z klawiszy.
//   Shift - kucanie (w locie Shift to "w dół", więc wtedy nie kuca),
//   dwa razy W albo przytrzymane R (razem z W) - bieg.

updateStance(input) {

    // Latanie w trybie kreatywnym: dwa razy Spacja (w krótkim odstępie).

    if (input.consumeKeyPress('Space')) {

        if (this.canFly && this.clock - this.lastJumpPress < SPRINT_DOUBLE_TAP) {

            this.flying = !this.flying;

            this.vel.y = 0;

            this.lastJumpPress = -Infinity;

        }
        else {

            this.lastJumpPress = this.clock;

        }

    }


    const shift = input.isKeyDown('ShiftLeft') || input.isKeyDown('ShiftRight');

    const forward = input.isKeyDown('KeyW');


    // Kucanie. Wstać można tylko, gdy nad głową jest miejsce.
    // Głęboko w wodzie Shift to nurkowanie, nie kucanie.

    if (shift && !this.flying && this.submerged < 0.5) {

        this.crouching = true;

        this.height = CROUCH_HEIGHT;

    }
    else if (this.crouching) {

        this.height = STAND_HEIGHT;

        if (this.collidesAt(this.pos)) {
            this.height = CROUCH_HEIGHT;
        }
        else {
            this.crouching = false;
        }

    }


    // Bieg: dwuklik W (w krótkim odstępie) albo R.

    if (input.consumeKeyPress('KeyW')) {

        if (this.clock - this.lastForwardPress < SPRINT_DOUBLE_TAP) {
            this.sprintLatched = true;
        }

        this.lastForwardPress = this.clock;

    }

    if (!forward) {
        this.sprintLatched = false;
    }

    this.sprinting =
        forward &&
        !this.crouching &&
        this.sprintPause <= 0 &&
        (this.sprintLatched || input.isKeyDown('KeyR'));

}

resolveMovement(dt) {

    // Kucając na ziemi nie da się spaść z krawędzi (jak w Minecrafcie).

    this.edgeGuard = this.crouching && this.onGround && !this.flying;

    // Wejście na stopień - tylko z ziemi (nie w locie, nie w skoku).
    this.stepReady = this.onGround && !this.flying && this.vel.y <= 0;

    this.onGround = false;

    this.touchingWall = false;


    // Przy dużej prędkości (albo niskim FPS) dzielimy ruch
    // na kilka krótszych kroków.

    const maxSpeed = Math.max(
        Math.abs(this.vel.x),
        Math.abs(this.vel.y),
        Math.abs(this.vel.z)
    );

    const steps = Math.max(
        1,
        Math.ceil(maxSpeed * dt / MAX_STEP_DISTANCE)
    );

    const stepDt = dt / steps;


    for (let i = 0; i < steps; i++) {

        // X

        if (this.moveAxis('x', this.vel.x * stepDt)) {

            this.touchingWall ||= this.vel.x !== 0;

            this.vel.x = 0;

        }


        // Z

        if (this.moveAxis('z', this.vel.z * stepDt)) {

            this.touchingWall ||= this.vel.z !== 0;

            this.vel.z = 0;

        }


        // Y

        if (this.moveAxis('y', this.vel.y * stepDt)) {

            if (this.vel.y < 0) {

                this.onGround = true;

            }


            this.vel.y = 0;

        }

    }


    // Wyżej niż SPACE_MAX_ALTITUDE nie da się polecieć.

    if (this.pos.y > SPACE_MAX_ALTITUDE) {

        this.pos.y = SPACE_MAX_ALTITUDE;

        this.vel.y = Math.min(this.vel.y, 0);

    }


    // Granica świata - dalej nie da się przejść.

    const limit = WORLD_BORDER - this.width / 2;

    this.pos.x = Math.min(limit, Math.max(-limit, this.pos.x));
    this.pos.z = Math.min(limit, Math.max(-limit, this.pos.z));

}

// Przesuwa gracza wzdłuż jednej osi ('x', 'y' albo 'z').
// Przy zderzeniu dosuwa go do krawędzi bloku i zwraca true.

moveAxis(axis, delta) {

    if (delta === 0) {
        return false;
    }


    const oldValue = this.pos[axis];

    this.pos[axis] = oldValue + delta;


    if (!this.collidesAt(this.pos)) {

        // Kucanie: ruch w bok, po którym pod stopami nie byłoby
        // żadnego bloku, jest zatrzymany (jak zderzenie).

        if (axis !== 'y' && this.edgeGuard && !this.hasGroundBelow()) {

            this.pos[axis] = oldValue;

            return true;

        }

        return false;

    }


    // Schody i półbloki (0.90.0): na ziemi gracz wchodzi na stopień do
    // pół bloku bez skakania (jak w Minecrafcie). Pełny blok wymaga skoku.

    if (axis !== 'y' && this.stepReady) {

        const y = this.pos.y;

        // Najwyższa ściana pudełek, w które weszliśmy - stopień.
        const top = this.collisionExtent(this.pos, 'y', -1);

        if (top !== null && top - y <= STEP_HEIGHT) {

            this.pos.y = top + COLLISION_EPSILON;

            if (!this.collidesAt(this.pos)) {
                this.stepped = true;
                return false;
            }

        }

        this.pos.y = y;

    }

    // Odległość od pozycji gracza do krawędzi jego "pudełka":
    // w poziomie pozycja jest na środku, w pionie przy stopach.

    const toMin =
        axis === 'y'
            ? 0
            : this.width / 2;

    const toMax =
        axis === 'y'
            ? this.height
            : this.width / 2;


    let snapped;


    // Ściana pudełka, w które wszedł gracz (pełny blok - granica bloku,
    // schody i półbloki - ich ściana).

    const wall = this.collisionExtent(this.pos, axis, delta);

    if (delta > 0) {

        // Przednia krawędź gracza weszła w blok -
        // ustawiamy ją tuż przed ścianą.

        snapped = wall - toMax - COLLISION_EPSILON;

        snapped = Math.max(oldValue, snapped);

    }

    else {

        snapped = wall + toMin + COLLISION_EPSILON;

        snapped = Math.min(oldValue, snapped);

    }


    this.pos[axis] = snapped;


    // Zabezpieczenie: gdyby dosunięcie nadal kolidowało,
    // wracamy na starą pozycję (tak jak dawniej).

    if (this.collidesAt(this.pos)) {

        this.pos[axis] = oldValue;

    }


    return true;

}

// Czy pod stopami (w obrysie gracza) jest jakiś blok z kolizją.

hasGroundBelow() {

    // Pod stopami (do 0,05 niżej) jest pudełko jakiegoś bloku.
    return this.collidesAt({ x: this.pos.x, y: this.pos.y - 0.05, z: this.pos.z });

}

// Stan gracza do zapisania w świecie.

getState() {

    return {

        x: this.pos.x,
        y: this.pos.y,
        z: this.pos.z,

        yaw: this.yaw,
        pitch: this.pitch,

        flying: this.flying

    };

}


// Przywraca stan gracza z zapisu.

setState(state) {

    const values = [
        state?.x,
        state?.y,
        state?.z,
        state?.yaw,
        state?.pitch
    ];


    // Uszkodzony zapis - zostajemy w miejscu startu.

    if (!values.every(Number.isFinite)) {
        return false;
    }


    this.pos.set(state.x, state.y, state.z);

    this.yaw = state.yaw;
    this.pitch = state.pitch;

    // Stare zapisy nie mają tego pola. Komenda /latanie działa też
    // w przygodzie, więc stan lotu nie zależy od canFly.
    this.flying = state.flying === true;

    this.vel.set(0, 0, 0);


    this.ensureRestoredPositionClear();

    this.updateCamera();

    return true;

}

// Zmiana generatora może zasypać niezapisane wcześniej koryto, w którym
// gracz zakończył grę. Sprawdzamy faktyczne bloki, również zapisane
// budowle i wykopy. Wolna pozycja w jaskini pozostaje bez zmian.
ensureRestoredPositionClear() {

    const half = this.width / 2;

    // Game wczytuje otoczenie przed setState. Te cztery narożniki
    // gwarantują pełny obrys także na granicy chunków; brak chunka nie
    // może zostać pomylony z wolnym powietrzem.
    for (const x of [this.pos.x - half, this.pos.x + half]) {
        for (const z of [this.pos.z - half, this.pos.z + half]) {
            this.world.ensureColumnLoaded(x, z);
        }
    }

    if (!this.collidesAt(this.pos)) {
        return;
    }

    const savedY = this.pos.y;

    // Pierwsze wolne miejsce nad zapisaną pozycją, bez kopania bloków
    // i bez przenoszenia na dach, jeśli wcześniej jest wolna komora.
    // Ponad limitem budowania nie ma już bloków; pętla jest ograniczona.
    for (let y = Math.max(0, Math.floor(savedY) + 1); y <= CHUNK_HEIGHT; y++) {
        this.pos.y = y;
        if (!this.collidesAt(this.pos)) {
            return;
        }
    }

    this.pos.y = savedY;

}

checkRespawn() {

    if (this.pos.y >= -30) {
        return;
    }


    this.spawn();

}

updateCamera() {

    this.camera.position.set(
        this.pos.x,
        this.pos.y + this.eyeHeight,
        this.pos.z
    );


    this.camera.rotation.order = 'YXZ';

    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

}

update(dt, input) {

    this.clock += dt;

    this.splash = 0;
    this.leftWater = false;
    this.skyfallImpact = null;
    this.skyfallSplash = 0;

    const wasSubmerged = this.submerged;

    this.updateWater();

    this.updateLook(input);

    this.updateMovement(dt, input);


    // Lądowanie (dla animacji): prędkość spadania tuż przed dotknięciem ziemi.

    const wasOnGround = this.onGround;
    const fallSpeed = -this.vel.y;

    const horizontal = Math.hypot(this.vel.x, this.vel.z);

    this.resolveMovement(dt);

    this.landed = !wasOnGround && this.onGround && !this.flying ? Math.max(0, fallSpeed) : 0;


    // Wejście do wody (plusk - tym głośniejszy, im szybciej) i wyjście.

    this.updateWater();

    if (!this.flying && wasSubmerged < 0.05 && this.submerged >= 0.05) {
        this.splash = Math.max(0.5, fallSpeed, horizontal * 0.4);
    }


    // Koniec spadania z kosmosu: wpadnięcie do wody (woda szybko
    // hamuje - także gdy w tej samej klatce sięgnął płytkiego dna)
    // albo uderzenie w ziemię (krater).

    if (this.skyfall && this.submerged > 0) {

        this.skyfall = false;

        this.skyfallSplash = Math.max(0, fallSpeed);

        this.vel.y = Math.max(this.vel.y, -12);

    }
    else if (this.skyfall && this.onGround) {

        this.skyfall = false;

        this.skyfallImpact = {
            speed: Math.max(0, fallSpeed),
            x: Math.floor(this.pos.x),
            y: Math.floor(this.pos.y + 0.01),
            z: Math.floor(this.pos.z)
        };

    }

    if (wasSubmerged > 0.25 && this.submerged < 0.02) {
        this.leftWater = true;
    }


    // Lot w trybie kreatywnym kończy się po zejściu na ziemię.

    if (this.flying && this.canFly && this.onGround) {
        this.flying = false;
    }


    // Bieg kończy się na ścianie (i przez chwilę nie wraca, nawet z R).

    this.sprintPause -= dt;

    if (this.sprinting && horizontal > 0 && Math.hypot(this.vel.x, this.vel.z) < horizontal * 0.5) {

        this.sprintLatched = false;
        this.sprinting = false;
        this.sprintPause = 0.4;

    }

    this.checkRespawn();


    // Oczy płynnie zjeżdżają w dół przy kucaniu i wracają przy wstawaniu.

    const eyeTarget = this.crouching ? CROUCH_EYE_HEIGHT : STAND_EYE_HEIGHT;

    this.eyeHeight += (eyeTarget - this.eyeHeight) * Math.min(1, dt * 14);

    this.updateCamera();

}

}

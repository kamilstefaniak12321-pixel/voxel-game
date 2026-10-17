import * as THREE from 'three';

import {
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
    WATER_SURFACE,
    WATER_SPEED_FACTOR,
    WATER_GRAVITY_FACTOR,
    WATER_DRAG,
    SWIM_UP_ACCELERATION,
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

import {
    isLiquidId,
    isOpaqueId
} from '../blocks/BlockRegistry.js';

// Maksymalna odległość pokonywana w jednym kroku kolizji.
// Szybszy ruch jest dzielony na kilka krótszych kroków,
// żeby gracz nie mógł "przeskoczyć" przez blok.

const MAX_STEP_DISTANCE = 0.25;

// Malutki odstęp zostawiany między graczem a blokiem,
// żeby błędy zaokrągleń nie wciskały gracza w ścianę.

const COLLISION_EPSILON = 0.0001;

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
        this.swimming = false;
        this.splash = 0;
        this.leftWater = false;

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


    this.pos.set(
        x,
        this.world.getSurfaceY(
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

    const half = this.width / 2;


    const minX = Math.floor(pos.x - half);
    const maxX = Math.floor(pos.x + half);

    const minY = Math.floor(pos.y);
    const maxY = Math.floor(pos.y + this.height);

    const minZ = Math.floor(pos.z - half);
    const maxZ = Math.floor(pos.z + half);


    for (let x = minX; x <= maxX; x++) {

        for (let y = minY; y <= maxY; y++) {

            for (let z = minZ; z <= maxZ; z++) {

                if (this.world.isSolid(x, y, z)) {
                    return true;
                }

            }

        }

    }


    return false;

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
//   - słabsza grawitacja i opór wody - gracz powoli opada na dno,
//   - Spacja - płynie w górę; przy powierzchni siła słabnie, więc
//     unosi się z oczami tuż nad wodą,
//   - Shift - nurkuje,
//   - Spacja przy ścianie brzegu - wybicie w górę (wyjście z wody),
//   - w płytkiej wodzie (do pasa) Spacja to zwykły skok z dna.

updateSwimming(dt, water, space, input) {

    const deep = clamp01(water / 0.5);

    this.vel.y += GRAVITY * (1 + (WATER_GRAVITY_FACTOR - 1) * deep) * dt;

    this.vel.y *= Math.exp(-WATER_DRAG * deep * dt);


    if (space && this.onGround && water < 0.6) {

        this.vel.y = JUMP_SPEED;

        this.onGround = false;

        return;

    }

    if (space) {
        this.vel.y += SWIM_UP_ACCELERATION * clamp01((water - 0.72) / 0.15) * dt;
    }

    const shift = input.isKeyDown('ShiftLeft') || input.isKeyDown('ShiftRight');

    if (shift && water > 0.5) {
        this.vel.y -= SWIM_DOWN_ACCELERATION * dt;
    }

    if (space && this.touchingWall && water > 0.2) {
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

    // Górny blok wody jest niższy, chyba że przykrywa go pełny blok.

    return y + (isOpaqueId(world.getBlockId(x, y + 1, z)) ? 1 : WATER_SURFACE);

}


// Ile gracza jest w wodzie (submerged) i czy pływa.

updateWater() {

    const level = this.waterLevel();

    this.submerged = clamp01((level - this.pos.y) / STAND_HEIGHT);

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


    if (delta > 0) {

        // Przednia krawędź gracza weszła w blok -
        // ustawiamy ją tuż przed granicą tego bloku.

        snapped =
            Math.floor(this.pos[axis] + toMax) -
            toMax -
            COLLISION_EPSILON;

        snapped = Math.max(oldValue, snapped);

    }

    else {

        snapped =
            Math.floor(this.pos[axis] - toMin) +
            1 +
            toMin +
            COLLISION_EPSILON;

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

    const half = this.width / 2;

    const y = Math.floor(this.pos.y - 0.05);

    for (let x = Math.floor(this.pos.x - half); x <= Math.floor(this.pos.x + half); x++) {

        for (let z = Math.floor(this.pos.z - half); z <= Math.floor(this.pos.z + half); z++) {

            if (this.world.isSolid(x, y, z)) {
                return true;
            }

        }

    }

    return false;

}

// Stan gracza do zapisania w świecie.

getState() {

    return {

        x: this.pos.x,
        y: this.pos.y,
        z: this.pos.z,

        yaw: this.yaw,
        pitch: this.pitch

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

    this.vel.set(0, 0, 0);


    this.updateCamera();

    return true;

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

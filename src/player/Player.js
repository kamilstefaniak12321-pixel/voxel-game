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
    SPRINT_DOUBLE_TAP
} from '../config.js';

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


    // Prędkość: zwykła razy mnożnik z komendy /predkosc,
    // w locie dwa razy szybciej, kucając wolniej, biegnąc szybciej.

    const speed =
        MOVE_SPEED *
        this.speedMultiplier *
        (this.flying ? FLY_SPEED_FACTOR : 1) *
        (this.crouching ? CROUCH_SPEED_FACTOR : 1) *
        (this.sprinting ? SPRINT_SPEED_FACTOR : 1);

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

        this.vel.y = vertical * speed;

        return;

    }



    this.vel.y += GRAVITY * dt;


    // Limit prędkości spadania.

    if (this.vel.y < -MAX_FALL_SPEED) {
        this.vel.y = -MAX_FALL_SPEED;
    }


    if (
        input.isKeyDown('Space') &&
        this.onGround
    ) {

        this.vel.y = JUMP_SPEED;

        this.onGround = false;

    }

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

    if (shift && !this.flying) {

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

            this.vel.x = 0;

        }


        // Z

        if (this.moveAxis('z', this.vel.z * stepDt)) {

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

    this.updateLook(input);

    this.updateMovement(dt, input);


    // Lądowanie (dla animacji): prędkość spadania tuż przed dotknięciem ziemi.

    const wasOnGround = this.onGround;
    const fallSpeed = -this.vel.y;

    const horizontal = Math.hypot(this.vel.x, this.vel.z);

    this.resolveMovement(dt);

    this.landed = !wasOnGround && this.onGround && !this.flying ? Math.max(0, fallSpeed) : 0;


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

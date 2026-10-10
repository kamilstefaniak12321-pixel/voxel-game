import * as THREE from 'three';

import {
    WORLD_SIZE_X,
    WORLD_SIZE_Z,
    GRAVITY,
    MOVE_SPEED,
    JUMP_SPEED,
    MAX_FALL_SPEED,
    MOUSE_SENSITIVITY
} from '../config.js';

// Maksymalna odległość pokonywana w jednym kroku kolizji.
// Szybszy ruch jest dzielony na kilka krótszych kroków,
// żeby gracz nie mógł "przeskoczyć" przez blok.

const MAX_STEP_DISTANCE = 0.25;

// Malutki odstęp zostawiany między graczem a blokiem,
// żeby błędy zaokrągleń nie wciskały gracza w ścianę.

const COLLISION_EPSILON = 0.0001;

export class Player {

    constructor(world, camera) {

        this.world = world;
        this.camera = camera;


        this.pos = new THREE.Vector3();

        this.vel = new THREE.Vector3();


        this.width = 0.6;
        this.height = 1.8;
        this.eyeHeight = 1.6;


        this.yaw = 0;
        this.pitch = 0;


        this.onGround = false;


        this.spawn();

    }

// Ustawia gracza na powierzchni terenu na środku świata.

spawn() {

    // + 0.5 = środek bloku, żeby gracz stał w jednej kolumnie.

    const x = Math.floor(WORLD_SIZE_X / 2) + 0.5;
    const z = Math.floor(WORLD_SIZE_Z / 2) + 0.5;


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


    this.yaw -= mouse.x * MOUSE_SENSITIVITY;
    this.pitch -= mouse.y * MOUSE_SENSITIVITY;


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


    this.vel.x = move.x * MOVE_SPEED;
    this.vel.z = move.z * MOVE_SPEED;


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

resolveMovement(dt) {

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

    this.updateLook(input);

    this.updateMovement(dt, input);

    this.resolveMovement(dt);

    this.checkRespawn();

    this.updateCamera();

}

}

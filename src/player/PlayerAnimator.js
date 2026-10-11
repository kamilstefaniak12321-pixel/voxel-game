import { MOVE_SPEED, JUMP_SPEED, GRAVITY, CROUCH_SPEED_FACTOR, SPRINT_SPEED_FACTOR } from '../config.js';

import { ANIMATIONS as A } from './animations.js';

import { createPose } from './PlayerModel.js';

// ------------------------------------------------------------
// ANIMACJE GRACZA
//
// Co klatkę liczy pozę modelu (kąty stawów) ze stanu gracza: jak
// szybko idzie, czy biegnie, kuca, jest w powietrzu, właśnie
// wylądował, macha ręką, gdzie patrzy.
//
// Animacje są "proceduralne" - nie ma zapisanych klatek, tylko wzory
// (sinusy) z liczbami z animations.js. Dzięki temu chód płynnie
// przechodzi w bieg, kucanie i skok, a nogi przebierają się tak
// szybko, jak gracz naprawdę idzie.
//
// Najważniejsze sztuczki:
//   - faza kroku rośnie z przebytą drogą (nie z czasem), więc stopy
//     nie "ślizgają się" przy zmianie prędkości,
//   - stany mieszają się wagami 0-1, które zmieniają się płynnie,
//   - miednica obniża się dokładnie tyle, ile skracają się ugięte
//     nogi - stopy zostają na ziemi (kucanie, chód, lądowanie),
//   - głowa patrzy tam, gdzie kamera, a ciało za nią nadąża.
// ------------------------------------------------------------

const DEG = Math.PI / 180;

// Długość uda i goleni (piksele skórki).
const SEGMENT = 6;


function clamp(value, min, max) {

    return value < min ? min : value > max ? max : value;

}


function lerp(a, b, t) {

    return a + (b - a) * t;

}


function smoothstep(edge0, edge1, value) {

    const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);

    return t * t * (3 - 2 * t);

}


// Kąt w zakresie -PI..PI.

function wrap(angle) {

    return Math.atan2(Math.sin(angle), Math.cos(angle));

}


// Płynne dochodzenie do celu (rate - jak szybko, 1/s).

function approach(value, target, rate, dt) {

    return value + (target - value) * (1 - Math.exp(-rate * dt));

}


// Zgięcie kolana w czasie kroku: największe, gdy noga przechodzi
// do przodu (trochę przed środkiem wymachu).

function swingCurve(phase) {

    return Math.max(0, Math.cos(phase + 0.45)) ** 1.3;

}

// ------------------------------------------------------------

export class PlayerAnimator {

    constructor() {

        this.pose = createPose();

        // Kierunek ciała (obraca się za kamerą i kierunkiem ruchu).
        this.bodyYaw = 0;

        // Faza kroku (radiany; pełny cykl = 2 PI).
        this.phase = 0;

        // Wagi stanów 0-1.
        this.move = 0;
        this.run = 0;
        this.crouch = 0;
        this.air = 0;
        this.fly = 0;

        // Która noga idzie w górę przy skoku (1 = prawa, -1 = lewa).
        this.airSide = 1;

        this.time = 0;

        // Lądowanie i machnięcie ręką (sekundy od początku; Infinity = brak).
        this.landTime = Infinity;
        this.landStrength = 0;
        this.swingTime = Infinity;

        // Spowolnienie animacji (/model tempo).
        this.timeScale = 1;

        // Podgląd animacji (/animacja): { mode, time } albo null.
        this.preview = null;

        // O ile podnieść model w podglądzie (skok w miejscu), bloki.
        this.previewLift = 0;

        this.initialized = false;

    }


    // Machnięcie ręką (zniszczenie / postawienie bloku).

    swing() {

        this.swingTime = 0;

    }


    // state: { vx, vy, vz, onGround, crouching, sprinting, flying,
    //          yaw, pitch (kamery), landed (prędkość lądowania albo 0) }

    update(dt, input) {

        dt *= this.timeScale;

        this.time += dt;

        this.previewLift = 0;


        const state = this.preview ? this.previewState(dt, input) : input;


        if (!this.initialized) {

            this.bodyYaw = state.yaw;

            this.initialized = true;

        }


        // --- Kierunek ciała -------------------------------------

        const speed = Math.hypot(state.vx, state.vz);

        const moving = speed > 0.3;

        const headMax = A.turn.headMax * DEG;


        if (moving && !state.flying) {

            // Ciało obraca się w stronę ruchu (w bok najwyżej strafeMax),
            // przy chodzeniu do tyłu zostaje przodem do kamery.

            const moveYaw = Math.atan2(-state.vx, -state.vz);

            let relative = wrap(moveYaw - state.yaw);

            if (Math.abs(relative) > Math.PI / 2 + 0.01) {
                relative = wrap(relative - Math.PI);
            }

            relative = clamp(relative, -A.turn.strafeMax * DEG, A.turn.strafeMax * DEG);

            const target = state.yaw + relative;

            this.bodyYaw = wrap(this.bodyYaw + wrap(target - this.bodyYaw) * (1 - Math.exp(-A.turn.bodyFollowSpeed * dt)));

        }
        else {

            // Stoi: ciało rusza się dopiero, gdy głowa obróciła się za daleko.

            const difference = wrap(state.yaw - this.bodyYaw);

            if (Math.abs(difference) > headMax) {
                this.bodyYaw = wrap(state.yaw - Math.sign(difference) * headMax);
            }

            if (state.flying) {
                this.bodyYaw = wrap(this.bodyYaw + wrap(state.yaw - this.bodyYaw) * (1 - Math.exp(-4 * dt)));
            }

        }


        // Prędkość wzdłuż ciała (do tyłu = ujemna) - faza kroku.

        const forward = -state.vx * Math.sin(this.bodyYaw) - state.vz * Math.cos(this.bodyYaw);

        const signedSpeed = forward < -0.1 * speed ? -speed : speed;


        // --- Wagi stanów ----------------------------------------

        const expected =
            MOVE_SPEED *
            (state.crouching ? CROUCH_SPEED_FACTOR : 1) *
            (state.sprinting ? SPRINT_SPEED_FACTOR : 1);

        const grounded = state.onGround || state.flying;

        this.move = approach(this.move, state.flying ? 0 : clamp(speed / (expected * 0.7), 0, 1), A.blend.move, dt);
        this.run = approach(this.run, state.sprinting && moving ? 1 : 0, A.blend.run, dt);
        this.crouch = approach(this.crouch, state.crouching && !state.flying ? 1 : 0, A.blend.crouch, dt);
        this.fly = approach(this.fly, state.flying ? 1 : 0, A.blend.air, dt);


        // Start skoku: noga w górę ta, która akurat była z przodu.

        if (!grounded && this.air < 0.05) {
            this.airSide = Math.sin(this.phase) >= 0 ? 1 : -1;
        }

        this.air = approach(this.air, grounded ? 0 : 1, A.blend.air, dt);


        // Lądowanie.

        if (state.landed > 0) {

            const L = A.land;

            const strength = Math.max(
                state.landed > 4 ? 0.2 : 0,
                clamp((state.landed - L.minSpeed) / (L.fullSpeed - L.minSpeed), 0, 1)
            );

            if (strength > 0) {

                this.landTime = 0;
                this.landStrength = strength;

            }

        }

        this.landTime += dt;
        this.swingTime += dt;


        // --- Krok -----------------------------------------------

        const stride = lerp(lerp(A.walk.stride, A.run.stride, this.run), A.crouch.stride, this.crouch);

        if (moving && grounded && !state.flying) {
            this.phase = (this.phase + signedSpeed * dt / stride * 2 * Math.PI) % (Math.PI * 200);
        }


        this.buildPose(state, speed);

        return this.pose;

    }


    // Poza z wag stanów (najpierw w stopniach, na końcu w radiany).

    buildPose(state, speed) {

        const pose = this.pose;

        const W = A.walk;
        const R = A.run;
        const C = A.crouch;
        const I = A.idle;

        const move = this.move;
        const run = this.run;
        const crouch = this.crouch;
        const air = this.air;
        const fly = this.fly;


        // Parametry kroku: chód -> bieg -> skradanie.

        const gait = (key) => {

            const value = lerp(W[key], R[key], run);

            return key in C ? lerp(value, C[key], crouch) : value;

        };

        const legSwing = gait('legSwing');
        const kneeSwing = gait('kneeSwing');
        const kneeStance = lerp(gait('kneeStance'), 0, crouch);
        const armSwing = gait('armSwing');
        const walkElbow = gait('elbow');
        const elbowSwing = gait('elbowSwing');
        const hipTwist = gait('hipTwist') * (1 - 0.5 * crouch);
        const chestTwist = gait('chestTwist') * (1 - 0.5 * crouch);
        const sway = gait('sway');
        const lean = gait('lean');
        const bounce = gait('bounce');

        const p = this.phase;
        const s = Math.sin(p);


        // Oddech (gdy stoi).

        const breath = Math.sin(2 * Math.PI * this.time / I.breathPeriod);

        const still = 1 - move;


        // --- Chód / bieg / stanie ---------------------------------

        let legR = legSwing * s * move;
        let legL = -legSwing * s * move;

        let kneeR = (kneeStance + kneeSwing * swingCurve(p)) * move + I.knee * still;
        let kneeL = (kneeStance + kneeSwing * swingCurve(p + Math.PI)) * move + I.knee * still;

        let armR = -armSwing * s * move;
        let armL = armSwing * s * move;

        let spreadR = I.armSpread + I.armSway * breath * still;
        let spreadL = spreadR;

        let elbowR = lerp(I.elbow, walkElbow + elbowSwing * Math.max(0, -s), move);
        let elbowL = lerp(I.elbow, walkElbow + elbowSwing * Math.max(0, s), move);

        let pelvisLean = lean * 0.4 * move;
        let waistLean = lean * 0.6 * move - I.breathLean * breath * still;

        let pelvisTwist = hipTwist * s * move;
        let waistTwist = -(hipTwist + chestTwist) * s * move;

        let pelvisSway = sway * s * move;


        // --- Kucanie (dochodzi do każdej pozy) ---------------------

        pelvisLean += C.pelvisLean * crouch;
        waistLean += C.waistLean * crouch;

        legR += C.hip * crouch;
        legL += C.hip * crouch;
        kneeR += C.knee * crouch;
        kneeL += C.knee * crouch;

        armR += C.armForward * crouch;
        armL += C.armForward * crouch;
        elbowR += C.elbow * crouch;
        elbowL += C.elbow * crouch;


        // --- Latanie ----------------------------------------------

        if (fly > 0.001) {

            const F = A.fly;

            const forward = Math.min(1, speed / MOVE_SPEED);

            legR = lerp(legR, F.legSwing, fly);
            legL = lerp(legL, F.legSwing, fly);
            kneeR = lerp(kneeR, F.knee, fly);
            kneeL = lerp(kneeL, F.knee, fly);
            spreadR = lerp(spreadR, F.armSpread, fly);
            spreadL = lerp(spreadL, F.armSpread, fly);
            elbowR = lerp(elbowR, F.elbow, fly);
            elbowL = lerp(elbowL, F.elbow, fly);
            armR = lerp(armR, 0, fly);
            armL = lerp(armL, 0, fly);
            pelvisLean = lerp(pelvisLean, F.lean * forward, fly);
            waistLean = lerp(waistLean, F.lean * forward * 0.5, fly);

        }


        // --- Powietrze: wznoszenie -> spadanie --------------------

        if (air > 0.001) {

            const t = smoothstep(3, -5, state.vy);

            const P = (key) => lerp(A.rise[key], A.fall[key], t);

            // Noga z przodu przy skoku idzie w górę (airSide).

            const up = this.airSide > 0;

            const swingUp = P('legRSwing');
            const kneeUp = P('kneeR');
            const swingDown = P('legLSwing');
            const kneeDown = P('kneeL');

            legR = lerp(legR, up ? swingUp : swingDown, air);
            kneeR = lerp(kneeR, up ? kneeUp : kneeDown, air);
            legL = lerp(legL, up ? swingDown : swingUp, air);
            kneeL = lerp(kneeL, up ? kneeDown : kneeUp, air);

            armR = lerp(armR, P('armSwing'), air);
            armL = lerp(armL, P('armSwing'), air);
            spreadR = lerp(spreadR, P('armSpread'), air);
            spreadL = lerp(spreadL, P('armSpread'), air);
            elbowR = lerp(elbowR, P('elbow'), air);
            elbowL = lerp(elbowL, P('elbow'), air);

            waistLean += P('lean') * air;

        }


        // --- Lądowanie: ugięcie (narasta szybko, schodzi wolniej) ---

        const L = A.land;

        if (this.landTime < L.duration) {

            const t = this.landTime;

            const rise = 0.06;

            let envelope = t < rise ? t / rise : 1 - (t - rise) / (L.duration - rise);

            envelope = smoothstep(0, 1, envelope) * this.landStrength;

            legR += L.hip * envelope;
            legL += L.hip * envelope;
            kneeR += L.knee * envelope;
            kneeL += L.knee * envelope;
            pelvisLean += L.lean * 0.6 * envelope;
            waistLean += L.lean * 0.4 * envelope;
            armR += L.armForward * envelope;
            armL += L.armForward * envelope;
            elbowR += L.elbow * envelope;
            elbowL += L.elbow * envelope;

        }


        // --- Machnięcie prawą ręką --------------------------------

        const S = A.swing;

        if (this.swingTime < S.duration) {

            const t = this.swingTime / S.duration;

            // Szybko w górę i do przodu, potem spokojnie w dół.

            const envelope = Math.sin(Math.PI * Math.min(1, t ** 0.7));

            armR += S.arm * envelope;
            spreadR += S.spread * envelope;
            elbowR += S.elbow * envelope;
            waistTwist += S.chestTwist * envelope;

        }


        // --- Zapis pozy (radiany) ----------------------------------

        pose.pelvis.lean = pelvisLean * DEG;
        pose.pelvis.twist = pelvisTwist * DEG;
        pose.pelvis.sway = pelvisSway * DEG;

        pose.waist.lean = waistLean * DEG;
        pose.waist.twist = waistTwist * DEG;
        pose.waist.sway = 0;

        pose.armR.swing = armR * DEG;
        pose.armR.spread = spreadR * DEG;
        pose.armR.bend = Math.max(0, elbowR) * DEG;
        pose.armL.swing = armL * DEG;
        pose.armL.spread = spreadL * DEG;
        pose.armL.bend = Math.max(0, elbowL) * DEG;

        pose.legR.swing = legR * DEG;
        pose.legR.bend = Math.max(0, kneeR) * DEG;
        pose.legL.swing = legL * DEG;
        pose.legL.bend = Math.max(0, kneeL) * DEG;


        // Stopy na ziemi: miednica obniża się o tyle, o ile skróciły się
        // ugięte nogi (liczy się dłuższa noga - ta, na której stoi).

        const reach = (swing, bend) => {

            const thigh = swing - pelvisLean;

            return SEGMENT * (Math.cos(thigh * DEG) + Math.cos((thigh - bend) * DEG));

        };

        const longest = Math.max(reach(legR, kneeR), reach(legL, kneeL));

        const planted = (1 - air) * (1 - fly);

        pose.drop = (2 * SEGMENT - longest) * planted - bounce * Math.abs(s) * move * planted;


        // Głowa patrzy tam, gdzie kamera (poprawka o skręt i pochylenie tułowia).

        const headMax = (A.turn.headMax + 15) * DEG;

        pose.head.yaw = clamp(wrap(state.yaw - this.bodyYaw) - pose.pelvis.twist - pose.waist.twist, -headMax, headMax);

        pose.head.pitch = clamp(state.pitch + pose.pelvis.lean + pose.waist.lean, -80 * DEG, 80 * DEG);

        pose.head.roll = 0;

    }


    // --------------------------------------------------------
    // PODGLĄD (/animacja) - udawany stan gracza.
    // --------------------------------------------------------

    previewState(dt, real) {

        const preview = this.preview;

        preview.time += dt;

        const t = preview.time;


        const state = {
            vx: 0, vy: 0, vz: 0,
            onGround: true,
            crouching: false,
            sprinting: false,
            flying: false,
            yaw: real.yaw,
            pitch: real.pitch,
            landed: 0
        };


        const walkAt = (speed) => {

            state.vx = -Math.sin(this.bodyYaw) * speed;
            state.vz = -Math.cos(this.bodyYaw) * speed;

            // Głowa patrzy przed siebie (razem z ciałem).
            state.yaw = this.bodyYaw;
            state.pitch = 0;

        };


        switch (preview.mode) {

            case 'walk':
                walkAt(MOVE_SPEED);
                break;

            case 'run':
                state.sprinting = true;
                walkAt(MOVE_SPEED * SPRINT_SPEED_FACTOR);
                break;

            case 'crouch':
                state.crouching = true;
                state.yaw = this.bodyYaw;
                state.pitch = 0;
                break;

            case 'sneak':
                state.crouching = true;
                walkAt(MOVE_SPEED * CROUCH_SPEED_FACTOR);
                break;

            case 'jump': {

                // Skok co 1,4 s: lot jak w grze (prędkość skoku i grawitacja).

                const period = 1.4;
                const flight = 2 * JUMP_SPEED / -GRAVITY;

                const local = t % period;
                const previous = (t - dt) % period;

                state.yaw = this.bodyYaw;
                state.pitch = 0;

                if (local < flight) {

                    state.onGround = false;
                    state.vy = JUMP_SPEED + GRAVITY * local;

                    // Model leci w górę i w dół jak przy prawdziwym skoku.
                    this.previewLift = JUMP_SPEED * local + GRAVITY * local * local / 2;

                }
                else if (previous < flight) {

                    state.landed = JUMP_SPEED;

                }

                break;

            }

            case 'swing':

                state.yaw = this.bodyYaw;
                state.pitch = 0;

                if (Math.floor(t / 0.7) !== Math.floor((t - dt) / 0.7)) {
                    this.swing();
                }

                break;

            case 'fly':
                state.flying = true;
                break;

            default:
                state.yaw = this.bodyYaw;
                state.pitch = 0;
                break;

        }

        return state;

    }

}

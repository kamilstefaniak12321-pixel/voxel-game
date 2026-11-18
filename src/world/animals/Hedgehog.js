// ------------------------------------------------------------
// JEŻYK (1.18.0) - pierwsze zwierzę w grze. Model i tekstura Kamila.
//
// ZASADA GRY (ustalona z Kamilem): zwierząt nie da się skrzywdzić
// i nie ma z nich mięsa. Są towarzyszami, tłem świata albo - w przyszłości -
// dają surowce bez krzywdy (mleko, wełna, pióra, jajka). Jeżyk uderzony
// tylko zwija się w kulkę.
//
// Zachowanie wzorowane na prawdziwym jeżu:
//   - w dzień śpi zwinięty w swoim krzewie jagodowym (w bloku liści),
//   - o zmierzchu wychodzi i do świtu żeruje w pobliżu domu: krótkie
//     odcinki marszu, przystanki, węszenie,
//   - zimą zapada w sen zimowy i nie wychodzi do wiosny,
//   - gdy człowiek podbiega albo go trąci, zwija się w kulkę i czeka;
//     gdy ktoś podchodzi powoli (skradając się) albo stoi - tylko
//     przystaje, patrzy i węszy,
//   - czuje jagody w ręce: podchodzi i je z ręki (PPM), potem przez jakiś
//     czas ufa i się nie zwija,
//   - omija wodę i urwiska, wchodzi na próg jednego bloku, przez liście
//     krzewów przechodzi swobodnie.
//
// Tu jest samo zachowanie (bez three.js - sprawdza je test).
// Kto, gdzie i kiedy: game/Hedgehogs.js; wygląd: rendering/HedgehogRenderer.js.
// ------------------------------------------------------------

import { isSolidId, isPassableId, isLiquidId } from '../../blocks/BlockRegistry.js';

export const HEDGEHOG = Object.freeze({
    // Prędkości (bloki/s): żerowanie, powrót do domu o świcie, do jedzenia.
    walk: 0.7, hurry: 1.25, approach: 0.9,
    // Jak daleko od domu żeruje.
    range: 9,
    // Noc jeża: od zmierzchu do świtu (pora doby 0-1).
    dusk: 0.77, dawn: 0.22,
    // Człowiek: z jakiej odległości jeż go zauważa, od jakiej prędkości
    // (bloki/s) się go boi i jak blisko nie znosi żadnego ruchu.
    notice: 4.2, scare: 3.4, scareSpeed: 2.6, touch: 0.9,
    // Kulka: ile najmniej trwa i ile spokoju trzeba, żeby się rozwinął.
    curlMin: 3, calm: 2.5, hitCurl: 6,
    // Jedzenie: z jak daleka czuje owoce w ręce, jak blisko podchodzi,
    // ile je, ile potem ufa.
    smell: 7, feedDistance: 1.15, eat: 2.4, trust: 120,
    // Rozmiar ciała (bloki) - do celowania: szerokość, wysokość, długość.
    size: [0.32, 0.44, 0.56],
    // Największy spadek, na jaki zejdzie.
    drop: 3
});

// Czym da się go nakarmić (jagody i miękkie owoce).
export const HEDGEHOG_FOODS = new Set([
    'blueberry', 'strawberry', 'blackberry', 'aronia', 'redcurrant', 'blackcurrant', 'gooseberry', 'red_gooseberry',
    'raspberry', 'yellow_raspberry', 'rose_hip', 'elderberry', 'sea_buckthorn_berry', 'jablon_jablko'
]);

// Warianty i jak często się trafiają (albinos - rzadko).
export const HEDGEHOG_VARIANT_WEIGHTS = [['brown', 0.55], ['dark', 0.22], ['sandy', 0.2], ['albino', 0.03]];

export function hedgehogVariant(roll) {
    let left = roll;
    for (const [name, weight] of HEDGEHOG_VARIANT_WEIGHTS) {
        if (left < weight) return name;
        left -= weight;
    }
    return 'brown';
}

// Czy o tej porze doby jeż jest na nogach. shift - osobiste przesunięcie
// (część doby): jedne jeże wstają wcześniej, inne później.
export function hedgehogNight(timeOfDay, shift = 0) {
    return timeOfDay >= HEDGEHOG.dusk + shift || timeOfDay < HEDGEHOG.dawn + shift * 0.5;
}

const blocked = (id) => isSolidId(id) && !isPassableId(id);
const TAU = Math.PI * 2;

function turnToward(current, target, step) {
    let delta = (target - current) % TAU;
    if (delta > Math.PI) delta -= TAU;
    if (delta < -Math.PI) delta += TAU;
    return current + Math.max(-step, Math.min(step, delta));
}


export class Hedgehog {

    // world - getBlockId(x, y, z). options: id, variant, home { x, y, z }
    // (komórka liści - dom), shift (przesunięcie pory wstawania),
    // random (funkcja 0-1), x / y / z (gdzie stoi; domyślnie w domu).

    constructor(world, { id, variant = 'brown', home, shift = 0, random = Math.random, x, y, z, yaw = 0 }) {

        this.world = world;
        this.id = id;
        this.variant = variant;
        this.home = home;
        this.shift = shift;
        this.random = random;

        this.x = x ?? home.x + 0.5;
        this.y = y ?? home.y;
        this.z = z ?? home.z + 0.5;
        this.yaw = yaw;

        // sleep - śpi w domu, walk - idzie do celu, idle - stoi, sniff -
        // węszy, watch - patrzy na człowieka, curl - kulka, approach -
        // idzie do jedzenia, beg - czeka przy ręce, eat - je, home - wraca.
        this.state = 'sleep';
        this.timer = 0;
        this.target = null;

        // Jak bardzo zwinięty (0-1, płynnie) i faza kroków (do animacji).
        this.curl = 1;
        this.stride = 0;
        this.moving = false;
        this.clock = 0;

        this.hibernating = false;
        this.calm = 0;
        this.trust = 0;
        this.fed = 0;
        this.stuck = 0;
        this.homeTime = 0;
        // Do kogo teraz patrzy / idzie (gracz) i co się właśnie stało
        // (dla dźwięków i osiągnięć: 'curl', 'sniff', 'eat', 'wake').
        this.focus = null;
        this.events = [];

    }

    get awake() { return this.state !== 'sleep'; }

    get atHome() {
        return Math.floor(this.x) === this.home.x && Math.floor(this.z) === this.home.z && Math.abs(this.y - this.home.y) < 1.01;
    }

    // --- Teren ---------------------------------------------------------------

    // Wysokość, na której stanąłby w komórce (cx, cz), wchodząc z poziomu
    // `from` (całe y), albo null (ściana, woda, urwisko).
    footing(cx, cz, from) {
        const world = this.world;
        const at = (y) => world.getBlockId(cx, y, cz);
        if (blocked(at(from))) {
            // Próg jednego bloku: nad nim i nad sobą musi być wolne.
            if (blocked(at(from + 1)) || blocked(world.getBlockId(Math.floor(this.x), from + 1, Math.floor(this.z)))) return null;
            return isLiquidId(at(from + 1)) ? null : from + 1;
        }
        for (let y = from, depth = 0; depth <= HEDGEHOG.drop; y--, depth++) {
            if (isLiquidId(at(y))) return null;
            if (y - 1 < 0) return null;
            if (blocked(at(y - 1))) return y;
        }
        return null;
    }

    // Krok w stronę yaw. Zwraca false, gdy droga jest zamknięta.
    step(speed, dt) {
        const dx = Math.sin(this.yaw) * speed * dt, dz = Math.cos(this.yaw) * speed * dt;
        const nx = this.x + dx, nz = this.z + dz;
        const cx = Math.floor(nx), cz = Math.floor(nz);
        const level = Math.floor(this.y + 0.001);
        if (cx !== Math.floor(this.x) || cz !== Math.floor(this.z)) {
            const ground = this.footing(cx, cz, level);
            if (ground === null) return false;
            this.ground = ground;
        }
        this.x = nx; this.z = nz;
        this.stride += speed * dt;
        this.moving = true;
        return true;
    }

    // Opada albo wspina się na wysokość gruntu pod sobą.
    settle(dt) {
        const cx = Math.floor(this.x), cz = Math.floor(this.z);
        let ground = this.footing(cx, cz, Math.floor(this.y + 0.001));
        if (ground === null) ground = this.ground ?? Math.floor(this.y);
        this.ground = ground;
        if (this.y < ground) this.y = Math.min(ground, this.y + 5 * dt);
        else if (this.y > ground) this.y = Math.max(ground, this.y - 9 * dt);
    }

    // --- Decyzje --------------------------------------------------------------

    enter(state, seconds = 0) {
        if (state !== this.state) {
            if (state === 'curl') this.events.push('curl');
            if (state === 'sniff' || state === 'watch') this.events.push('sniff');
            if (state === 'eat') this.events.push('eat');
            if (this.state === 'sleep') this.events.push('wake');
        }
        this.state = state;
        this.timer = seconds;
    }

    pickTarget() {
        const r = this.random;
        for (let tries = 0; tries < 6; tries++) {
            const angle = r() * TAU, distance = 1.5 + r() * (HEDGEHOG.range - 1.5);
            const x = this.home.x + 0.5 + Math.sin(angle) * distance, z = this.home.z + 0.5 + Math.cos(angle) * distance;
            if (Math.hypot(x - this.x, z - this.z) > 1) return { x, z };
        }
        return { x: this.home.x + 0.5, z: this.home.z + 0.5 };
    }

    // Idzie do (x, z). Zwraca 'there', 'going' albo 'blocked'.
    go(x, z, speed, dt, near = 0.35) {
        const dx = x - this.x, dz = z - this.z;
        const distance = Math.hypot(dx, dz);
        if (distance <= near) return 'there';
        this.yaw = turnToward(this.yaw, Math.atan2(dx, dz), 4.5 * dt);
        if (!this.step(Math.min(speed, distance / Math.max(dt, 1e-3)), dt)) {
            this.stuck += dt;
            // Zamknięta droga: próbuje obejść bokiem.
            this.yaw += (this.random() < 0.5 ? 1 : -1) * (0.9 + this.random() * 1.2);
            return 'blocked';
        }
        return 'going';
    }

    face(x, z, dt) {
        this.yaw = turnToward(this.yaw, Math.atan2(x - this.x, z - this.z), 5 * dt);
    }

    // Trącony (LPM): zwija się, nic mu nie jest.
    hit() {
        this.trust = 0;
        this.enter('curl', HEDGEHOG.hitCurl);
        this.calm = 0;
    }

    // Czy da się go teraz nakarmić przedmiotem `item`.
    canEat(item) {
        return HEDGEHOG_FOODS.has(item) && this.awake && this.state !== 'curl' && this.state !== 'eat';
    }

    feed() {
        this.fed++;
        this.trust = HEDGEHOG.trust;
        this.enter('eat', HEDGEHOG.eat);
    }

    // env: { timeOfDay, winter, players: [{ id, x, y, z, speed, food }] }.
    update(dt, env) {

        const H = HEDGEHOG;
        this.clock += dt;
        this.moving = false;
        this.trust = Math.max(0, this.trust - dt);
        this.timer -= dt;

        const night = hedgehogNight(env.timeOfDay, this.shift) && !env.winter;
        this.hibernating = Boolean(env.winter);

        // Najbliższy człowiek.
        let nearest = null, distance = Infinity;
        for (const player of env.players ?? []) {
            const d = Math.hypot(player.x - this.x, player.z - this.z, (player.y - this.y) * 0.5);
            if (d < distance) { distance = d; nearest = player; }
        }
        this.focus = distance < H.smell ? nearest : null;

        const scared = nearest && !this.trust && (
            (distance < H.scare && nearest.speed > H.scareSpeed) || (distance < H.touch && nearest.speed > 0.4));

        // --- Sen -----------------------------------------------------------
        if (this.state === 'sleep') {
            this.curl = Math.min(1, this.curl + dt * 2);
            if (night) this.enter('idle', 0.8 + this.random() * 1.5);
            return;
        }

        // --- Kulka ---------------------------------------------------------
        if (scared && this.state !== 'curl') {
            this.enter('curl', H.curlMin);
            this.calm = 0;
        }

        if (this.state === 'curl') {
            this.curl = Math.min(1, this.curl + dt * 6);
            this.calm = scared ? 0 : this.calm + dt;
            if (this.timer <= 0 && this.calm >= H.calm) this.enter('sniff', 1.8);
            this.settle(dt);
            return;
        }

        this.curl = Math.max(0, this.curl - dt * 2.5);

        // --- Świt albo zima: do domu ---------------------------------------
        if (!night && this.state !== 'eat') {
            if (this.state !== 'home') { this.enter('home'); this.homeTime = 0; }
            this.homeTime += dt;
            const result = this.go(this.home.x + 0.5, this.home.z + 0.5, H.hurry, dt, 0.3);
            this.settle(dt);
            // Dotarł albo utknął na dobre i nikt nie patrzy z bliska.
            if (result === 'there' || (this.homeTime > 45 && distance > 14)) {
                this.x = this.home.x + 0.5; this.z = this.home.z + 0.5; this.y = this.home.y; this.ground = this.home.y;
                this.enter('sleep');
            }
            return;
        }

        // --- Jedzenie ------------------------------------------------------
        if (this.state === 'eat') {
            if (nearest) this.face(nearest.x, nearest.z, dt);
            if (this.timer <= 0) this.enter('sniff', 1.8);
            this.settle(dt);
            return;
        }

        if (nearest?.food && distance < H.smell && nearest.speed <= H.scareSpeed) {
            if (distance > H.feedDistance) {
                if (this.state !== 'approach') this.enter('approach');
                this.go(nearest.x, nearest.z, H.approach, dt, H.feedDistance);
            }
            else {
                if (this.state !== 'beg') this.enter('beg');
                this.face(nearest.x, nearest.z, dt);
            }
            this.settle(dt);
            return;
        }

        if (this.state === 'approach' || this.state === 'beg') this.enter('idle', 1);

        // --- Człowiek blisko, ale spokojny: przystaje i patrzy -------------
        if (nearest && distance < H.notice && !this.trust) {
            if (this.state !== 'watch') this.enter('watch', 1.8 + this.random() * 2);
            this.face(nearest.x, nearest.z, dt);
            this.settle(dt);
            return;
        }

        if (this.state === 'watch') this.enter('idle', 0.5);

        // --- Żerowanie -----------------------------------------------------
        if (this.state === 'walk') {
            const result = this.target ? this.go(this.target.x, this.target.z, H.walk, dt) : 'there';
            if (result === 'there' || this.timer <= 0 || this.stuck > 3) {
                this.stuck = 0;
                this.target = null;
                if (this.random() < 0.6) this.enter('sniff', 1.8 * (1 + Math.floor(this.random() * 2)));
                else this.enter('idle', 0.8 + this.random() * 2.2);
            }
        }
        else if (this.timer <= 0) {
            this.target = this.pickTarget();
            this.enter('walk', 3 + this.random() * 6);
        }

        this.settle(dt);

    }

}

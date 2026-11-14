// ------------------------------------------------------------
// SEN (0.98.0)
//
// Nocą (19:00-5:00) gracz może się położyć:
//   - PPM na posłaniu albo pościelonym łóżku (game/Beds.js),
//   - kucnięcie + PPM pustą ręką na ziemi - sen na gołej ziemi.
//
// Przebieg (phase):
//   'down'   - obraz gaśnie, gracz leży, nie steruje,
//   'asleep' - śpi. W grze dla jednego gracza noc od razu przeskakuje do
//              6:00. W grze ze znajomymi noc przeskakuje dopiero, gdy
//              śpią wszyscy (robi to gospodarz); inaczej czas płynie
//              zwyczajnie i gracz budzi się rano sam. Ruch albo kliknięcie
//              budzi wcześniej,
//   'up'     - pobudka: Wellbeing.sleep dolicza wyspanie za przespane
//              godziny (tym więcej, im wygodniej), obraz wraca.
//
// Obraz gasi element #blackout (StatusPanel), ten sam co przy utracie
// przytomności. Leżącą postać rysują Game (własny model) i RemotePlayers
// (inni gracze - flaga "śpi" w stanie gracza, net/protocol.js).
// ------------------------------------------------------------

import { isNight, NIGHT_FROM, NIGHT_UNTIL, SLEEP_PLACES, COMFORT } from './Wellbeing.js';

export const SLEEP_FADE_SECONDS = 1.4;
// Godzina pobudki, gdy noc przeskakuje.
export const WAKE_HOUR = 6;
// Krótka chwila snu przed przeskokiem nocy i zanim klawisze mogą obudzić.
const SETTLE_SECONDS = 1;

const WAKE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'Escape'];

// Początek najbliższej pobudki (czas gry w dobach) po chwili "days".
export function nextWake(days) {
    const day = Math.floor(days), wake = WAKE_HOUR / 24;
    return days - day < wake ? day + wake : day + 1 + wake;
}

export class Sleep {

    constructor(game) {
        this.game = game;
        this.phase = null;
        this.left = 0;
        this.spot = null;
        this.startedAt = 0;
        this.asleepFor = 0;
        this.released = new Set();
    }

    get active() { return this.phase !== null; }

    // Leży (do rysowania postaci i flagi w sieci).
    get lying() { return this.phase === 'down' || this.phase === 'asleep'; }

    get asleep() { return this.phase === 'asleep'; }

    // Śpi i czeka na innych graczy (noc jeszcze nie może przeskoczyć).
    get waiting() { return this.asleep && !this.canSkip(); }

    // Sen na gołej ziemi: w miejscu, gdzie gracz stoi.
    startOnGround() {
        return this.start({ place: 'ground', comfort: 0, yaw: this.groundYaw() });
    }

    // W którą stronę położyć się na ziemi: stopy zostają, gdzie gracz
    // stoi, głowa wypada za plecami. Gdy za plecami jest ściana, gracz
    // obraca się tam, gdzie jest miejsce (żeby nie leżeć głową w bloku).
    groundYaw() {
        const { player, world } = this.game;
        const free = (yaw) => [0.6, 1.2, 1.8].every((back) => !world?.isSolid?.(
            Math.floor(player.pos.x + Math.sin(yaw) * back), Math.floor(player.pos.y + 0.3), Math.floor(player.pos.z + Math.cos(yaw) * back)));
        for (const turn of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
            if (free(player.yaw + turn)) return player.yaw + turn;
        }
        return player.yaw;
    }

    // spot: { place, comfort, x?, y?, z?, yaw? } (Beds.sleepSpot; bez
    // x, y, z gracz kładzie się tam, gdzie stoi).
    // Zwraca true, gdy gracz się położył.
    start(spot) {
        const game = this.game;
        if (this.active || game.blackout?.active) return false;
        if (!isNight(game.time.days)) {
            game.onNotice?.(`Spać można nocą, od ${NIGHT_FROM}:00 do ${NIGHT_UNTIL}:00`);
            return false;
        }
        const player = game.player;
        if (player.swimming || player.flying) {
            game.onNotice?.('Tutaj nie da się zasnąć');
            return false;
        }
        this.spot = spot;
        if (Number.isFinite(spot.x)) player.pos.set(spot.x, spot.y, spot.z);
        if (Number.isFinite(spot.yaw)) player.yaw = spot.yaw;
        player.vel.set(0, 0, 0);
        player.pitch = 0;
        player.lying = true;
        this.phase = 'down';
        this.left = SLEEP_FADE_SECONDS;
        this.startedAt = game.time.days;
        this.asleepFor = 0;
        this.released = new Set();
        game.stopMining?.();
        game.onNotice?.(`Kładziesz się spać ${SLEEP_PLACES[spot.place].label}`);
        return true;
    }

    // Czy noc może przeskoczyć: sam gracz - tak; gospodarz - gdy śpią
    // wszyscy goście; gość - nigdy (czas należy do gospodarza).
    canSkip() {
        const net = this.game.net;
        if (!net) return true;
        if (!net.isHost) return false;
        const others = [...net.players.players.values()];
        return others.every((entry) => entry.state?.sleeping);
    }

    // Co klatkę (input - prawdziwe wejście, do budzenia). Zwraca true,
    // dopóki gracz nie steruje.
    update(dt, input) {
        if (!this.active) return false;
        const game = this.game;
        if (this.phase === 'down') {
            this.left -= dt;
            this.pressed(input);
            if (this.left <= 0) this.phase = 'asleep';
            return true;
        }
        if (this.phase === 'asleep') {
            this.asleepFor += dt;
            const woken = this.pressed(input);
            if (!isNight(game.time.days)) {
                this.wake();
            } else if (this.asleepFor >= SETTLE_SECONDS) {
                if (woken) this.wake(true);
                else if (this.canSkip()) {
                    game.time.days = nextWake(game.time.days);
                    game.net?.timeChanged?.();
                    this.wake();
                }
            }
            return true;
        }
        this.left -= dt;
        if (this.left <= 0) {
            this.phase = null;
            this.spot = null;
        }
        return this.active;
    }

    // Przerwanie snu bez pobudki (utrata przytomności, wyjście ze świata).
    cancel() {
        this.phase = null;
        this.spot = null;
        if (this.game.player) this.game.player.lying = false;
    }

    // Czy gracz właśnie nacisnął coś, co budzi. Liczy się nowe naciśnięcie:
    // klawisz trzymany od zaśnięcia (np. kucanie przy kładzeniu się na
    // ziemi) nie budzi, dopóki gracz go nie puści. Kliknięcia są przy
    // okazji zdejmowane z kolejki, żeby te sprzed zaśnięcia nie budziły.
    pressed(input) {
        let woken = false;
        for (const code of WAKE_KEYS) {
            if (!input?.isKeyDown?.(code)) this.released.add(code);
            else if (this.released.has(code)) woken = true;
        }
        for (const button of [0, 2]) if (input?.consumeMousePress?.(button)) woken = true;
        return woken;
    }

    // Pobudka. early - gracz sam wstał przed świtem.
    wake(early = false) {
        const game = this.game, spot = this.spot;
        const hours = Math.max(0, (game.time.days - this.startedAt) * 24);
        const result = game.wellbeing.sleep(hours, spot.place, spot.comfort, game.time.days);
        this.phase = 'up';
        this.left = SLEEP_FADE_SECONDS;
        game.player.lying = false;
        game.achieve?.('slept', { place: spot.place, hours, comfort: result.comfort, early });
        if (!game.wellbeing.active) return;
        if (hours < 0.5) {
            game.onNotice?.('Wstajesz, zanim zdążyłeś zasnąć');
            return;
        }
        const how = result.state === 'rested' ? 'Budzisz się wypoczęty.'
            : result.state === 'ok' ? 'Budzisz się, ale mogło być lepiej.'
                : 'Budzisz się niewyspany.';
        const tip = spot.place === 'ground' ? ' Na gołej ziemi śpi się kiepsko - zrób posłanie ze słomy.'
            : spot.place === 'mat' ? ' W pościelonym łóżku wyspałbyś się lepiej.' : '';
        const bonus = result.comfort ? ` ${COMFORT[result.comfort].label[0].toUpperCase()}${COMFORT[result.comfort].label.slice(1)} doda ci dziś sił.` : '';
        game.onMessage?.(`${how}${early ? '' : tip}${bonus}`);
        game.onWellbeing?.({ type: 'woke', state: result.state, comfort: result.comfort });
    }
}

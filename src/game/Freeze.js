// ------------------------------------------------------------
// ZAMARZNIĘCIE (1.26.0, pomysł Kamila)
//
// W grze się nie umiera - kto nie dba o ciepło, zamarza na kość
// i traci czas. Gdy wychłodzenie dojdzie do końca (Wellbeing: zdarzenie
// 'freeze'), gracz zamienia się w bryłę lodu:
//
//   'freezing' - lód rośnie wokół postaci (FREEZE_SECONDS), szron
//                zakrywa obraz, gracz nie steruje,
//   'frozen'   - stoi w lodzie. W grze dla jednego gracza od razu
//                zaczyna się przyspieszony czas. W grze ze znajomymi
//                zamarznięty czeka: może się tylko rozglądać, a odtaje,
//                gdy ktoś rozpali obok ognisko albo postawi pochodnię
//                (THAW_HEAT) albo gdy samo zrobi się ciepło (THAW_TEMP).
//                Gdy zamarzną wszyscy - czas przyspiesza u gospodarza,
//   'lapse'    - przyspieszony czas: zegar biegnie do najbliższej
//                odwilży (Warmth.findWarm - pierwsza godzina, w której
//                powietrze w tym miejscu dojdzie do THAW_TEMP). Zimą to
//                bywa wiosna, jesienną nocą - ranek. Przez dłuższy
//                przeskok obraz zakrywa lód (żadnego migania dnia i nocy),
//                widać tylko licznik dni,
//   'thaw'     - lód pęka i topnieje (THAW_SECONDS); gracz zostaje
//                wyczerpany, z pustym żołądkiem i jeszcze zziębnięty
//                (Wellbeing.thawed).
//
// Obraz: StatusPanel (#frost), bryła lodu na modelu: PlayerModel.setIce.
// Inni gracze widzą bryłę dzięki fladze "zamarznięty" (net/protocol.js).
// ------------------------------------------------------------

import { DAY_LENGTH_MINUTES } from '../config.js';
import { findWarm } from './Warmth.js';

export const FREEZE_SECONDS = 2.2;
export const THAW_SECONDS = 2.5;
// Chwila w lodzie, zanim ruszy przyspieszony czas.
const SETTLE_SECONDS = 1.2;
// Odwilż: powietrze (ze schronieniem i ciepłem obok) od tylu stopni
// albo ciepło ognia i pochodni od tylu stopni.
export const THAW_TEMP = 2;
export const THAW_HEAT = 5;
// Najdłuższy przeskok (doby gry) - rok.
const LAPSE_LIMIT = 32;
// Przeskok dłuższy niż tyle dób - obraz całkiem zakryty lodem.
export const LAPSE_COVERED = 0.75;
// Z jak daleka widzi się, że inny gracz odtajał (osiągnięcie "Ratownik").
const RESCUE_RANGE = 10;

const DAY_SECONDS = DAY_LENGTH_MINUTES * 60;
const smooth = (t) => t * t * (3 - 2 * t);

// Ile sekund trwa przyspieszony czas dla przeskoku o `days` dób:
// krótki (noc) - spokojnie, ale nie szybciej niż ćwierć doby na sekundę;
// długi (zima) - kilka sekund z licznikiem.
export function lapseSeconds(days) {
    if (days <= LAPSE_COVERED) return Math.min(5, Math.max(2, days * 6));
    return Math.min(9, 3 + days * 0.25);
}

export class Freeze {

    constructor(game) {
        this.game = game;
        this.phase = null;
        this.left = 0;
        this.time = 0;
        this.lapse = null;
        // Gracze, których ostatnio widzieliśmy w lodzie (osiągnięcie).
        this.watched = new Map();
    }

    get active() { return this.phase !== null; }

    // Bryła lodu: 0 - nie ma, 1 - cała (rośnie i topnieje).
    get ice() {
        if (this.phase === 'freezing') return smooth(1 - this.left / FREEZE_SECONDS);
        if (this.phase === 'thaw') return smooth(this.left / THAW_SECONDS);
        return this.active ? 1 : 0;
    }

    // Lód na obrazie (0-1). Przy długim przeskoku - pełny.
    get overlay() {
        if (this.phase === 'lapse') return this.lapse.covered ? 1 : 0.8;
        return this.active ? 0.55 + 0.25 * this.ice : 0;
    }

    // Czeka w lodzie na ciepło (gra ze znajomymi) - może się rozglądać.
    get waiting() { return this.phase === 'frozen' && !this.canLapse(); }

    // Ile czasu mija w przeskoku: { days, done } albo null.
    get progress() {
        if (this.phase !== 'lapse') return null;
        const lapse = this.lapse;
        return { days: (this.game.time.days - lapse.from), total: lapse.to - lapse.from };
    }

    start() {
        const game = this.game;
        if (this.active || game.blackout?.active || !game.wellbeing?.active) return false;
        this.phase = 'freezing';
        this.left = FREEZE_SECONDS;
        this.time = 0;
        game.stopMining?.();
        game.eating = null;
        game.sleep?.cancel();
        game.player.vel?.set(0, 0, 0);
        game.sounds?.play('ice_freeze');
        game.onMessage?.('Zamarzłeś na kość!');
        game.achieve?.('frozen', {});
        return true;
    }

    // Czy czas może przyspieszyć: sam gracz - tak; gospodarz - gdy w lodzie
    // są wszyscy goście; gość - nigdy (czas należy do gospodarza).
    canLapse() {
        const net = this.game.net;
        if (!net) return true;
        if (!net.isHost) return false;
        return [...net.players.players.values()].every((entry) => entry.state?.frozen);
    }

    // Czy w tym miejscu jest już dość ciepło, żeby odtajać.
    canThaw() {
        const warmth = this.game.warmth;
        if (!warmth) return false;
        const parts = warmth.parts;
        return warmth.heat >= THAW_HEAT || parts.air + parts.shelter + parts.water + parts.heat >= THAW_TEMP;
    }

    // Co klatkę. Zwraca true, dopóki gracz nie steruje.
    update(dt) {
        this.watch();
        if (!this.active) return false;
        const game = this.game;
        this.left -= dt;
        this.time += dt;

        if (this.phase === 'freezing') {
            if (this.left <= 0) { this.phase = 'frozen'; this.left = SETTLE_SECONDS; }
            return true;
        }

        if (this.phase === 'frozen') {
            if (this.left > 0) return true;
            if (this.canThaw()) this.thaw(Boolean(game.net) && (game.warmth?.heat ?? 0) >= THAW_HEAT);
            else if (this.canLapse()) this.startLapse();
            return true;
        }

        if (this.phase === 'lapse') {
            const lapse = this.lapse;
            const t = Math.min(1, (this.time - lapse.start) / lapse.seconds);
            game.time.days = lapse.from + (lapse.to - lapse.from) * smooth(t);
            if (t >= 1) this.endLapse();
            return true;
        }

        // 'thaw'
        if (this.left <= 0) this.finish();
        return this.active;
    }

    startLapse() {
        const game = this.game, player = game.player, parts = game.warmth?.parts;
        const from = game.time.days;
        const field = game.weather?.field;
        // Stałe dodatki w tym miejscu: schronienie, woda i ciepło obok.
        const bonus = parts ? parts.shelter + parts.water + parts.heat : 0;
        const to = field ? findWarm(field, player.pos.x, player.pos.y + 0.9, player.pos.z, from, THAW_TEMP, bonus, { limit: LAPSE_LIMIT }) : from + 1;
        const days = Math.max(1 / 24, to - from);
        this.lapse = { from, to: from + days, start: this.time, seconds: lapseSeconds(days), covered: days > LAPSE_COVERED };
        this.phase = 'lapse';
    }

    endLapse() {
        const game = this.game, lapse = this.lapse;
        game.time.days = lapse.to;
        game.wellbeing.skipTo(lapse.to);
        // Świat nie czekał: ogniska, rośliny, psucie (Game.advanceWorld).
        game.advanceWorld?.((lapse.to - lapse.from) * DAY_SECONDS);
        game.net?.timeChanged?.();
        this.thaw(false, lapse.to - lapse.from);
    }

    // Odwilż. rescued - ogrzał go ktoś inny (gra ze znajomymi).
    thaw(rescued = false, days = 0) {
        const game = this.game;
        this.phase = 'thaw';
        this.left = THAW_SECONDS;
        this.thawInfo = { rescued, days };
        game.sounds?.play('ice_crack');
    }

    finish() {
        const game = this.game, { rescued, days } = this.thawInfo ?? {};
        this.phase = null;
        this.lapse = null;
        game.wellbeing.thawed();
        game.warmth?.update(0, true);
        game.achieve?.('thawed', { rescued: Boolean(rescued), days: days ?? 0 });
        const time = !(days > 0) ? '' : days >= 1.5 ? ` Minęło ${Math.round(days)} dni.` : ` Minęło ${Math.max(1, Math.round(days * 24))} godz.`;
        game.onMessage?.(`${rescued ? 'Ktoś cię ogrzał - lód puścił.' : 'Lód puścił.'}${time} Jesteś wyczerpany i głodny - zjedz coś i ogrzej się.`);
    }

    // Przerwanie bez odwilży (wyjście ze świata, komenda).
    cancel() {
        this.phase = null;
        this.lapse = null;
    }

    // Osiągnięcie "Ratownik": inny gracz odtajał blisko nas.
    watch() {
        const players = this.game.net?.players?.players;
        if (!players) return;
        const me = this.game.player.pos;
        for (const [id, entry] of players) {
            const frozen = Boolean(entry.state?.frozen);
            if (this.watched.get(id) && !frozen && entry.pos && entry.pos.distanceTo(me) <= RESCUE_RANGE && !this.active) {
                this.game.achieve?.('rescued', {});
            }
            this.watched.set(id, frozen);
        }
        for (const id of this.watched.keys()) if (!players.has(id)) this.watched.delete(id);
    }

}

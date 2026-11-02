import { MUSIC_TRACKS } from './musicTracks.js';

const BASE_URL = new URL('../../assets/music/', import.meta.url);
const FADE_IN = 5;
const FADE_OUT = 6;
const RETRY_DELAY = 10;

// Jeden strumień na całą aplikację. Długich utworów nie dekodujemy
// razem z efektami do AudioBuffer: przeglądarka buforuje tylko bieżący MP3.
export class MusicManager {
    constructor(sounds, settings, { tracks = MUSIC_TRACKS, createAudio = () => new Audio(), random = Math.random } = {}) {
        this.sounds = sounds;
        this.settings = settings;
        this.tracks = tracks;
        this.createAudio = createAudio;
        this.random = random;
        this.audio = null;
        this.source = null;
        this.gain = null;
        this.current = null;
        this.last = null;
        this.bag = [];
        this.failed = new Set();
        this.errors = [];
        this.wait = 0;
        this.state = 'menu';
        this.foreground = true;
        this.unlocked = false;
        this.blocked = false;
        this.pending = false;
        this.epoch = 0;
        this.fade = 0;
        this.targetGain = -1;
        this.disposed = false;
        this.unavailable = false;
        this.onEnded = () => {
            // Ignoruj zdarzenie z poprzedniego źródła, już po zmianie src.
            if (!this.current || !this.audio.ended) return;
            this.releaseTrack();
            this.wait = this.state === 'menu' ? this.between(45, 90) : this.between(150, 300);
        };
        this.onError = () => {
            if (this.audio?.error && this.current) this.failTrack('Nie udało się odczytać MP3');
        };
        this.unsubscribe = settings.onChange(key => {
            if (key === 'volumeMaster' || key === 'volumeMusic') {
                if (!this.audible) this.pause();
                else this.resume();
                this.applyGain();
            }
        });
    }

    get audible() {
        return this.settings.get('volumeMusic') > 0 && this.settings.get('volumeMaster') > 0;
    }

    get allowed() {
        return !this.disposed && !this.unavailable && this.unlocked && this.foreground && this.audible;
    }

    between(min, max) {
        return min + this.random() * (max - min);
    }

    // Wołane w tym samym geście co sounds.unlock(). Pierwszy utwór
    // zaczyna się łagodnie po kliknięciu/klawiszu; bez obchodzenia autoplay.
    unlock() {
        if (this.disposed) return;
        this.unlocked = true;
        this.blocked = false;
        this.resume();
    }

    ensureAudio() {
        if (this.audio) return true;
        const context = this.sounds.context;
        if (!context || !this.sounds.master) return false;
        const audio = this.createAudio();
        audio.preload = 'none';
        audio.loop = false;
        let gain, source;
        try {
            gain = context.createGain();
            gain.gain.value = 0;
            source = context.createMediaElementSource(audio);
            source.connect(gain);
            gain.connect(this.sounds.master);
        }
        catch (error) {
            audio.pause();
            source?.disconnect();
            gain?.disconnect();
            throw error;
        }
        this.audio = audio;
        this.gain = gain;
        this.source = source;
        this.audio.addEventListener('ended', this.onEnded);
        this.audio.addEventListener('error', this.onError);
        return true;
    }

    nextTrack() {
        if (!this.bag.length) {
            this.bag = this.tracks.filter(track => !this.failed.has(track.id));
            for (let i = this.bag.length - 1; i > 0; i--) {
                const j = Math.floor(this.random() * (i + 1));
                [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
            }
            // Pobieramy z końca worka. Granica dwóch cykli również
            // nie powtarza ostatniego utworu, jeśli istnieje alternatywa.
            const end = this.bag.length - 1;
            if (end > 0 && this.bag[end].id === this.last) {
                [this.bag[0], this.bag[end]] = [this.bag[end], this.bag[0]];
            }
        }
        return this.bag.pop() ?? null;
    }

    resume() {
        if (!this.allowed || this.blocked || this.pending || this.wait > 0 || this.failed.size >= this.tracks.length) return;
        try {
            if (!this.ensureAudio()) return;
            if (!this.current) {
                this.current = this.nextTrack();
                if (!this.current) return;
                this.audio.src = new URL(this.current.file, BASE_URL).href;
            }
            if (!this.audio.paused) return;
            const epoch = ++this.epoch;
            this.pending = true;
            this.fade = 0;
            this.applyGain(true);
            Promise.resolve(this.audio.play()).then(() => {
                if (epoch !== this.epoch || this.disposed) return;
                this.pending = false;
                if (!this.allowed) { this.pause(); return; }
                this.last = this.current?.id ?? this.last;
            }, error => this.playFailed(error, epoch));
        }
        catch (error) {
            this.playFailed(error, this.epoch);
        }
    }

    playFailed(error, epoch) {
        if (epoch !== this.epoch || this.disposed) return;
        this.pending = false;
        if (error?.name === 'NotAllowedError' || error?.name === 'AbortError') {
            // Nie próbuj ponownie co klatkę i nie wyrzucaj dobrego utworu.
            this.blocked = true;
            this.pause();
        }
        else if (this.current) {
            this.failTrack(error?.message || 'Błąd odtwarzania');
        }
        else {
            // Np. brak obsługi MediaElementSource — efekty gry działają dalej.
            this.blocked = true;
            this.unavailable = true;
            this.errors.push(String(error?.message || error));
        }
    }

    failTrack(message) {
        if (!this.current) return;
        this.failed.add(this.current.id);
        this.errors.push(`${this.current.title}: ${message}`);
        this.bag = this.bag.filter(track => !this.failed.has(track.id));
        this.releaseTrack();
        this.wait = RETRY_DELAY;
    }

    pause() {
        ++this.epoch;
        this.pending = false;
        this.fade = 0;
        this.audio?.pause();
        this.applyGain(true);
    }

    setForeground(foreground) {
        if (foreground === this.foreground || this.disposed) return;
        this.foreground = foreground;
        if (foreground) this.resume();
        else this.pause();
    }

    update(dt, state) {
        if (this.disposed) return;
        this.state = state;
        if (!this.allowed || this.blocked) return;
        // AudioContext wstrzymany przez przeglądarkę: zatrzymaj również
        // zegar media, żeby utwór nie przepływał w ciszy.
        if (this.sounds.context?.state !== 'running') {
            if (this.audio && (!this.audio.paused || this.pending)) this.pause();
            return;
        }
        const elapsed = Number.isFinite(dt) ? Math.max(0, dt) : 0;
        if (!this.current) this.wait = Math.max(0, this.wait - elapsed);
        this.resume();
        if (this.audio && !this.audio.paused && !this.pending && this.audio.readyState >= 3) {
            this.fade = Math.min(1, this.fade + elapsed / FADE_IN);
        }
        this.applyGain();
    }

    applyGain(immediate = false) {
        if (!this.gain) return;
        const remaining = this.audio.duration - this.audio.currentTime;
        const outro = Number.isFinite(remaining) ? Math.max(0, Math.min(1, remaining / FADE_OUT)) : 1;
        const level = (Math.max(0, Math.min(100, this.settings.get('volumeMusic'))) / 100) ** 2;
        const duck = this.state === 'paused' ? 0.45 : 1;
        const target = this.allowed && !this.audio.paused ? level * duck * Math.min(this.fade, outro) : 0;
        if (!immediate && Math.abs(target - this.targetGain) < 0.0001) return;
        this.targetGain = target;
        const gain = this.gain.gain, now = this.sounds.context.currentTime;
        gain.cancelScheduledValues(now);
        if (immediate) gain.setValueAtTime(target, now);
        else gain.setTargetAtTime(target, now, 0.12);
    }

    releaseTrack() {
        this.pause();
        this.current = null;
        if (this.audio) {
            this.audio.removeAttribute('src');
            this.audio.load();
        }
    }

    stats() {
        return { track: this.current?.title ?? null, playing: Boolean(this.audio && !this.audio.paused),
            foreground: this.foreground, waitingSeconds: this.wait, blocked: this.blocked,
            currentTime: this.audio?.currentTime ?? 0, gain: this.targetGain,
            failed: [...this.failed], errors: [...this.errors] };
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.releaseTrack();
        this.audio?.removeEventListener('ended', this.onEnded);
        this.audio?.removeEventListener('error', this.onError);
        this.source?.disconnect();
        this.gain?.disconnect();
        this.unsubscribe?.();
    }
}

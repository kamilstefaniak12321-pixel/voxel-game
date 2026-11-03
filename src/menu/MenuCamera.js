// Krytycznie tłumiony ruch: zmiana zakładki w połowie przejazdu zachowuje
// położenie i prędkość. Nie ma skoku ani kolejki starych animacji.
export class MenuCamera {
    constructor(views, initial = 'home') {
        this.views = views;
        this.view = initial;
        this.position = [...views[initial].position];
        this.target = [...views[initial].target];
        this.velocity = [0, 0, 0];
        this.targetVelocity = [0, 0, 0];
        this.clock = 0;
    }

    goTo(view, reducedMotion = false) {
        if (!this.views[view]) view = 'home';
        this.view = view;
        if (reducedMotion) {
            this.position = [...this.views[view].position];
            this.target = [...this.views[view].target];
            this.velocity.fill(0);
            this.targetVelocity.fill(0);
        }
    }

    update(dt, reducedMotion = false) {
        const elapsed = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.1)) : 0;
        if (reducedMotion) this.goTo(this.view, true);
        else {
            this.clock += elapsed;
            this.damp(this.position, this.velocity, this.views[this.view].position, elapsed);
            this.damp(this.target, this.targetVelocity, this.views[this.view].target, elapsed);
        }
    }

    damp(value, velocity, destination, dt) {
        const omega = 2.8, decay = Math.exp(-omega * dt);
        for (let i = 0; i < 3; i++) {
            const change = value[i] - destination[i];
            const step = (velocity[i] + omega * change) * dt;
            value[i] = destination[i] + (change + step) * decay;
            velocity[i] = (velocity[i] - omega * step) * decay;
        }
    }

    apply(camera, reducedMotion = false) {
        const drift = reducedMotion ? 0 : Math.sin(this.clock * 0.16) * 0.18;
        camera.position.set(this.position[0], this.position[1] + drift, this.position[2]);
        camera.lookAt(this.target[0], this.target[1] + drift * 0.25, this.target[2]);
        camera.updateMatrixWorld();
    }
}

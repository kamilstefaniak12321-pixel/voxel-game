import * as THREE from 'three';

// ------------------------------------------------------------
// Miękka, okrągła poświata (biały środek, przezroczysty brzeg)
// do świecących rzeczy w świecie: kula ognia meteorytu, jej
// warkocz, kule światła. Tworzona raz i używana wszędzie.
// ------------------------------------------------------------

let glowTexture = null;


export function getGlowTexture() {

    if (glowTexture) {
        return glowTexture;
    }


    const size = 64;

    const canvas = document.createElement('canvas');

    canvas.width = size;
    canvas.height = size;

    const context = canvas.getContext('2d');

    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);

    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.25)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);


    glowTexture = new THREE.CanvasTexture(canvas);

    glowTexture.colorSpace = THREE.SRGBColorSpace;

    return glowTexture;

}


// Świecąca kulka (sprite) w podanym kolorze.

export function createGlowSprite(color, size) {

    const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
            map: getGlowTexture(),
            color,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false
        })
    );

    sprite.scale.setScalar(size);

    return sprite;

}

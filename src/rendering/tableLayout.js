// ------------------------------------------------------------
// UKŁAD BLATU STOŁU NA DWA BLOKI (stolarski 0.90.0, krawiecki 1.27.0)
//
// Modele na blacie rysuje się w układzie stołu przodem na północ
// (względem środka części A) i obraca o TABLE_ROTATION. Część B leży na
// -x; jej cztery ćwiartki (wyroby) numeruje CarpenterTables.productAt.
// ------------------------------------------------------------

export const TABLE_ROTATION = { north: 0, west: Math.PI / 2, south: Math.PI, east: -Math.PI / 2 };

// Środek ćwiartki wyrobu (układ stołu przodem na północ, względem środka
// części A; część B leży na -x).
export function productSpot(index) {
    const column = index % 2, row = Math.floor(index / 2);
    return { x: (column === 0 ? 0.75 : 0.25) - 1.5, z: (row === 0 ? 0.25 : 0.75) - 0.5 };
}

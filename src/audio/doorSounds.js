import { WOODS } from '../blocks/woods.js';

// ------------------------------------------------------------
// DŹWIĘK DRZWI I KLAP ZALEŻNY OD DREWNA (1.16.0)
//
// Wszystkie drzwi grają ten sam zestaw (assets/sounds/doors/, rysuje go
// tools/dzwieki.py, grupa "drzwi"), ale każde drewno inaczej: ciężkie,
// gęste (oliwka, namorzyn, dąb) - niżej, wolniej i trochę głośniej;
// lekkie i kruche (baobab, puchowiec, wierzba) - wyżej, szybciej i ciszej.
//
// Miarą jest gęstość suchego drewna w naturze (kg/m3, w przybliżeniu -
// to liczby do brzmienia, nie do tablic). Gatunki zmyślone albo
// o niezwykłym "drewnie" (palma, jukka, dracena) dostały wartości bliskie
// temu, jak twardy i ciężki jest ich pień.
// ------------------------------------------------------------

export const WOOD_DENSITY = {
    spruce: 450, pine: 510, beech: 720, linden: 530, oak: 710, birch: 650, dark: 780,
    jablon: 750, olcha: 530, wierzba: 420, acacia: 770, bald_cypress: 510, cherry: 600,
    maple: 660, mugo: 560, olive: 950, rainbow_eucalyptus: 600, sequoia: 420, ginkgo: 480,
    jacaranda: 440, fir: 440, baobab: 250, coconut_palm: 700, larch: 590, mangrove: 1000,
    kapok: 290, joshua_tree: 380, aspen: 420, araucaria: 500, banyan: 550, dragon_tree: 460,
    cedar: 520, bristlecone: 560
};

// Zakres gęstości (najlżejsze - najcięższe) i odpowiadające mu wysokość
// oraz głośność.
export const DENSITY_RANGE = [250, 1000];
export const DOOR_PITCH = [1.22, 0.8];
export const DOOR_VOLUME = [0.8, 1.15];

// Klapa to mała płyta - gra odrobinę wyżej niż drzwi z tego samego drewna.
export const TRAPDOOR_PITCH = 1.06;

// Jak brzmi wyrób z drewna `wood`: { name, pitch, volume }.
//   kind - 'door' albo 'trapdoor', open - czy właśnie się otwiera.
export function doorSound(wood, kind = 'door', open = true) {

    const density = WOOD_DENSITY[wood] ?? 600;
    const t = Math.min(1, Math.max(0, (density - DENSITY_RANGE[0]) / (DENSITY_RANGE[1] - DENSITY_RANGE[0])));

    return {
        name: `${kind === 'trapdoor' ? 'trapdoor' : 'door'}_${open ? 'open' : 'close'}`,
        pitch: (DOOR_PITCH[0] + (DOOR_PITCH[1] - DOOR_PITCH[0]) * t) * (kind === 'trapdoor' ? TRAPDOOR_PITCH : 1),
        volume: DOOR_VOLUME[0] + (DOOR_VOLUME[1] - DOOR_VOLUME[0]) * t
    };

}

// (Każde drewno z listy ma swoją gęstość - pilnuje tego test.)
export const WOODS_WITHOUT_DENSITY = WOODS.filter((entry) => !(entry.wood in WOOD_DENSITY)).map((entry) => entry.wood);

// ------------------------------------------------------------
// ANIMACJE GRACZA - liczby do strojenia
//
// Wszystkie kąty w STOPNIACH. Znaki jak w PlayerModel.js:
//   swing  - ręka / noga do przodu (+), do tyłu (-),
//   spread - ręka / noga w bok, od ciała (+),
//   bend   - zgięcie łokcia / kolana (+),
//   lean   - pochylenie tułowia do przodu (+),
//   twist  - skręt (+ w lewo), pitch - głowa w górę (+).
//
// Krok (stride) to długość pełnego cyklu: lewa + prawa noga, w blokach.
// Im dłuższy krok przy tej samej prędkości, tym wolniej przebierają się
// nogi. Zmiana liczby -> odśwież grę (F5 w przeglądarce, gdy kamera
// nie jest w grze) i sprawdź: /animacja chodzenie, /model tempo 0.25.
// Opis: docs/gracz.md.
// ------------------------------------------------------------

export const ANIMATIONS = {

    // Stanie: oddech i lekkie kołysanie rąk.
    idle: {
        breathPeriod: 3.6,     // sekundy na jeden oddech
        breathLean: 1.2,       // klatka do tyłu przy wdechu
        armSpread: 3,          // ręce lekko od ciała
        armSway: 1.5,          // kołysanie rąk przy oddechu
        elbow: 6,              // łokcie lekko zgięte
        knee: 2
    },

    // Chód.
    walk: {
        stride: 2.4,
        legSwing: 36,          // udo do przodu / do tyłu
        kneeSwing: 50,         // zgięcie kolana, gdy noga idzie do przodu
        kneeStance: 6,         // lekkie ugięcie na stojącej nodze
        armSwing: 26,
        elbow: 10,             // stałe zgięcie łokcia
        elbowSwing: 16,        // dodatkowe, gdy ręka jest z przodu
        hipTwist: 5,           // miednica skręca się z nogą...
        chestTwist: 8,         // ...a klatka w drugą stronę
        sway: 1.5,             // przechył na nogę, na której stoi
        lean: 2,               // lekkie pochylenie do przodu
        bounce: 0              // podskok co krok (piksele)
    },

    // Bieg.
    run: {
        stride: 3.2,
        legSwing: 50,
        kneeSwing: 105,
        kneeStance: 16,
        armSwing: 48,
        elbow: 80,             // łokcie mocno zgięte (praca rąk)
        elbowSwing: 12,
        hipTwist: 7,
        chestTwist: 12,
        sway: 2,
        lean: 12,
        bounce: 0.9
    },

    // Kucanie (Shift) - poza, do której dochodzi każda inna.
    crouch: {
        pelvisLean: 24,        // miednica pochylona do przodu
        waistLean: 12,         // klatka jeszcze bardziej
        hip: 58,               // uda do przodu
        knee: 98,              // kolana mocno zgięte
        armForward: 18,        // ręce trochę do przodu
        elbow: 26,
        stride: 1.1,           // skradanie: krótkie kroki
        legSwing: 18,
        kneeSwing: 28,
        armSwing: 8
    },

    // W powietrzu: wznoszenie się po skoku (rise) i spadanie (fall).
    rise: {
        legRSwing: 32, kneeR: 58,     // prawa noga podciągnięta
        legLSwing: -8, kneeL: 22,     // lewa z tyłu
        armSwing: -18, armSpread: 14, elbow: 22,
        lean: 4
    },
    fall: {
        legRSwing: 10, kneeR: 22,
        legLSwing: 2, kneeL: 14,
        armSwing: 6, armSpread: 34, elbow: 16,
        lean: -2
    },

    // Lądowanie: nogi uginają się (tym mocniej, im szybciej spadał).
    land: {
        duration: 0.32,        // sekundy
        minSpeed: 6,           // od takiej prędkości spadania widać ugięcie
        fullSpeed: 18,         // przy tej - pełne ugięcie
        hip: 40,
        knee: 75,
        lean: 14,
        armForward: 14,
        elbow: 20
    },

    // Machnięcie ręką (niszczenie / stawianie bloku).
    swing: {
        duration: 0.28,
        arm: 75,               // prawa ręka do przodu i w dół
        spread: -12,           // trochę do środka
        elbow: 35,
        chestTwist: 14         // klatka skręca się za ręką
    },

    // Latanie (/latanie): nogi luźno, lekko do tyłu.
    fly: {
        legSwing: -6,
        knee: 10,
        armSpread: 10,
        elbow: 12,
        lean: 8                // przy ruchu - pochylenie do przodu
    },

    // Obrót ciała i głowy.
    turn: {
        headMax: 60,           // głowa obraca się tyle względem ciała
        bodyFollowSpeed: 9,    // jak szybko ciało dogania kierunek (1/s)
        strafeMax: 45          // przy ruchu w bok ciało obraca się najwyżej tyle
    },

    // Jak szybko przechodzą stany (1/s): chód <-> bieg, kucanie, powietrze.
    blend: {
        move: 8,
        run: 6,
        crouch: 12,
        air: 9
    }

};

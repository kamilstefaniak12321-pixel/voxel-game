// Spokojna pogoda dla testów, które oglądają drzewa, lasy i materiały.
// Od 1.11.0 światło zależy od pogody, a od 1.12.0 pada deszcz i jest mgła
// (świat testów o ziarnie 42 zaczyna się w deszczu frontowym). Te testy
// mają stałe progi kolorów i nie dotyczą pogody, a chmury i deszcz liczone
// programowo (CI bez karty graficznej) wydłużały je o jedną czwartą.
//   CALM_WEATHER - ustawienia: bez chmur, ich cieni i mokrej ziemi,
//   calmWeather(game) - po każdym Game.start: bez deszczu, mgły i tęczy.
// Pogodę sprawdzają osobno tools/sprawdz_pogode.mjs i sprawdz_deszcz.mjs,
// a jej shadery kompilują się w testach prawdziwej gry (światło, paczka,
// gra wieloosobowa, logi).
export const CALM_WEATHER = Object.freeze({ clouds: 'brak', cloudShadows: false, wetGround: false });

export function calmWeather(game) {
    game.rainOverride = 0;
    if (game.weather) {
        game.weather.fogOverride = 0;
        game.weather.rainbowOverride = 0;
    }
    return game;
}

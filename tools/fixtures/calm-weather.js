// Spokojna pogoda dla testów, które oglądają drzewa, lasy i materiały.
// Od 1.11.0 światło zależy od pogody, a od 1.12.0 pada deszcz i jest mgła
// (świat testów o ziarnie 42 zaczyna się w deszczu frontowym). Te testy
// mają stałe progi kolorów i nie dotyczą pogody, a chmury i deszcz liczone
// programowo (CI bez karty graficznej) wydłużały je o jedną czwartą.
//   CALM_WEATHER - ustawienia: bez chmur, ich cieni, mokrej ziemi
//                  i pokrywy śnieżnej (od 1.14.0); bez chmur nie ma też
//                  pyłu, piasku, wirów pyłowych ani sztormu (od 1.15.0),
//   calmWeather(game) - po każdym Game.start: bez deszczu, mgły, tęczy,
//                       gradu i burzy.
// Pogodę sprawdzają osobno tools/sprawdz_pogode.mjs, sprawdz_deszcz.mjs
// i sprawdz_burze.mjs,
// a jej shadery kompilują się w testach prawdziwej gry (światło, paczka,
// gra wieloosobowa, logi).
export const CALM_WEATHER = Object.freeze({ clouds: 'brak', cloudShadows: false, wetGround: false, snowCover: false });

export function calmWeather(game) {
    game.rainOverride = 0;
    if (game.weather) {
        game.weather.fogOverride = 0;
        game.weather.rainbowOverride = 0;
        game.weather.hailOverride = 0;
    }
    // (Od 1.13.0: bez błysków i piorunów.)
    if (game.thunder) game.thunder.enabled = false;
    return game;
}

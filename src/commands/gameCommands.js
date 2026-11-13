// ------------------------------------------------------------
// KOMENDY GRY
//
// Każda nowa rzecz w grze powinna dostać komendę, którą da się ją
// szybko sprawdzić (patrz docs/komendy.md). Opis budowy komendy jest
// w CommandRegistry.js.
//
// Od 0.96.0 komendy leżą w plikach według tematu, a ten plik tylko
// składa je w jedną listę (kolejność = kolejność na liście /pomoc):
//
//   generalCommands.js     - logi, pomoc, czyszczenie czatu
//   skyCommands.js         - czas, niebo, księżyc, pogoda
//   playerCommands.js      - gracz, ekwipunek, energia, model i animacje
//   worldCommands.js       - bloki i świat: rośliny, drzewa, woda
//   lightCommands.js       - światło i sceny testowe
//   terrainCommands.js     - generator terenu, biomy, mapa
//   settingsCommands.js    - daleki teren, ustawienia, wydajność
//   achievementCommands.js - osiągnięcia i sekret
//   commandHelpers.js      - czytanie argumentów, wspólne dla wszystkich
//
// Nową komendę dopisz do pliku z jej tematu.
// ------------------------------------------------------------

import { GENERAL_COMMANDS } from './generalCommands.js';
import { SKY_COMMANDS } from './skyCommands.js';
import { PLAYER_COMMANDS } from './playerCommands.js';
import { WORLD_COMMANDS } from './worldCommands.js';
import { LIGHT_COMMANDS } from './lightCommands.js';
import { TERRAIN_COMMANDS } from './terrainCommands.js';
import { SETTINGS_COMMANDS } from './settingsCommands.js';
import { ACHIEVEMENT_COMMANDS } from './achievementCommands.js';

export { SETTING_WORDS } from './settingsCommands.js';
export { setSceneTime } from './lightCommands.js';

export const GAME_COMMANDS = [
    ...GENERAL_COMMANDS,
    ...SKY_COMMANDS,
    ...PLAYER_COMMANDS,
    ...WORLD_COMMANDS,
    ...LIGHT_COMMANDS,
    ...TERRAIN_COMMANDS,
    ...SETTINGS_COMMANDS,
    ...ACHIEVEMENT_COMMANDS
];

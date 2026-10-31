# Numery bloków (2 bajty, od 0.30.0)

Każdy blok ma numer, który zapisuje się w chunku (i w zapisie świata).
Do 0.29.0 numer zajmował **1 bajt** - najwyżej 255 bloków, a zostało ich
kilkadziesiąt wolnych. Od 0.30.0 chunk trzyma numery w `Uint16Array`
(**2 bajty**): bloki mogą mieć numery **1-65279**, czyli kilkaset razy
więcej niż dotąd - bez kolejnej zmiany zapisu.

## Zakresy

| numery | dla czego |
|---|---|
| 1-99, 240-255 | bloki gry (dotychczasowe) |
| 256-999 | nowe bloki gry |
| 100-239 | dawny zakres paczek: paczki drzew od dołu (100, 110...), paczki roślin od góry (amarantus 237-239) |
| 1000-4999 | paczki drzew (po 10 numerów; `node tools/drzewa.mjs` nada wolny - najpierw w 100-239) |
| 5000-9999 | paczki roślin (etapy po kolei, `docs/rosliny.md`; kocanka 5000-5002, lawenda 5003-5005, piwonia 5006-5008, zawilec 5009-5011, dzwonek 5012-5014, szałwia 5015-5017, nagietek 5018-5020, cynia 5021-5023, mikołajek 5024-5026, barwinek 5027-5029, len 5030-5032, gorczyca 5033-5035, porosty 5036-5044, huba 5045-5047) |
| 10000-65279 | wolne na przyszłość |
| 65280-65535 | zarezerwowane dla gry, nigdy w zapisie (np. odcienie trawy dalekiego terenu) |

Stałe: `MAX_BLOCK_ID` w `src/blocks/BlockRegistry.js` (tam też ta lista),
`TREE_ID_RANGES` w `src/blocks/treePacks.js`, `PLANT_ID_RANGES`
w `src/blocks/plantPacks.js`. **Raz nadanego numeru nie wolno zmieniać.**

## Zapis świata

- W grze chunk ma zawsze `Uint16Array` (2 bajty na blok - chunk w pamięci
  jest o 32 KB większy).
- Do bazy (`WorldStorage.packChunkBlocks`) chunk trafia jako **1 bajt na
  blok**, gdy wszystkie numery są do 255 (jak dotąd - zapis nie rośnie),
  a jako 2 bajty, gdy jest w nim blok o większym numerze.
- Wczytanie przyjmuje oba (`Chunk.loadBlocks`), więc **stare światy
  działają bez żadnej zmiany**. Wersja formatu świata: 2.
- Starsza wersja gry (sprzed 0.30.0) nie wczyta poprawnie chunka z blokiem
  o numerze ponad 255 - dotyczy tylko powrotu do starej wersji.

## Błąd 0.31.0-0.40.0 i naprawa (0.40.1)

Generator terenu realistycznego budował chunk w kolumnie z 1-bajtowymi
numerami (`columnBuffer`), więc rośliny z paczek (5000+) trafiały do
świata z obciętym numerem (5000 -> 136, 5003 -> 139...) - jako nieznane,
niewidoczne bloki. Od 0.40.1 kolumna ma 2 bajty, a zapisany chunk
z takimi numerami jest naprawiany przy wczytaniu: nieznany numer 0-255,
który pasuje do dokładnie jednej rośliny z paczki (`numer & 255`), wraca
do niej (`BlockRegistry.TRUNCATED_PLANT_IDS`, `Chunk.loadBlocks`). Teren
klasyczny i laboratorium światła nie miały tego błędu.

## Sprawdzenie

`node tools/sprawdz_numery_blokow.mjs` (część `npm test`): numer 60000
w chunku, zapis 1 / 2 bajty, stary i nowy zapis, prawdziwe `WorldStorage`
z bazą w pamięci, nieznane numery, zakresy paczek, materiały dalekiego
terenu (Uint16 bez zawijania), kolumny generatorów, prawdziwy chunk terenu
realistycznego z rośliną z paczki (pełny numer) i naprawa obciętych
numerów ze starego zapisu.

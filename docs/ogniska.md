# Ogniska

Od wersji 0.51.0 ognisko buduje się w świecie, bez przedmiotu „ognisko”.

1. W craftingu połącz pień (także okorowany) z siekierą: dostaniesz **4 opały**, a siekiera zostanie w siatce.
2. Opałem kliknij PPM suche, stałe podłoże. Kolejne kliknięcia dokładają polana, aż będzie ich **6**.
3. Dodaj jedną krótką lub wysoką trawę jako tymczasową podpałkę.
4. Z dwóch patyków zrób **starter ognia**. Skieruj celownik na ognisko i trzymaj PPM przez **5 sekund**. Na telefonie przytrzymaj „Postaw”. Starter pozostaje w ekwipunku.

Można mieszać dziewięć gatunków drewna: dąb, brzozę, świerk, sosnę, buk, lipę, olchę, wierzbę i jabłoń. Każde polano zachowuje swój model i teksturę. Na tym etapie wszystkie gatunki palą się tyle samo: **około 8 minut aktywnej gry**. Różnice w czasie spalania, cieple i dymieniu poszczególnych gatunków pozostają na następny etap.

W czasie spalania drewno stopniowo czernieje i pokazuje żarzące szczeliny. Po wypaleniu wszystkie polana osiadają w ciągu 2,4 sekundy, zostawiając popiół i żar, który przygasa przez 90 sekund. Na żar i popiół można znów dokładać opał. Ponowne rozpalenie wymaga kompletu sześciu polan, nowej podpałki i startera. Do płonącego, pełnego stosu nie dokłada się siódmego polana.

Niedokończone, niepalące się ognisko można rozebrać: odzyskuje się świeży opał i niewykorzystaną podpałkę. Zwęglonego drewna nie da się zamienić z powrotem w świeży opał. Przy pełnym ekwipunku rozbiórka, także przez usunięcie podłoża, zostaje zablokowana zamiast gubić przedmioty.

Stan polan, podpałki, spalania, żaru i popiołu zapisuje się wraz ze światem. Ogniska poza wczytanymi chunkami nadal odmierzają czas aktywnej gry. Zamknięcie gry lub pauza zatrzymuje ten czas; zapis nie wznawia samoczynnie niedokończonego trzymania startera.

## Grafika i koszt

- Model polan pochodzi z zatwierdzonego pliku Blockbench; jeden piksel odpowiada 1/16 bloku. Źródła i dziewięć atlasów są w `assets/models/campfire/`.
- Od 0.51.1 płomienie animuje 16 klatek tekstury przy 12 klatkach/s. Atlas powstaje raz z zatwierdzonej sylwetki, a ogniska mają przesunięte fazy animacji. Dodatkowe falowanie modelu ma połowę pierwotnej amplitudy. Wysokość nadal rośnie podczas rozpalania. Dym i rzadkie iskry korzystają ze wspólnej puli maksymalnie 96 drobin.
- Popiół ma kwadratowy obrys ze schodkami na siatce 1/16 bloku; węgle tworzą nieregularny układ prostokątny.
- Ciepłe światło migocze delikatnie. Najbliższe **4 ogniska** oświetlają otoczenie i rzucają cienie terenu oraz roślin. Zasięg każdego źródła łagodnie wygasa do 16 bloków.
- Jedna tekstura głębi mieści cztery zestawy sześciu kierunków po 256 × 256. Mapa powstaje przy zmianie źródła lub pobliskiego mesha; samo migotanie nie odświeża map ani chunków. Aktualizowany jest najwyżej jeden zestaw na 0,1 s, rotacyjnie między źródłami.
- Widoczne modele mają limit 32 ognisk w promieniu 72 bloków. Limit grafiki nie wpływa na zapis i spalanie.
- Ustawienie „Dynamiczne światło” steruje dodatkowym oświetleniem ognisk. Płomień, żar, dym i stan gry działają również bez niego.

Logika: `CampfireState.js`, interakcje: `Campfires.js`, modele i drobiny: `CampfireRenderer.js`, światło i cienie: `CampfireLight.js`.

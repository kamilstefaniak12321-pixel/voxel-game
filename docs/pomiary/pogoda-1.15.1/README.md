# Pogoda w 1.15.1 na RTX 3050 Laptop

Porównanie z wersją 1.15.0 obejmuje tę samą grę, seed 42, pozycje kamery, pory dnia i ustawienia. Obie wersje działały w osobnych profilach na NVIDIA GeForce RTX 3050 Laptop przez ANGLE D3D11, w 1920 × 1080, przy skali 100%, włączonym antyaliasingu, pełnych chmurach i poziomie cieni 2. Zasięg szczegółów wynosił 128 bloków, a dalekiego terenu 1536 bloków.

| Scena | 1.15.0, mediana / P95 [ms] | 1.15.1, mediana / P95 [ms] |
| --- | ---: | ---: |
| Ulewa przy ziemi | 15,1 / 16,3 | 15,0 / 17,1 |
| Chmury pierzaste | 9,7 / 10,6 | 9,8 / 10,8 |
| Otwarta woda w sztormie | 15,8 / 19,2 | 15,7 / 19,7 |
| Burza oglądana znad chmur | 12,9 / 19,5 | 12,3 / 18,0 |

Próbka zawiera 110 klatek każdej sceny po rozgrzaniu. Mierzony odcinek zaczyna się przed aktualizacją gry i kończy po renderowaniu oraz synchronicznym odczycie jednego piksela, który czeka na GPU. Wynik pokazuje koszt całej klatki w tej próbie. Próg 60 FPS to 16,7 ms.

W ulewie przy ziemi obie wersje generowały 6000 smug. Nad górną warstwą chmur na wysokości oczu 1201,6 bloku ich liczba spadła z 4745 do zera. W cirrusach widać więcej błękitu pomiędzy krótszymi włóknami. [Porównanie pogody](pogoda-porownanie.jpg)

W naturalnej pogodzie tęcza pojawiła się o 17:00 trzeciego dnia. Po przyspieszeniu czasu w 1.15.0 jej fragment był nadal widoczny około 22:14. W 1.15.1 zniknął, gdy Słońce znalazło się pod horyzontem. W osobnej próbie z wymuszeniem tęczy około 17:54 jej jasność w 1.15.1 spadła do 10%, a o północy do zera. W obu wersjach popołudniowy łuk zachowywał kierunek względem Słońca przy obrocie i powrocie kamery. [Porównanie tęczy](tecza-porownanie.jpg)

# Koncept liści z 8 części

Autor modelu i tekstury: **Kamil**. Źródło: dostarczony plik
`koncept na bardziej realistyczne liście.bbmodel`; jego SHA-256 i SHA-256
osadzonej tekstury zapisuje `model-data.js`.

Blok liści dzieli się na osiem sześcianów 8 × 8 × 8 pikseli. Ich położenie
jest takie jak w modelu - części są lekko przesunięte (najwyżej o piksel
poza blok u góry), więc korona ma nierówny brzeg. Importer przelicza
wierzchołki do współrzędnych komórki (0..1) i zapisuje UV każdej ściany.

`texture.png` to oryginalny osadzony PNG 16 × 16 - wzór, z którego model
bierze układ ćwiartek. W grze każda część używa tekstury liści **swojego
gatunku drzewa** (dąb, brzoza, świerk...), z tym samym układem UV co
w modelu, i barwy biomu jak zwykłe liście.

```text
tekstura SHA-256: 5a52dec138e4e891901dfec927efd5149d0071e3d336285d9e00ed58a47ed5cd
```

Ponowny import z katalogu repozytorium:

```sh
node tools/import_liscie.mjs "SCIEZKA_DO_PLIKU/koncept na bardziej realistyczne liście.bbmodel"
```

W grze (`addLeafParts` w `src/rendering/ChunkMesher.js`):

- ściana części zakryta w całości inną częścią nie jest rysowana,
- ściana na krawędzi bloku znika przy pełnym sąsiedzie i w głębi korony
  jak ściana zwykłych liści; cofnięta w głąb bloku - przy każdym sąsiednim
  bloku liści,
- światło i cienie narożników - z rogów ściany bloku (interpolacja),
- każda część kołysze się osobno: lekkie przesunięcie w shaderze liści
  (`plantMotion` - siła i faza losowe dla części), wyłączane razem
  z kołysaniem roślin.

Pojedynczy blok: 42 ściany zamiast 6; korona 7 × 7 × 7 - ok. 5 razy więcej
ścian niż z blokami. Dlatego na telefonie domyślne są zwykłe bloki, a tryb
*potato* zawsze ich używa.

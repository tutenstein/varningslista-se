# varningslista.se (çalışma adı)

İsveç'teki kamuya açık olay ve uyarı verilerini (Polisen, SMHI, Trafikverket) toplayıp
kendi veritabanımızda (Firestore) biriktiren servis. Ön yüz sonraki aşamada eklenecek.

- Veri kaynakları ve gerekçeler: [docs/veri-kaynaklari.md](docs/veri-kaynaklari.md)
- Kurulum ve senin yapman gerekenler: [docs/KURULUM.md](docs/KURULUM.md)

## Yapı

```
functions/              Cloud Functions (TypeScript, Node 22, europe-north1)
  src/sources/          Kaynak başına çekme + normalleştirme (polisen, smhi, trafikverket)
  src/jobs.ts           Backfill, canlı çekme, bitmiş olayları kapatma
  src/index.ts          Zamanlanmış fonksiyonlar
  src/cli/dryRun.ts     Veritabanına yazmadan canlı veriyi deneme
  test/                 Vitest testleri + gerçek veriden örnekler
firestore.rules         İstemciler yalnızca events ve sources koleksiyonlarını okuyabilir
.github/workflows/      main'e her push: test → Firebase deploy
```

## Veri akışı

| Fonksiyon | Sıklık | Ne yapar |
|---|---|---|
| `ingestPolisen` | 5 dk | Son 500 bildirimi çeker. İlk çalıştırmalarda her seferinde 1 geçmiş günü de çeker (varsayılan 14 gün ≈ 70 dk). Saatte en fazla 24 çağrı (sınır 60). |
| `ingestSmhi` | 10 dk | Güncel hava uyarıları. Yayından kalkan uyarı `avslutad` olarak işaretlenir. |
| `ingestTrafikverket` | 2 dk | İlk çalıştırmada tüm aktif durumları, sonra yalnızca değişiklikleri (`changeid`) çeker. API anahtarı yoksa sessizce atlanır. |
| `closeExpired` | 30 dk | Bitiş zamanı geçmiş olayları kapatır. |

Firestore koleksiyonları: `events` (birleşik olaylar, herkese açık okuma), `sources` (kaynak
durumu, herkese açık okuma), `raw_events` (kaynağın ham yanıtı), `ingest_state` (iç durum).

## Yerelde

```bash
cd functions
npm install
npm test
npm run dry-run   # canlı veriyi çeker, yalnızca ekrana yazar
```

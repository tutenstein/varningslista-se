# varningslista.se (çalışma adı)

İsveç'teki kamuya açık olay ve uyarı verilerini (Polisen, Trafikverket, SMHI) toplayıp kendi
veritabanımızda (Firestore) biriktiren ve İsveççe/İngilizce bir web sitesinde gösteren servis.

- Canlı site: https://varningslista-se.web.app (İsveççe `/`, İngilizce `/en/`)
- Veri kaynakları ve gerekçeler: [docs/veri-kaynaklari.md](docs/veri-kaynaklari.md)
- Kurulum ve senin yapman gerekenler: [docs/KURULUM.md](docs/KURULUM.md)

## Yapı

```
functions/              Cloud Functions (TypeScript, Node 22, europe-west1; Firestore europe-north1)
  src/sources/          Kaynak başına çekme + normalleştirme (polisen, smhi, trafikverket)
  src/jobs.ts           Backfill, canlı çekme, bitmiş olayları kapatma
  src/feeds.ts          Sitenin okuduğu hazır akışlar (feeds/live, week, month)
  src/index.ts          Zamanlanmış fonksiyonlar
  src/cli/              dryRun (veritabanına yazmadan deneme), trafikverketProbe
web/                    Astro statik site + Preact "island" (canlı akış), MapLibre harita
  src/views/            Sayfa gövdeleri (sv ve en aynı görünümü kullanır)
  src/components/       LiveFeed (filtre, arama, yakınımda, liste), EventMap, StatsCard
  scripts/fetch-stats.mjs  MCF + SCB istatistikleri (derleme sırasında, GitHub Actions'ta)
firestore.rules         İstemciler yalnızca feeds/* ve sources/* belgelerini okuyabilir
.github/workflows/      deploy (push), nightly (gece yeniden derleme), health (3 saatte bir kontrol)
```

## Yük dağılımı: Firebase ↔ GitHub Actions

| İş | Nerede | Neden |
|---|---|---|
| Canlı veri toplama (2–10 dk) | Cloud Functions | Dakika hassasiyetinde ve güvenilir zamanlama gerekiyor. GitHub cron'u en sık 5 dakikada bir çalışır, sık sık gecikir ve private repoda 2.000 dk/ay ücretsiz kotayı birkaç günde bitirir. Firebase'deki maliyeti ücretsiz kota içinde. |
| Akışların hazırlanması (2 dk) | Cloud Functions (`publishFeeds`) | Yalnızca değişen olayları okur. Ziyaretçi başına tek belge okuması yapılır, olay deposuna sorgu atılmaz. |
| Sitenin derlenmesi (629 sayfa) | GitHub Actions | Her push'ta ve her gece |
| MCF/SCB istatistiklerinin çekilmesi | GitHub Actions | Derleme sırasında; Firebase'e hiç dokunmaz |
| Sağlık kontrolü | GitHub Actions (3 saatte bir) | Akış ya da bir kaynak durursa iş başarısız olur ve GitHub e-posta gönderir |
| Sitenin sunulması | Firebase Hosting (CDN) | Statik dosyalar; HTML 5 dk, varlıklar 1 yıl önbellekte |

## Veri akışı

| Fonksiyon | Sıklık | Ne yapar |
|---|---|---|
| `ingestPolisen` | 5 dk | Son 500 bildirimi çeker. Geri doldurma sırasında her çalışmada 1 geçmiş günü de çeker. Saatte en fazla 24 çağrı (sınır 60). |
| `ingestSmhi` | 10 dk | Güncel hava uyarıları (İsveççe + İngilizce). Yayından kalkan uyarı `avslutad` olur. |
| `ingestTrafikverket` | 2 dk | `Situation` 1.6, yalnızca değişiklikler (`changeid`). |
| `publishFeeds` | 2 dk | Değişen olayları `feeds/live` (48 sa + aktif uyarılar), `feeds/week`, `feeds/month` belgelerine işler. |
| `closeExpired` | 30 dk | Bitiş zamanı geçmiş olayları kapatır. |

Sitede gösterilenler: kazalar, yangınlar, kurtarma ve önemli trafik olayları. Gösterilmeyenler: suç
bildirimleri, planlı yol çalışmaları ve küçük etkili aksaklıklar. Bunlar veritabanında yine de saklanır.

## Yerelde

```bash
cd functions && npm install && npm test
npm run dry-run            # canlı veriyi çeker, yalnızca ekrana yazar
cd ../web && npm install && npm test
npm run dev                # http://localhost:4321 (canlı akışı okur)
```

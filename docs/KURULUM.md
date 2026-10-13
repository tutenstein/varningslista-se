# Kurulum – senin yapman gerekenler

Durum (2026-10-13):
- ✅ Firebase projesi `varningslista-se`, Blaze, Firestore `(default)` europe-north1, Trafikverket anahtarı
- ✅ Fonksiyonlar **europe-west1**'de (Cloud Scheduler europe-north1'de yok); veri europe-north1'de
- ✅ Site yayında: https://varningslista-se.web.app
- ✅ GitHub reposu ve `FIREBASE_SERVICE_ACCOUNT` secret'ı
- ⏳ **Açık:** europe-north1'deki işlevsiz fonksiyonların silinmesi (adım 7), Hosting rolü (adım 5), iletişim adresi (adım 6)

---

## 1. Blaze planına geç (zorunlu)

Zamanlanmış fonksiyonlar ve dış API çağrıları Blaze planında çalışıyor.

1. https://console.firebase.google.com/project/varningslista-se/usage/details → **Modify plan → Blaze**
2. Faturalandırma hesabını seç veya oluştur.
3. **Bütçe uyarısı kur** (öneri: aylık 10 €): Google Cloud Console → Billing → Budgets & alerts.

Beklenen maliyet: Ücretsiz kotalar içinde kalmalı. Cloud Scheduler'da 3 iş ücretsiz, 4. iş ayda ~0,10 $.

## 2. Firestore veritabanını aç (konum: europe-north1)

1. https://console.firebase.google.com/project/varningslista-se/firestore → **Create database**
2. **Location: `europe-north1 (Finland)`**. ⚠️ Konum sonradan değiştirilemez, başka bölge seçme.
3. **Production mode**'u seç. Kuralları deploy sırasında ben yükleyeceğim.

## 3. Trafikverket API anahtarı

1. https://data.trafikverket.se/ → kayıt ol (ücretsiz), e-postanı doğrula, bir API anahtarı oluştur.
2. Anahtarı **kendin** Secret Manager'a kaydet (anahtarı bana veya sohbete yazma):

```bash
firebase functions:secrets:set TRAFIKVERKET_API_KEY --project varningslista-se
```

Komut anahtarı soracak, yapıştır. Anahtarı henüz almadıysan `SAKNAS` yaz. Fonksiyon o zaman Trafikverket'i atlar ve diğer kaynaklar çalışmaya devam eder; anahtarı sonra aynı komutla güncellersin.

## 4. GitHub deposu

1. https://github.com/new → ad: `varningslista-se`, **Private**
2. **README, .gitignore ve lisans ekleme**, repo boş kalsın.
3. Repo URL'sini bana gönder. Remote'u ekleyip push'u ben yaparım.

## 5. GitHub Actions için deploy hesabı (service account)

1. https://console.cloud.google.com/iam-admin/serviceaccounts?project=varningslista-se → **Create service account**
   - Ad: `github-deploy`
2. Şu rolleri ver. Bu set yalnızca `firebase deploy --only functions,firestore,hosting` için gereken yetkileri içeriyor.

   | Rol | Neden |
   |---|---|
   | Cloud Functions Developer | Fonksiyonları oluşturmak ve güncellemek |
   | Service Account User | Fonksiyonu çalışma hesabı (compute SA) adına deploy etmek; Google bunu her zaman şart koşuyor |
   | Cloud Scheduler Admin | 2/5/10/30 dakikalık zamanlayıcıları oluşturmak ve güncellemek |
   | Secret Manager Viewer | CLI, Trafikverket anahtarına fonksiyonun erişimi olup olmadığını kontrol ediyor |
   | Firebase Rules Admin | `firestore.rules` yüklemek |
   | Cloud Datastore Index Admin | `firestore.indexes.json` yüklemek |
   | Service Usage Consumer | CLI, gerekli Google API'lerinin açık olduğunu kontrol ediyor |
   | Artifact Registry Reader | CLI, eski container imajları için temizlik kuralının varlığını kontrol ediyor |
   | **Firebase Hosting Admin** | Web sitesini yayınlamak (site eklendiği için yeni) |

   İlk GitHub deploy'unda bir yetki eksik çıkarsa, hata mesajı hangi yetkinin eksik olduğunu yazar. O zaman yalnızca o rolü ekleriz.
3. Hesabı aç → **Keys → Add key → Create new key → JSON**. Dosya bilgisayarına iner.
4. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `FIREBASE_SERVICE_ACCOUNT`
   - Value: JSON dosyasının tüm içeriği
5. İndirilen JSON dosyasını bilgisayarından **sil**. Repoya kesinlikle koyma; `.gitignore` bu tür dosyaları zaten dışarıda tutuyor.

> Daha güvenli bir alternatif, anahtarsız Workload Identity Federation. İstersen sonra buna geçeriz.

## 6. Canlıya çıkmadan önce

- `functions/.env` içindeki `kontakt@varningslista.se` yer tutucusunu gerçek bir iletişim adresiyle değiştir. Polisen kuralları User-Agent'ta ulaşılabilir bir adres istiyor.
- Alan adı ve marka adı (varningslista.se çalışma adı).

## 7. europe-north1'deki işlevsiz fonksiyonları sil

İlk deploy denemesinden europe-north1'de zamanlayıcısız dört fonksiyon kaldı. CLI bunları silemiyor, çünkü o bölgede Cloud Scheduler yok. Silinmedikleri sürece her tam deploy, GitHub Actions dahil, sonunda hata verir.

1. https://console.cloud.google.com/functions/list?project=varningslista-se
2. **Region = europe-north1** olan `ingestPolisen`, `ingestSmhi`, `ingestTrafikverket` ve `closeExpired` fonksiyonlarını seç → **Delete**
3. ⚠️ europe-west1 olanlara dokunma.

## İsteğe bağlı

- Yerel Firebase CLI'ın eski (13.34). Güncellemek için:

```bash
npm install -g firebase-tools
```

---

## Backfill'i ve akışları yeniden kurmak

- Polisen geçmişi: `functions/src/jobs.ts` içinde `BACKFILL_VERSION` değerini artır ve deploy et. Sonraki çalıştırmalar `BACKFILL_DAYS` kadar günü yeniden çeker.
- Site akışları: `functions/src/feeds.ts` içinde `FEED_VERSION` değerini artır ve deploy et. Sonraki çalıştırma akışları baştan kurar.

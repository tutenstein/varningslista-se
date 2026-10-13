# Kurulum – senin yapman gerekenler

Durum (2026-10-13):
- ✅ Firebase projesi oluşturuldu: **`varningslista-se`** (hesap: slhmtnn06@gmail.com)
- ✅ Kod hazır: toplayıcılar, testler (37/37), GitHub Actions iş akışı
- ⏳ Aşağıdaki adımlar senin hesabın ya da onayın gerektirdiği için sende

Sıra önemli: 1 → 2 → 3 bitince ilk deploy'u ben yaparım. 4 ve 5 bitince deploy'lar GitHub üzerinden otomatik olur.

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
2. Şu rolleri ver:
   - Firebase Admin
   - Cloud Functions Admin
   - Cloud Run Admin
   - Cloud Scheduler Admin
   - Secret Manager Admin
   - Artifact Registry Administrator
   - Service Account User
   - Service Usage Consumer
3. Hesabı aç → **Keys → Add key → Create new key → JSON**. Dosya bilgisayarına iner.
4. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `FIREBASE_SERVICE_ACCOUNT`
   - Value: JSON dosyasının tüm içeriği
5. İndirilen JSON dosyasını bilgisayarından **sil**. Repoya kesinlikle koyma; `.gitignore` bu tür dosyaları zaten dışarıda tutuyor.

> Daha güvenli bir alternatif, anahtarsız Workload Identity Federation. İstersen sonra buna geçeriz.

## 6. Canlıya çıkmadan önce

- `functions/.env` içindeki `kontakt@varningslista.se` yer tutucusunu gerçek bir iletişim adresiyle değiştir. Polisen kuralları User-Agent'ta ulaşılabilir bir adres istiyor.
- Alan adı ve marka adı (varningslista.se çalışma adı).

## İsteğe bağlı

- Yerel Firebase CLI'ın eski (13.34). Güncellemek için:

```bash
npm install -g firebase-tools
```

---

## Benim sonraki adımlarım (1–3 bitince)

1. İlk deploy'u bu makineden yaparım. Bu, gerekli Google API'lerini de açar.
2. İlk çalıştırmalarda backfill başlar: son 14 gün, her 5 dakikada 1 gün, yaklaşık 70 dakika.
3. `sources/*` belgelerinden çalışmayı kontrol ederim: son başarılı çalışma, hata sayısı, yazılan kayıt sayısı.
4. Repo hazır olunca push ederim ve GitHub Actions deploy'unu doğrularım.

## Backfill'i yeniden başlatmak

Firestore → `ingest_state/polisen` belgesinde `backfill` alanını sil. Sonraki çalıştırma `BACKFILL_DAYS` (functions/.env) kadar günü yeniden kuyruğa alır.

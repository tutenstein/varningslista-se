# Veri Kaynakları – varningslista.se (çalışma adı)

> Araştırma tarihi: 2026-10-13. Bu dokümanda kod yok; yalnızca bulgular ve öneriler var.
> Referans site (hälytyslista.fi) **yalnızca işlevsel referans** olarak kullanıldı. Tasarımı, düzeni, renkleri, ikonları ve metinleri kopyalanmayacak.
> Bot korumasını aşan scraping yöntemleri değerlendirme dışında tutuldu. Yalnızca resmi API'ler, açık veri, RSS ve lisans/sözleşme yolları ele alındı.

---

## 1. hälytyslista.fi ne yapıyor? (işlevsel özet)

Finlandiya'daki kurtarma ve acil durum görevlerini ve trafik olaylarını kamuya açık kaynaklardan toplayıp neredeyse gerçek zamanlı gösteren **bağımsız** bir durum görünümü. Kendisini resmi hizmet olarak tanıtmıyor; acil durumda 112'yi aramayı öneriyor.

**Veri türleri**
- Kurtarma görevleri: bina yangını, diğer yangınlar, insan kurtarma, hasar önleme görevleri
- Karayolu trafik kazaları ve trafik aksaklıkları (yol numarası ve durum bilgisiyle, ör. "devam ediyor" / "bitti")
- Olaylarla eşleştirilmiş yerel haber bağlantıları

**Kaynaklar (/info sayfasına göre)**
| Kaynak | Ne için | Yoklama sıklığı |
|---|---|---|
| Bölgesel kurtarma müdürlüklerinin basın bülteni akışları (otiedote.fi) | Kurtarma görevleri | ~2 dk |
| Fintraffic Digitraffic Road API | Trafik bildirimleri ve kazalar | ~2 dk |
| Yerel haber akışı + otomatik sınıflandırma | Haberden çıkarılan olaylar (99 görev sınıfı, konum ve zaman tahmini, tekilleştirme) | ~30 dk |
| poliisi.fi | Ek bilgi | – |

Önemli bağlam: Sitenin blogundaki bilgiye göre Finlandiya'daki ulusal otomatik alarm akışı 1 Eylül 2026'da kapandı. Site bu yüzden birden çok kaynağı birleştiriyor ve kapsamı eksik olabiliyor. **İsveç'te de ulusal ve açık bir canlı kurtarma görevi akışı yok** (bkz. §2), yani benzer bir birleştirme modeli gerekecek.

**Kullanıcı özellikleri**
- 24 saat / 7 gün / 30 gün görünümleri (geçmiş en fazla 30 gün)
- Serbest metin araması: görev türü, yer, bölge, açıklama, yol numarası
- "Yakınımda": tarayıcı konumuyla 5 / 10 / 25 / 50 / 100 km yarıçap (konum yaklaşık 100 m'ye yuvarlanıyor, saklanmıyor)
- Bölge ve belediye sayfaları, A–Ö belediye dizini
- Görev türü sayfaları ve yol sayfaları (/liikenne/tie/N)
- Sayaçlar ve istatistikler: son 24 saat / 30 gün sayıları, en sık görev türleri, en aktif bölgeler
- Haberler (/uutiset), kaynaklar ve kapsam (/info), güvenlik rehberleri (/blog: 72 saatlik hazırlık, yangın, 112, uyarı sireni vb.)
- Olay başına: zaman (kesin veya "~sabah" gibi tahmini), tür, şiddet etiketi, durum, belediye ve bölge, yol, kaynak bağlantısı, kısa açıklama. **Sokak adresi gösterilmiyor**, konum belediye düzeyinde.
- Kaynak başına "son gözlem zamanı" gösterimi
- Hesap, takip listesi, bildirim, RSS veya API sunulmuyor; analitik ve reklam olabileceği belirtiliyor.

---

## 2. İsveç kaynak tablosu

Durum sütunu: ✅ = bu araştırmada uç nokta canlı olarak doğrulandı · 📄 = resmi dokümandan doğrulandı · ⚠️ = doğrulanamadı / belirsiz

### 2a. Gerçek zamanlıya yakın olay kaynakları

| Kaynak | Verdiği veri | Erişim yolu | Lisans / şartlar | Güncelleme / gecikme | Konum bilgisi | Kişisel veri / GDPR | Maliyet / kayıt | Durum |
|---|---|---|---|---|---|---|---|---|
| **Polisen – händelser API**<br>`https://polisen.se/api/events` | Polis olay bildirimleri. Yangın ("Brand"), trafik kazası ("Trafikolycka", "…, personskada", "…, singel", "…, vilt"), iş kazası, kayıp kişi, trafik engeli, suçlar, gece özetleri vb. Örnekte ~60 farklı tür vardı. | JSON REST. Filtreler: `DateTime` (ay/gün/saat), `locationname` (il/belediye, `;` ile çoklu), `type`. Ayrıca il bazlı **RSS** akışları var (`polisen.se/aktuellt/rss/...`). | Serbest kullanım, **kaynak olarak Polismyndigheten belirtilmeli**. "Regler för öppna data": çağrılar arası ≥10 sn, **≤60 çağrı/saat**, ≤1 440/gün. Uygulamayı ve iletişim bilgisini içeren **User-Agent zorunlu**, yalnızca HTTPS, 404 kalıcı sayılır. İhlalde 429/403 veya engelleme. | Son **500** bildirim (örnekte ~12 günlük pencere). Yayın genelde olaydan birkaç saat sonra. Bildirimler sonradan güncellenebiliyor. | `location.name` il veya belediye adı; `gps` **belediye/il merkez noktası**, olay yeri değil. Başlıkta "gün saat, tür, belediye" var. Özette sokak adı geçebiliyor. | Polis "kişisel veri içermez" diyor. Yine de serbest metinde yer adları geçiyor; suç bildirimlerini göstermek ürün kararı. | Ücretsiz, kayıt yok | ✅ |
| **Trafikverket – Öppet API för trafikinformation**<br>`https://api.trafikinfo.trafikverket.se/v2/data.json` | `Situation` / `Deviation`: kazalar (olycka), yol çalışmaları, engeller, trafik sıkışıklığı, kısıtlamalar, feribot değişiklikleri, kar küreme konvoyu, önemli trafik bilgisi. Ayrıca kameralar, yol hava durumu, tren verisi. | POST (XML sorgu gövdesi + `authenticationkey`), JSON/XML yanıt. Değişiklik takibi ve **SSE ile abonelik** destekleniyor (resmi dokümanda doğrulanmalı). Alternatif: **DATEX II** akışı. | **CC0 1.0** (kayıtta kabul edilen lisans). Trafikverket servis başına trafik hacmini izliyor, dokümandaki limitler aşılırsa iletişime geçiyor. | Gerçek zamanlı (dakikalar) | **WGS84 ve SWEREF99 TM** geometri (nokta/çizgi), il kodu (`CountyNo`), yol numarası, konum tanımı. | Kişisel veri yok | Ücretsiz. data.trafikverket.se veya Trafiklab üzerinden **kayıt ve API anahtarı** gerekli. | 📄 (alan adları ⚠️ resmi şemadan kontrol edilmeli) |
| **SMHI – etkiye dayalı hava uyarıları (IBWW)**<br>`https://opendata-download-warnings.smhi.se/ibww/api/version/1/warning.json` | Sarı/turuncu/kırmızı hava uyarıları, "Meddelande" seviyesi bildirimler, su kıtlığı, sel, orman yangını riski vb. | JSON REST | SMHI açık verisi **CC BY 4.0**. Uyarılar için ayrı şart: ticari kullanım dahil serbest, ancak **içerik değiştirilemez ve kaynak her zaman belirtilmeli**. Gereksiz tekrar indirmeden kaçınılmalı, önbellek kullanılmalı. | Olay odaklı, dakikalar | Uyarı alanları (il, alan adı); poligon geometri mevcut. | Yok | Ücretsiz, kayıt yok | ✅ |
| **Krisinformation.se API v3**<br>`https://api.krisinformation.se/v3` (`/news`, `/vmas`) | Yetkili kurumların kriz haberleri ve **VMA** (Viktigt meddelande till allmänheten). VMA filtreleri: dil, il (`counties`), `allCounties`. | JSON REST | Yayıncı: **Myndigheten för civilt försvar (MCF)**; MSB 1 Ocak 2026'da bu adı aldı. Kullanım şartları (06/2026 PDF): API "olduğu gibi" sunuluyor, kurum değiştirebilir veya kapatabilir, aşırı yükte IP engeli uygulanabilir, **önbellek önerilir**. Bilginin yeniden kullanımı ilgili mevzuata (PSI / öppna data-lagen) tabi. Görsellerde telif olabilir, kaynak belirtilmeli. | Olay odaklı | Alan/il bilgisi ve koordinat beklenir ⚠️ | Yok | Ücretsiz, kayıt yok | ⚠️ Test sırasında API **503 / Akamai hatası** döndü, şema doğrulanamadı. |
| **VMA (dağıtım)** | Halka yönelik acil uyarılar (ör. "Hesa Fredrik" sireni, gaz/yangın dumanı) | Sveriges Radio ile yayılıyor. Makine okunur kopyası **Krisinformation `/vmas`** üzerinden alınmalı. | Krisinformation ile aynı | Anında | İl düzeyi | Yok | Ücretsiz | 📄 |
| **SOS Alarm (112)** | 112 olayları; "112-appen" yakındaki yangın, trafik kazası, patlama, tekne kazası gibi olayları gösteriyor. | **Açık API veya açık veri bulunamadı.** Olay verisine erişim tarihsel olarak yalnızca kurtarma birimlerine ve onayla verilmiş. Yıllık "112-rapport" istatistikleri PDF olarak var. | SOS Alarm kamu kurumu değil, şirket (devlet ve SKR ortaklığı); offentlighetsprincipen doğrudan uygulanmıyor. | – | – | Hassas olabilir | **Sözleşme gerekir** (iletişim kurulmalı) | ⚠️ sosalarm.se otomatik erişime 403 döndü. |
| **Belediye/bölge räddningstjänst siteleri** | Bazı birimler "son alarmlar / larmregister" listesi yayımlıyor: tür, zaman, yer, belediye. Örnekler: Räddningstjänsten Syd (`rsyd.se/pressrum/sos-arkiv/`, aynı gün güncel), Kristianstad "Utryckningar", SERF "Larmregister", Gästrike Räddningstjänst "Inkomna larm", Räddningstjänstsamverkan Småland-Blekinge. | Çoğunlukla **yalnızca HTML**. İncelenenlerde RSS veya API yok. Bazılarının basın odası Mynewsdesk'te (Mynewsdesk RSS sağlar ⚠️). | Site bazında farklı. Açık lisans yok. | Birimden birime değişir (aynı gün ile haftalar arası) | Mahalle/yer adı + belediye | Adres düzeyi veri olabilir, dikkat | Ücretsiz, ancak **kullanım için yazılı izin veya sözleşme önerilir** | ⚠️ parçalı, ~150 kurtarma birimi var |
| **Haber kaynakları (SVT lokalt vb.)** | Bölgesel haberler (yangın, kaza) | SVT'nin il bazlı **RSS** akışları var (ör. `svt.se/nyheter/lokalt/skane/rss.xml`, `svt.se/nyheter/inrikes/rss.xml`, 200 OK doğrulandı). | RSS'in yeniden yayımı için açık lisans **bulunamadı**. Telif saklı. Güvenli yol: yalnızca başlık + bağlantı + kısa kendi özetimiz, ya da lisans sözleşmesi (TT, Mynewsdesk, medya grupları). | Dakikalar | Metinden çıkarım gerekir | İsimler geçebilir, dikkat | RSS ücretsiz; ticari lisans ücretli | 📄 / ⚠️ lisans |
| **Sveriges Radio Öppet API** (`api.sr.se`) | Trafik mesajları, program verisi | REST | API **artık bakımı yapılmıyor** ama çalışıyor. İçerik yalnızca bağlantı veya akış ile kullanılabilir, depolanamaz, değiştirilemez. | – | Bölge | – | Ücretsiz | 📄 Yeni projede **önerilmez** |

### 2b. İstatistik kaynakları (gerçek zamanlı değil)

| Kaynak | Verdiği veri | Erişim | Lisans | Güncelleme | Konum | Kişisel veri | Maliyet | Durum |
|---|---|---|---|---|---|---|---|---|
| **MCF (eski MSB) – Räddningstjänstens insatser** (eski IDA'nın yerini alan PxWeb)<br>`https://statistik.mcf.se/PXWeb/api/v1/sv/PxData/B` | Kurtarma birimlerinin tüm olay raporları (insatsrapporter): B1 tüm olaylar, B2 bina yangınları, B3 konut yangınları, B4 araç yangınları, B5 orman ve arazi yangınları, B6 trafik kazaları, B7 boğulmalar. Ayrıca A: yangında ölümler. | **PxWeb REST API** (Tillväxtanalys ile aynı teknoloji), JSON/CSV | Resmi istatistik, açık. Kaynak gösterilmeli ⚠️ (lisans metni kontrol edilmeli) | **Yıllık**. 2025 verisi 2026-03-10/17'de yayımlandı, 2026 verisi ~Mart 2027'de. | **Belediye (290)**, ay, haftanın günü, saat | Toplu veri, kişisel veri yok | Ücretsiz, kayıt yok | ✅ (B10 tablosunun değişkenleri doğrulandı) |
| **SOS Alarm 112-rapport** | 112 çağrı sayıları, ambulans/kurtarma/polis dağılımı, il düzeyi | PDF / web | – | Yıllık | İl | Yok | Ücretsiz | 📄 |
| **Trafikanalys / STRADA** | Trafik kazası ve yaralanma istatistiği | Trafikanalys istatistikleri; STRADA ham verisi başvuruyla | Resmi istatistik | Aylık/yıllık | Belediye/il | Ham veri hassas | Ham veri başvuruyla | ⚠️ ayrıca araştırılabilir |

### 2c. Yardımcı (referans) veriler

| Kaynak | Kullanım | Lisans |
|---|---|---|
| SCB belediye ve il kodları (kommunkoder, länskoder) ve nüfus | Belediye dizini, "1000 kişi başına" oranlar, A–Ö listesi | SCB açık veri (CC0 / CC BY) |
| Lantmäteriet açık veriler (ör. ortsnamn, kommungränser) | Yer adı → belediye eşlemesi, "yakınımda" için sınırlar | Açık veri bölümü CC0 ⚠️ |
| Trafikverket NVDB / Lastkajen | Yol numarası → geometri, yol sayfaları | CC0 |

---

## 3. Özellik eşlemesi: hälytyslista.fi → İsveç

| hälytyslista.fi özelliği | İsveç'te yapılabilir mi? | Kaynak | Not |
|---|---|---|---|
| Trafik kazaları ve aksaklıkları (canlı) | ✅ **Tam** | Trafikverket Situation/Deviation (+ Polisen "Trafikolycka") | Digitraffic'e en yakın karşılık. Koordinat, il ve yol numarası var. Digitraffic'ten daha zengin. |
| Yol sayfaları (yol numarasına göre) | ✅ | Trafikverket (`RoadNumber`), NVDB | |
| Yangınlar ve kurtarma görevleri (canlı, ulusal) | ⚠️ **Kısmen** | Polisen (`Brand`, `Arbetsplatsolycka`, `Försvunnen person` vb.) + seçili räddningstjänst listeleri (izinle) | İsveç'te **açık ve ulusal bir kurtarma görevi akışı yok**. Polisen yalnızca polisin karıştığı olayların bir kısmını yayımlıyor, birkaç saat gecikmeyle. Tam kapsam için SOS Alarm ile sözleşme tek gerçek yol. |
| Haberden olay çıkarma | ⚠️ Lisansa bağlı | SVT lokalt RSS (başlık + bağlantı), lisanslı haber akışı | Haber metnini saklamak ve özetlemek telif riski taşır. MVP'de yalnızca başlık ve bağlantı + kendi sınıflandırmamız. |
| Resmi uyarılar ve VMA | ✅ (referansta yok, **bizim artımız**) | Krisinformation `/vmas`, `/news`; SMHI IBWW | API kararlılığı (503) izlenmeli. |
| 24 sa / 7 g / 30 g görünümleri | ✅ | Kendi veritabanımız | Polisen yalnızca son 500 kaydı veriyor, bu yüzden **arşivi kendimiz tutmalıyız**. |
| Serbest metin araması (tür, yer, açıklama, yol) | ✅ | Kendi indeksimiz | |
| "Yakınımda" 5–100 km yarıçap | ✅ Trafikverket için hassas<br>⚠️ Polisen için kaba | Trafikverket koordinatları; Polisen yalnızca belediye merkezi | Polisen olaylarında mesafeyi "belediye merkezine uzaklık" olarak hesaplayıp arayüzde açıkça belirtmeliyiz. |
| Belediye ve il sayfaları, A–Ö dizini | ✅ | SCB kodları + tüm kaynakların belediye alanı | 290 belediye, 21 il |
| Görev türü sayfaları | ✅ | Kendi birleşik taksonomimiz (Polisen türleri + Trafikverket MessageType + räddningstjänst türleri) | Eşleme tablosu gerekir. |
| İstatistik: en sık türler, en aktif bölgeler | ✅ (kendi verimizden) | Kendi veritabanı | |
| Uzun dönem resmi istatistik (yıllık) | ✅ (**artı**) | MCF PxWeb (belediye × tür × ay × saat), SOS Alarm raporu | Referans sitede yok; "Sverige i siffror" gibi bir sayfa olabilir. |
| Kaynak başına "son gözlem" ve kapsam sayfası | ✅ | Kendi ingest loglarımız | Şeffaflık ve hukuki koruma için önemli. |
| Güvenlik rehberleri (blog) | ✅ | Kendi içeriğimiz. MCF'nin "Om krisen eller kriget kommer" broşürüne ve Krisinformation'a bağlantı verilebilir. | Metinler kendimiz yazılmalı. |
| Olay "durumu" (devam ediyor / bitti) | ✅ Trafikverket (başlangıç/bitiş zamanı)<br>⚠️ Polisen (güncellemeler var, durum alanı yok) | | |
| Sokak adresi | ❌ (bilinçli olarak gösterilmemeli) | – | Referans site gibi belediye düzeyinde kalmak GDPR açısından en güvenli yol. |

**Yapılamayanlar ve sınırlar (özet)**
1. **Ulusal, eksiksiz, canlı kurtarma görevi listesi:** açık kaynak yok. SOS Alarm sözleşmesi olmadan Finlandiya'daki kadar kapsamlı olunamaz.
2. **Polisen'de hassas konum:** yok, yalnızca belediye merkezi.
3. **Haber içeriğinin tam metni:** lisans olmadan saklanmamalı ve yeniden yayımlanmamalı.
4. **Sveriges Radio API:** depolama yasak ve bakımı yapılmıyor, kullanılmamalı.
5. **Bot korumalı veya izin vermeyen siteler** (ör. sosalarm.se 403): otomatik erişim yapılmamalı.

---

## 4. Hukuki ve GDPR notları

- **Kaynak gösterimi zorunlu:** Polismyndigheten, SMHI (uyarı içeriği değiştirilemez), Krisinformation/MCF. Trafikverket CC0 olsa da kaynak göstermek iyi uygulama.
- **Kişisel veri:** Olay metinlerinde yer adları ve bazen sokak adları geçebiliyor; dolaylı olarak kişiler tanınabilir. Öneriler:
  - Gösterimde konumu **belediye düzeyine** indirgemek
  - Ham serbest metni yalnızca kaynakta görünen kısa özetle sınırlamak ve kaynağa bağlantı vermek
  - Saklama süresi: canlı görünüm 30 gün; daha eski kayıtlarda metni silip yalnızca toplu istatistiği tutmak
  - Kullanıcı konumunu sunucuya göndermemek (mesafe hesabı istemci tarafında) veya yuvarlayıp saklamamak
  - Gizlilik politikası + meşru menfaat değerlendirmesi (intresseavvägning)
- Polisen suç bildirimleri (misshandel, rån vb.) "acil durum listesi" kapsamı dışında tutulabilir. Bu bir ürün kararı; varsayılan önerimiz **yalnızca kaza, yangın, kurtarma ve trafik türlerini** göstermek.
- Site kendini **resmi olmayan, bağımsız bir görünüm** olarak tanıtmalı ve acil durumda 112'yi göstermeli. Kurum logoları ve marka unsurları kullanılmamalı.
- Polisen kurallarına uyum: User-Agent'ta site adı ve iletişim adresi, ≥10 sn aralık, ≤60 çağrı/saat. Pratikte **5 dakikada bir** yoklama yeterli (12/saat).

---

## 5. Önerilen veri mimarisi

```
                ┌───────────────────────── Zamanlanmış toplayıcılar (ingest) ─────────────────────────┐
 Trafikverket ──┤ trafikverket-ingest  : SSE aboneliği veya 1–2 dk'da bir changeid ile delta sorgu     │
 Polisen     ───┤ polisen-ingest       : 5 dk'da bir /api/events (User-Agent, ETag/önbellek)          │
 SMHI        ───┤ smhi-ingest          : 5–10 dk'da bir warning.json                                  │
 Krisinfo    ───┤ krisinfo-ingest      : 5 dk'da bir /v3/vmas, 15 dk'da bir /v3/news (503'e karşı geri çekilme) │
 SVT RSS     ───┤ news-ingest          : 15–30 dk'da bir il RSS'leri (yalnızca başlık + bağlantı)     │
 Räddn.tj.   ───┤ (izin alınan birimler için) local-ingest : 10–15 dk                                │
 MCF PxWeb   ───┤ stats-ingest         : yılda bir / ayda bir kontrol                                 │
                └───────────────┬──────────────────────────────────────────────────────────────────────┘
                                │ ham kayıt (raw_events: kaynak, kaynak_id, payload, alınma zamanı)
                                ▼
                 Normalleştirme: ortak şema + taksonomi eşlemesi + belediye/il eşleme
                 (SCB kodları, Lantmäteriet yer adları; Polisen başlığından belediye çıkarma)
                                │
                                ▼
                 Tekilleştirme / birleştirme (aynı belediye + yakın zaman + uyumlu tür)
                   ör. Polisen "Trafikolycka, Botkyrka" ↔ Trafikverket "Olycka, väg 226"
                                │
                                ▼
        events (birleşik olay)  ── PostgreSQL + PostGIS (mesafe sorguları, tam metin arama)
        sources_status (kaynak başına son başarılı çekim, hata sayısı)
        stats_* (MCF/SOS toplu istatistikleri)
                                │
                                ▼
                 API katmanı (okuma) + önbellek (CDN, 30–60 sn)  ──►  Web uygulaması (SSR/ISR)
```

**Birleşik olay şeması (öneri)**
`id, kategori (trafikolycka | brand | räddning | trafikstörning | vägarbete | varning | vma | övrigt), alt_tür, başlık, kısa_açıklama, başlangıç, bitiş, durum, kommun_kod, län_kod, yol_no, geom (nokta/çizgi, nullable), konum_hassasiyeti (exakt | kommun-centroid | län), şiddet, kaynaklar[] (ad, url, kaynak_id, son_güncelleme), oluşturma/güncelleme zamanı`

`konum_hassasiyeti` alanı kritik. "Yakınımda" filtresinde ve haritada Polisen merkez noktalarını hassas konum gibi göstermemek için kullanılır.

**Teknoloji notu:** Önceki projede (insolve-se) Firebase/Next.js kullanılmıştı. Bu proje için mesafe sorguları ve tam metin araması gerektiğinden **PostgreSQL + PostGIS** (ör. Supabase/Neon) daha uygun. Firestore ile geohash de mümkün ama daha zahmetli. Karar bir sonraki aşamada verilebilir.

---

## 6. MVP önerisi

**Kapsam (v0.1, yalnızca açık kaynaklar, sözleşme gerektirmez):**
1. **Trafikverket**: kazalar, engeller, yol çalışmaları, önemli trafik bilgisi (koordinatlı)
2. **Polisen**: yalnızca kaza, yangın ve kurtarma ile ilgili türler (`Trafikolycka*`, `Brand`, `Arbetsplatsolycka`, `Försvunnen person`, `Trafikhinder`, `Räddningsinsats`, `Olycka`, `Drunkning` vb.); suç türleri varsayılan olarak kapalı
3. **SMHI** hava uyarıları + **Krisinformation VMA** (üstte belirgin bir uyarı bandı)
4. Sayfalar: ana akış (24 sa / 7 g / 30 g), il ve belediye sayfaları (A–Ö), tür sayfaları, yol sayfaları, arama, "yakınımda" (istemci tarafında, hassasiyet etiketiyle), kaynaklar ve kapsam sayfası, basit istatistikler (en sık türler, en aktif belediyeler)
5. Kendi markamız, kendi tasarımımız ve kendi metinlerimiz; İsveççe arayüz (İngilizce sonra)

**v0.2 ve sonrası**
- SVT lokalt RSS'ten "ilgili haber" bağlantıları (başlık + bağlantı)
- MCF PxWeb ile "yıllık istatistik" sayfaları (belediye bazında yangın ve trafik kazası trendleri, 1000 kişi başına oranlar)
- E-posta veya push bildirimi (belediye ya da yol takibi). Referans sitede yok, ayırt edici özellik olabilir.
- Güvenlik rehberleri (kendi içeriğimiz)

**Paralel başlatılması önerilen iş geliştirme adımları**
- **SOS Alarm** ile görüşme: 112 olay akışına (anonimleştirilmiş, belediye düzeyinde) erişim veya lisans. Kapsam farkını kapatacak tek gerçek yol.
- 3–5 büyük räddningstjänst ile (Storstockholms brandförsvar, Räddningstjänsten Syd, Räddningstjänsten Storgöteborg, Södertörns brandförsvarsförbund, Gästrike) larm listelerini kullanma izni veya bir RSS/JSON akışı talebi
- Haber için lisans seçenekleri (TT, Mynewsdesk, bölgesel medya grupları)
- Trafikverket anahtarı için kayıt (ücretsiz)

**Açık sorular / doğrulanacaklar**
- Krisinformation API v3'ün kararlılığı ve şeması (test sırasında 503 döndü). Gerekirse redaktionen@krisinformation.se ile iletişim.
- Trafikverket Situation şemasındaki kesin alan adları ve SSE/changeid kullanımı (data.trafikverket.se dokümanı, anahtar alındıktan sonra)
- MCF istatistiklerinin açık lisans metni
- Polisen başlığından belediye çıkarma doğruluğu (`location.name` bazen yalnızca il veriyor)

---

## Kaynaklar

- hälytyslista.fi – /info, /liikenne, /blog (işlevsel inceleme, 2026-10-13)
- Polisen API: https://polisen.se/om-polisen/om-webbplatsen/oppna-data/api-over-polisens-handelser/ · kurallar: https://polisen.se/om-polisen/om-webbplatsen/oppna-data/regler-for-oppna-data/ · RSS: https://polisen.se/aktuellt/rss/
- Trafikverket: https://www.trafikverket.se/e-tjanster/trafikverkets-oppna-api-for-trafikinformation/ · https://www.trafiklab.se/api/trafiklab-apis/trafikverket/ · DATEX II: https://www.trafikverket.se/e-tjanster/hamta-data-fran-trafikverket/
- SMHI: https://www.smhi.se/data/om-smhis-data/villkor-for-anvandning · uyarı API'si: https://opendata-download-warnings.smhi.se/ibww/api/version/1/warning.json
- Krisinformation: https://api.krisinformation.se/v3 · kullanım şartları: https://www.krisinformation.se/globalassets/om-krisinformation.se/oppen-data/anvandarvillkor-for-krisinformations-api.pdf · VMA: https://www.mcf.se/VMA
- MCF istatistikleri: https://statistik.mcf.se/PXWeb/pxweb/sv/PxData/ · kalite beyanı: https://www.mcf.se/siteassets/dokument/amnesomraden/skydd-mot-olyckor-och-farliga-amnen/raddningstjanst/statistik-raddningstjanst/kvalitetsdeklaration-raddningstjanstens-insatser-statistik-2025.pdf
- SOS Alarm 112-rapport 2025: https://via.tt.se/pressmeddelande/4274041/sos-alarm-sammanfattar-2025-ars-112-handelser · 112-appen: https://apps.apple.com/app/id1458725539
- Räddningstjänst listeleri: https://www.rsyd.se/pressrum/sos-arkiv/ · https://www.kristianstad.se/omsorgochhjalp/tryggochsaker/raddningstjanst/utryckningar.1124.html · https://www.serf.se/global/larm-register/ · https://www.gastrikeraddningstjanst.se/start · https://raddsamf.jonkoping.se/
- Sveriges Radio API şartları: https://sverigesradio.se/artikel/api-villkor
- SVT RSS (örnek): https://www.svt.se/nyheter/inrikes/rss.xml

# Medya moderasyonu — client entegrasyon sözleşmesi

tdn-api'ye otomatik medya moderasyonu eklendi: yüklenen tüm görsel ve videolar
cinsel içerik, gore, şiddet, silah ve nefret sembolleri için taranıyor.

Bu doküman, değişikliğin client tarafına yansıyan **tüm** API sözleşmesini
içeriyor: yeni hata yanıtları, yeni yanıt alanları, yeni bildirim tipi ve
bekleyen video davranışı. Frontend ekibine doğrudan verilebilir. Eksik bir yer
görürseniz sorun, tahmin etmeyin.

---

## 0. Özet: backend ne yapıyor

- **Görseller** yükleme isteğinin içinde taranıyor. Reddedilirse depolamaya hiç
  yazılmıyor ve bir URL'i hiç oluşmuyor.
- **Videolar** taranmadan depolanıyor ama okuma yolundan gizleniyor. Dakikada
  bir çalışan bir arka plan işçisi taramayı yapıyor (tipik bekleme ~1 dakika).
  Reddedilirse dosya siliniyor ve kullanıcıya bildirim düşüyor.
- Kararlar iki kademeli: **reddedilenler** (cinsel içerik, gore, kendine zarar,
  nefret sembolleri) ve **sadece bulanıklaştırılanlar** (müstehcen ama giyinik
  içerik, şiddet, silah). İkinci grup yayınlanıyor ama `isSensitive` ile
  işaretleniyor.

Client'ın moderasyon mantığını bilmesine gerek yok; backend kararı vermiş olarak
`isSensitive` ve `mediaPending` gönderiyor.

---

## 1. Yükleme uçlarında yeni hata yanıtları

Etkilenen uçlar — **dördü de kapsamda**:

| Uç | Kabul ettiği |
|---|---|
| `POST /api/v1/media` | görsel + video (post ve yorum medyası) |
| `POST /api/v1/articles/cover` | sadece görsel |
| `PATCH /api/v1/profiles/me/avatar` | sadece görsel |
| `PATCH /api/v1/profiles/me/banner` | sadece görsel |

Başarılı yanıtların gövdesi DEĞİŞMEDİ. Yeni olan, bu uçların artık aşağıdaki
hataları dönebilmesi. Hepsi mevcut RFC 7807 zarfında geliyor:

    {
      "type": "about:blank",
      "title": "MediaRejectedError",
      "status": 422,
      "detail": "This file was rejected because it appears to contain explicit or violent content.",
      "instance": "/api/v1/media"
    }

`title` alanına göre dallan.

| Status | title | Anlamı | Tekrar denenebilir mi? |
|---|---|---|---|
| 422 | `MediaRejectedError` | Moderasyon reddetti | Hayır |
| 503 | `ModerationUnavailableError` | Kontrol servisine ulaşılamadı | **Evet** |
| 415 | `InvalidMediaTypeError` | Desteklenmeyen tür (`/media`) | Hayır |
| 415 | `InvalidFileTypeError` | Desteklenmeyen tür (kapak/avatar/banner) | Hayır |
| 413 | `PayloadTooLargeError` | Dosya 5 MB'den büyük | Hayır |

422 ile 503'ü mutlaka ayır: 422'de "bu dosya yüklenemez", 503'te "birazdan
tekrar deneyin" ve tercihen otomatik bir retry.

### i18n

`detail` alanı İngilizce ve değişebilir. Sunucunun `detail`'ini olduğu gibi
göstermek bu beş hata için istenmiyor — `title` bazlı Türkçe metin haritası kur.
Bu, mevcut "4xx'te sunucunun detail'ini göster" kuralına bilinçli bir istisna;
kuralı değiştirme, yalnızca bu `title` değerleri için atla.

### Sessiz davranış değişikliği

415 artık dosyanın **gerçek baytlarına** bakılarak veriliyor; uzantı ve
`Content-Type` tamamen yok sayılıyor. Uzantısı `.png` yapılmış bir SVG, bir HEIC
ya da bozuk bir dosya artık reddedilir. Kullanıcı "ama bu bir resim" diyebilir;
hata metni bunu karşılamalı.

Kabul edilen formatlar: JPEG, PNG, GIF, WEBP, AVIF ve (yalnızca `/media` için)
MP4, MOV, WEBM, 3GP.

### Çoklu dosyada red — önemli

`POST /media` tek istekte 4 dosyaya kadar kabul ediyor ve dosyaları **sırayla**
işliyor. Üçüncü dosya reddedilirse istek 422 döner ve **hiçbir URL dönmez** —
ilk iki dosya başarıyla yüklenmiş olsa bile. Yanıt hangi dosyanın reddedildiğini
söylemiyor.

Pratik sonucu: 422 aldığında seçili dosyaların tamamını başarısız say, hepsini
temizle ve kullanıcıdan yeniden seçmesini iste. "Sadece 3. dosyayı çıkar" gibi
bir kurtarma yapma; elinde o bilgi yok.

---

## 2. Post/yorum oluştururken yeni 400

`POST /api/v1/posts` ve `POST /api/v1/posts/:postId/comments` artık
`MediaNotOwnedError` (400) dönebilir.

Kritik kural: **bir yükleme yalnızca tek bir içerikte kullanılabilir.** Aynı
`mediaUrls` dizisini iki ayrı post/yorumda gönderirsen ikincisi 400 alır.

Gözden geçirilmesi gerekenler:

- Taslak kaydetme ve "aynı postu tekrar gönder" akışları.
- Yeniden deneme: gönderim **5xx** yüzünden düştüyse aynı URL'lerle tekrar
  denemek güvenlidir (post yazılmadı). Gönderim **başarılı** olduktan sonra aynı
  URL'leri yeniden kullanmak 400 verir.

---

## 3. Post / yorum / alıntı yanıtlarında iki yeni alan

`PostItem`, `CommentItem` ve alıntı kartı (`quotedPost`) artık şunları taşıyor:

    {
      "mediaUrls": [],
      "isSensitive": false,
      "mediaPending": true
    }

**Şekil — her ikisi de içerik seviyesinde, medya başına DEĞİL.** Bir içeriğe
bağlı herhangi bir medya hassas sayıldıysa içeriğin tamamı `isSensitive: true`
olur; medya başına bir bayrak yok. Dört medyalı bir postta yalnızca biri hassas
olsa da dördü birden blur'lanır.

**Yorumlar da her iki alanı alıyor** — `CommentItemSchema` `isSensitive` ve
`mediaPending` taşıyor. Yorum medyası post medyasıyla aynı uçtan geliyor, aynı
kurallara tabi.

- **`isSensitive: true`** → `mediaUrls` normal gelir, ama medyanın üzerine blur
  konmalı. Dokununca/tıklayınca açılan bir "Hassas içerik" örtüsü istiyorum.
  Kullanıcı bir kez açtıysa o oturum boyunca o medya açık kalabilir.
- **`mediaPending: true`** → `mediaUrls` **boş dizi** olarak gelir (`[]`, alan
  eksik değil). Bu bir hata değil: video hâlâ kontrol ediliyor. "Video işleniyor"
  yer tutucusu göster.

`mediaUrls` boş olduğunda iki ayrı durum var; ayrımı `mediaPending` yapıyor:

- `mediaPending: false` → gerçekten medyasız içerik
- `mediaPending: true` → medya var ama henüz gösterilemiyor

**Alıntı kartı da dahil.** `quotedPost` kendi `isSensitive` ve `mediaPending`
alanlarını taşıyor; alıntılanan postun hassas medyası da blur'lanmalı, bekleyen
medyası da yer tutucu göstermeli. Aksi halde alıntılamak, taranmamış bir videoyu
yayınlamanın yolu olurdu.

Makale yanıtlarında (`ArticleItem`) kapak için `isSensitive` alanı var;
`mediaPending` yok — kapak her zaman görsel olduğu için asla beklemede kalmaz.

---

## 4. Yeni bildirim tipi: `MEDIA_REJECTED`

`NotificationType` union'ına eklenmesi gerekiyor.

### Payload

Bildirim yanıtı `postId`, `articleId`, `commentId` ve `referenceId` alanlarını
**zaten taşıyor** — bunlar yeni değil, API şemasında opsiyonel alanlar olarak
mevcut. Client tipleri eksikse orayı tamamla.

`MEDIA_REJECTED` için:

| Medya nereye bağlıydı | `postId` | `commentId` | `articleId` | `articleSlug` |
|---|---|---|---|---|
| Bir posta | dolu | boş | boş | boş |
| Bir postun yorumuna | dolu | dolu | boş | boş |
| Bir makalenin yorumuna | boş | dolu | dolu | dolu |
| Hiçbir yere (aşağıya bak) | boş | boş | boş | boş |

`referenceId` her zaman en spesifik hedefi yansıtır: yorum varsa yorum, yoksa
makale, yoksa post.

**Yönlendirme kuralı** — client'ta yorum detayı tek bir uçtan okunuyor
(`/comments/:commentId`, yorumun posta mı makaleye mi bağlı olduğuna
bakmaksızın), dolayısıyla kural tek satır:

    commentId dolu  -> /comments/:commentId
    yoksa postId    -> /post/:postId
    ikisi de boş    -> tıklanamaz

`articleId` ve `articleSlug` bu yüzden client'ta kullanılmıyor. Bildirimle
geliyorlar — mevcut yorum bildirimleriyle tutarlı olsun diye — ama okumanız
gerekmiyor. Makale yorumunda da doğru hedef yorumun kendisidir: medya makalenin
tepesinden değil, yorumdan kaldırıldı.

Son satır gerçek bir durum: kullanıcı video yükleyip postu hiç göndermezse,
medya hiçbir içeriğe bağlanmadan reddedilebilir. Bu durumda bildirim hedefsiz
gelir ve tıklanamaz olmalı.

### Render — burada bir tuzak var

Bildirim platformdan geliyor ama backend'de sistem hesabı olmadığı için
`issuerId === recipientId` yazılıyor. Yani yanıttaki `username` ve `avatarUrl`
alanları **kullanıcının kendisini** gösteriyor.

Bu tip için issuer bilgisini tamamen yok say: avatar bloğunu ve `{{username}}`
interpolasyonunu bu tipte gösterme. Platform ikonu ve sabit bir metin göster:

> TR: "Paylaşımınızdaki bir medya, topluluk kurallarına aykırı olduğu için
> kaldırıldı."
>
> EN: "A media item in your post was removed for breaking the community rules."

---

## 5. Bekleyen video için yenileme

Video yükleyip post paylaşan kullanıcı kendi videosunu hemen göremez
(`mediaPending: true`). Tipik bekleme ~1 dakika.

İstediğim: yer tutucunun üzerinde bir "Yenile" aksiyonu. Otomatik yoklama
eklersen 15-30 saniyede bir, **yalnızca o tek postu** çek ve `mediaPending` false
olunca durdur — feed'in tamamını yoklama.

Video reddedilirse `mediaPending` `false`'a döner, `mediaUrls` kalıcı olarak boş
kalır ve kullanıcıya `MEDIA_REJECTED` bildirimi düşer.

### Reddedilmiş medya ile medyasız içerik ayırt edilemiyor

Bilerek böyle. Red sonrası içerik `mediaPending: false` + `mediaUrls: []`
döner — yani hiç medya içermeyen bir postla birebir aynı. Okuyucuya "burada bir
medya vardı, kaldırıldı" diyen bir alan yok.

Bu bir eksik değil, ürün kararı: ihlali herkese duyurmak istemiyoruz, yazar
zaten bildirimle haberdar ediliyor.

**Oturum yerel bir kurtarma denemesi yapma** — "bu postu daha önce pending
görmüştüm" gibi bir hafızaya dayanıp "kaldırıldı" metni gösterme. Sayfa
yenilenince kaybolur, farklı cihazda hiç görünmez ve aynı postu iki kullanıcıya
farklı gösterir. Ya bu ayrımı hiç yapma, ya da bize söyle — backend'e ayrı bir
alan ekleriz.

---

## Test edilebilirlik — önemli kısıt

Moderasyon yalnızca sunucuda `MODERATION_ENABLED=true` ve Sightengine anahtarları
tanımlıysa çalışır. Staging'de bunlar kapalıysa hiçbir dosya reddedilmez, yani
`MediaRejectedError` yolunu staging'de elle doğrulayamazsınız.

Bu dalı MSW ile unit/e2e seviyesinde kapatın; "staging'de deneriz" planı
yapmayın.

---

## Kapsam dışı

- Yükleme isteklerinin gövdesi ve başarılı yanıtların şekli değişmedi. Mevcut
  upload kodunu yeniden yazma, yalnızca hata dallarını ve yeni alanları ekle.
- Moderasyon eşiklerini veya kategorilerini client'ta yorumlama.

## Yöntem

Önce etkilenen dosyaları ve mevcut hata yönetimi / medya render yapısını incele,
sonra bana bir plan sun. Onaylamadan kod yazma.

## Not — koda yorum olarak eklenmeye değer

Şiddet ve silah içeren medya **reddedilmiyor**, yalnızca `isSensitive` ile
bulanıklaştırılıyor. Sebebi bilinçli: burası bir yazılımcı platformu ve oyun
ekran görüntüleriyle dolu; bunları silen bir filtre insanların dolanmaya
çalıştığı bir filtre olur. `isSensitive`'i render eden yerin başına bu notu
yorum olarak koy — "şiddet neden engellenmiyor?" sorusunun cevabı orada dursun.

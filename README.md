# SidraWallet Android APK Builder

Wallet non-custodial SidraChain dalam WebView (`MainActivity`) dengan browser dApp native
(`BrowserActivity`) yang menyuntikkan provider `window.ethereum` ke halaman dApp.

## Cara Build APK via GitHub Actions

### Langkah 1 — Persiapan file wallet Anda

Salin semua file wallet ke dalam folder `app/src/main/assets/`:
```
app/src/main/assets/
├── index.html        ← dari root sda-wallet-checker/ (versi bersih, tanpa JS browser lama)
├── manifest.json     ← dari root
├── sw.js             ← dari root (didaftarkan lewat serviceWorker.register, jangan di-load sebagai <script>)
├── data/
│   └── lang.json     ← terjemahan id / en / ar / vi (dibaca wallet DAN browser native)
├── js/               ← copy seluruh folder js/ (lihat daftar di bawah)
│   └── android-provider.js  ← pakai versi terbaru (v2), jangan timpa dengan versi lama
├── css/              ← copy seluruh folder css/
├── webfonts/         ← font Font Awesome, harus sejajar dengan css/ (dipakai all.min.css)
└── img/              ← copy seluruh folder img/ (wajib ada logo.png, sda.png)
```

> **Jangan salin** file JS lama berikut (sudah tidak dipakai di APK, browser dApp sekarang native):
> `browser-bridge.js`, `browser-permission-ui.js`, `dapp-hub.js`, `sidra-browser-v2.js`, `sidra-browser.js`.

### Langkah 2 — Pastikan urutan script di index.html

Lapisan dApp dimuat berurutan, dan `update-check.js` sesudah `lang.js`:

```html
<script src="js/lang.js"></script>
<script src="js/update-check.js"></script>
...
<script src="js/permission-manager.js"></script>
<script src="js/provider-injection.js"></script>
<script src="js/android-provider.js"></script>        <!-- setelah provider-injection.js -->
<script src="js/connect-modal.js"></script>
<script src="js/dapp-connection-manager.js"></script>
```

### Langkah 3 — Upload ke GitHub

1. Buat akun di https://github.com
2. Buat repository baru (klik + → New repository)
3. Nama: `sidra-wallet-apk`
4. Pilih: Public
5. Klik "Create repository"
6. Upload semua file dari folder ini ke repository

### Langkah 4 — Build APK

1. Buka tab **Actions** di repository GitHub Anda
2. Klik workflow **"Build SidraWallet APK"**
3. Klik tombol **"Run workflow"**
4. Tunggu sekitar 5-10 menit
5. Setelah selesai, klik **"SidraWallet-APK"** untuk download

### Langkah 5 — Install di HP

1. Pindah file APK ke HP
2. Buka file manager → tap file APK
3. Izinkan install dari sumber tidak dikenal
4. Install selesai!

---

## Cara Kerja dApp

```
dApp (BrowserActivity, WebView per tab)
  │  window.ethereum  ← disuntikkan ProviderInjector (document start + onPageFinished)
  ▼
AndroidWallet.handleRequest(id, method, params, origin)      [BrowserActivity.BrowserBridge]
  ▼  LocalBroadcast ACTION_BRIDGE_REQUEST
MainActivity → wallet WebView: window._androidBridgeRequest(...)   [android-provider.js]
  ▼
_sidraProvider.request(...)                                   [provider-injection.js]
  ├─ eth_requestAccounts → popup connect / sign / tx          [connect-modal.js]
  ├─ izin origin                                              [permission-manager.js]
  └─ koneksi aktif (disimpan, bisa dicabut)                   [dapp-connection-manager.js]
  ▼
AndroidWallet.sendResponse(...) → LocalBroadcast ACTION_BRIDGE_RESPONSE → halaman dApp
```

Browser native:
- Halaman awal dengan link resmi **Sidra Chain** dan **Sidra DEX** serta banner peringatan keamanan
  (URL ada di `BrowserActivity.java`: `URL_MAIN`, `URL_DEX`).
- Multi-tab, tombol **Wallet** di header untuk kembali ke dashboard wallet tanpa menutup tab.
- Menu ⋮: cabut koneksi wallet situs aktif, salin link, tutup semua tab.
- Tombol **Browser** di dashboard wallet memanggil `AndroidWallet.openBrowserHome()`.

## Bahasa (i18n)

- Terjemahan ada di `assets/data/lang.json` (`id`, `en`, `ar`, `vi`).
- `lang.js` mengirim bahasa terpilih ke native lewat `AndroidWallet.setLanguage()`
  (disimpan di SharedPreferences `sidra_prefs`); `BrowserLang.java` membacanya untuk UI browser native.
- Key browser native berawalan `browser_*` (termasuk `browser_warning_title` dan `browser_warning`),
  key popup update berawalan `update_*`. Kalau key belum ada, UI memakai teks bawaan (English/Indonesia).

## Update Aplikasi

`update-check.js` mengecek release terbaru `MasAtos007/SDA-Wallet` di GitHub (maks 1x per 6 jam,
hanya di dalam APK) dan menampilkan popup. Tombol "Perbarui" membuka halaman release lewat
`AndroidWallet.openExternal` (whitelist hanya repo SDA-Wallet).

- `versionName` di `app/build.gradle` harus sama dengan tag rilis GitHub (mis. `1.0.0` untuk tag `v1.0.0`).
- Perbandingan versi per segmen (`1.0.10` lebih baru dari `1.0.9`).

---

## Struktur File Lengkap

```
sidra-wallet-apk/
├── .github/
│   └── workflows/
│       └── build-apk.yml
├── app/
│   ├── build.gradle
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── assets/                          ← file wallet (web)
│       │   ├── index.html
│       │   ├── manifest.json
│       │   ├── sw.js
│       │   ├── data/
│       │   │   └── lang.json
│       │   ├── img/
│       │   │   ├── logo.png
│       │   │   ├── sda.png
│       │   │   └── default.png
│       │   ├── css/
│       │   │   ├── base.css
│       │   │   ├── header.css
│       │   │   ├── card.css
│       │   │   ├── form.css
│       │   │   ├── button.css
│       │   │   ├── address.css
│       │   │   ├── actions.css
│       │   │   ├── tabs.css
│       │   │   ├── modal.css
│       │   │   ├── walletpicker.css
│       │   │   ├── lp-modal.css
│       │   │   ├── lp-card.css
│       │   │   ├── swap-modal.css
│       │   │   ├── animation.css
│       │   │   ├── components.css
│       │   │   ├── send-premium.css
│       │   │   ├── confirm-modals.css
│       │   │   ├── bottom-nav.css
│       │   │   ├── balance-hero.css
│       │   │   └── all.min.css              ← Font Awesome
│       │   ├── webfonts/                    ← font untuk all.min.css (sejajar css/)
│       │   │   ├── fa-solid-900.woff2
│       │   │   ├── fa-regular-400.woff2
│       │   │   └── fa-brands-400.woff2
│       │   └── js/                          ← urutan sesuai index.html
│       │       ├── config.js
│       │       ├── storage.js
│       │       ├── bottom-nav.js
│       │       ├── wallet-gen.js
│       │       ├── vault.js
│       │       ├── wallet-session.js
│       │       ├── wallet-core.js
│       │       ├── wallet.js
│       │       ├── ui-onboarding.js
│       │       ├── explorer-patch.js
│       │       ├── unwrap-engine.js
│       │       ├── tokens.js
│       │       ├── lp.js
│       │       ├── rpc-batch.js
│       │       ├── balance.js
│       │       ├── ui-core.js
│       │       ├── ui.js
│       │       ├── lang.js
│       │       ├── update-check.js              ← cek update (GitHub release)
│       │       ├── send-modal.js
│       │       ├── send-token.js
│       │       ├── pk-wallet.js
│       │       ├── walletpicker.js
│       │       ├── share-app.js
│       │       ├── app-vault-patch.js
│       │       ├── blockchain.js
│       │       ├── riwayat.js
│       │       ├── lp-engine.js
│       │       ├── lp-factory.js
│       │       ├── lp-modal.js
│       │       ├── factory-engine.js
│       │       ├── rate-limit-dialog.js
│       │       ├── swap-liquidity-check.js
│       │       ├── swap-engine.js
│       │       ├── confirm-modals.js
│       │       ├── swap-modal.js
│       │       ├── swap-live-prices.js
│       │       ├── modal-zindex-patch.js
│       │       ├── permission-manager.js        ← dApp
│       │       ├── provider-injection.js        ← dApp
│       │       ├── android-provider.js          ← dApp (pakai versi v2)
│       │       ├── connect-modal.js             ← dApp
│       │       ├── dapp-connection-manager.js   ← dApp
│       │       └── balance-hero.js
│       ├── java/com/sidrachain/wallet/
│       │   ├── MainActivity.java
│       │   ├── bridge/
│       │   │   └── AndroidBridge.java
│       │   └── browser/
│       │       ├── BrowserActivity.java
│       │       ├── BrowserLang.java
│       │       ├── WebViewManager.java
│       │       └── ProviderInjector.java
│       └── res/
│           ├── layout/
│           │   ├── activity_main.xml
│           │   └── activity_browser.xml
│           ├── values/
│           │   └── themes.xml
│           └── mipmap-*/                    ← ic_launcher (sesuai Manifest)
├── build.gradle
├── settings.gradle
├── gradlew
├── gradlew.bat
└── gradle/wrapper/
    ├── gradle-wrapper.properties
    └── gradle-wrapper.jar
```

---

## Troubleshooting

| Error | Solusi |
|---|---|
| `Gradle sync failed` | Cek koneksi internet GitHub Actions |
| `assets not found` | Pastikan file ada di `app/src/main/assets/` |
| `window.ethereum undefined` | Pastikan `android-provider.js` di-load setelah `provider-injection.js` |
| Ikon (Font Awesome) hilang | Pastikan folder `webfonts/` ada di `assets/`, sejajar dengan `css/` |
| Tombol Browser langsung membuka situs, bukan halaman awal | Pakai `android-provider.js` versi terbaru dan `index.html` terbaru (`openSidraBrowser()` → `openBrowserHome()`) |
| Browser tidak bisa buka URL | Cek `shouldOverrideUrlLoading` di `BrowserActivity.java` (hanya http/https). Catatan: `ProviderInjector.isAllowedOrigin()` saat ini mengizinkan semua HTTPS |
| Teks browser native / popup update tidak ikut bahasa | Cek key `browser_*` / `update_*` ada di `data/lang.json` untuk semua bahasa |
| Popup update tidak muncul / muncul terus | Samakan `versionName` dengan tag rilis GitHub; pastikan `update-check.js` dimuat setelah `lang.js` |
| Console 404 untuk `browser-bridge.js` / `sidra-browser-v2.js` dll | Hapus tag script tersebut dari `index.html` (file lama, sudah tidak dipakai) |
| dApp tidak bisa Cabut koneksi | Pakai menu ⋮ di browser native (memanggil `dappConnectionManager.disconnect`) |

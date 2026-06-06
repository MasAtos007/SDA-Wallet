# SidraWallet Android APK Builder

## Cara Build APK via GitHub Actions

### Langkah 1 — Persiapan file wallet Anda

Salin semua file wallet ke dalam folder `app/src/main/assets/`:
```
app/src/main/assets/
├── index.html        ← dari root sda-wallet-checker/
├── js/               ← copy seluruh folder js/
│   └── android-provider.js  ← SUDAH ADA di sini, jangan timpa
├── css/              ← copy seluruh folder css/
├── img/              ← copy seluruh folder img/
├── manifest.json     ← dari root
└── sw.js             ← dari root
```

### Langkah 2 — Edit index.html

Tambahkan 1 baris di `assets/index.html`, SETELAH baris provider-injection.js:

```html
<script src="js/provider-injection.js"></script>
<script src="js/android-provider.js"></script>   ← TAMBAHKAN INI
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

## Struktur File Lengkap

```
sidra-wallet-apk/
├── .github/
│   └── workflows/
│       └── build-apk.yml          ← GitHub Actions config
├── app/
│   ├── build.gradle               ← konfigurasi build Android
│   └── src/main/
│       ├── AndroidManifest.xml    ← permission & activity
│       ├── assets/                ← TARUH FILE WALLET DI SINI
│       │   ├── index.html
│       │   ├── js/
│       │   ├── css/
│       │   └── img/
│       ├── java/com/sidrachain/wallet/
│       │   ├── MainActivity.java
│       │   ├── bridge/
│       │   │   └── AndroidBridge.java
│       │   └── browser/
│       │       ├── BrowserActivity.java
│       │       ├── WebViewManager.java
│       │       └── ProviderInjector.java
│       └── res/
│           ├── layout/
│           │   ├── activity_main.xml
│           │   └── activity_browser.xml
│           └── values/
│               └── themes.xml
├── build.gradle                   ← root build config
├── settings.gradle
└── gradle/wrapper/
    └── gradle-wrapper.properties
```

---

## Troubleshooting

| Error | Solusi |
|---|---|
| `Gradle sync failed` | Cek koneksi internet GitHub Actions |
| `assets not found` | Pastikan file ada di `app/src/main/assets/` |
| `window.ethereum undefined` | Pastikan android-provider.js di-load setelah provider-injection.js |
| `Browser tidak bisa buka URL` | Cek whitelist di ProviderInjector.java |

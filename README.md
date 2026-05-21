# Dashboard Vanilla (HTML + CSS + JavaScript)

Versi non-React dari dashboard `frontend/`. Dibuat ulang menggunakan HTML + CSS murni + JavaScript vanilla.

## Tech stack

- HTML statis
- CSS murni (CSS variables untuk theme dark/light)
- JavaScript vanilla (tanpa framework, tanpa build step)
- Library eksternal via CDN:
  - [Chart.js](https://www.chartjs.org/) untuk grafik realtime
  - [MQTT.js](https://github.com/mqttjs/MQTT.js) untuk koneksi MQTT broker

## Struktur file

```
dashboard-vanilla/
├── index.html           # redirect berdasarkan status login
├── login.html
├── register.html
├── dashboard.html       # UserDashboard utama (MQTT + chart realtime)
├── analysis.html
├── profile.html
├── admin.html
├── css/
│   └── style.css        # semua styling, mendukung dark/light
└── js/
    ├── config.js        # API_URL, MQTT credentials
    ├── theme.js         # toggle dark/light theme
    ├── auth.js          # login/logout/requireAuth (localStorage)
    ├── api.js           # wrapper fetch ala axios
    ├── alert.js         # window.showAlert(msg, type)
    ├── dialog.js        # window.showConfirm/showPrompt
    ├── layout.js        # render sidebar + topbar untuk halaman terproteksi
    ├── analysis-utils.js
    ├── dashboard.js
    ├── analysis.js
    ├── profile.js
    └── admin.js
```

## Cara menjalankan

Karena memakai modul-modul JS yang dimuat dari URL relatif (dan beberapa CDN), file
ini harus dilayani lewat HTTP server, **bukan** dibuka via `file://`.

Pilih salah satu cara berikut dari folder `dashboard-vanilla/`:

```bash
# Opsi 1: Python (paling umum)
python3 -m http.server 5500

# Opsi 2: Node (jika pakai npx)
npx serve -l 5500 .

# Opsi 3: VS Code "Live Server" extension — klik kanan index.html
```

Lalu buka browser:

- http://localhost:5500/login.html

## Konfigurasi backend

Edit `js/config.js`:

```js
window.APP_CONFIG = {
  API_URL: 'http://localhost:8787',     // ganti ke URL backend Anda
  MQTT_HOST: 'wss://....',              // broker MQTT
  MQTT_USER: 'Device01',
  MQTT_PASS: 'Device01',
};
```

## Catatan

- Auth pakai JWT yang disimpan di `localStorage` (sama seperti versi React).
- Jika browser diakses lewat `https://`, broker MQTT juga harus pakai `wss://`.
- Halaman `dashboard.html` akan otomatis fallback ke API polling
  (`/api/test-data`) bila MQTT.js tidak tersedia.
- Theme (dark/light) disimpan di `localStorage` dengan key `theme`.

## Halaman vs versi React

| Versi React (frontend/src/pages) | Versi vanilla |
| --- | --- |
| `Login.tsx` | `login.html` |
| `Register.tsx` | `register.html` |
| `UserDashboard.tsx` | `dashboard.html` |
| `Analysis.tsx` | `analysis.html` |
| `Profile.tsx` | `profile.html` |
| `AdminDashboard.tsx` | `admin.html` |

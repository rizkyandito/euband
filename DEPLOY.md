# Deploy Euband — Supabase + Vercel

Panduan setup project Euband dari nol sampai live di `euband.vercel.app`.

---

## 1. Setup Supabase (~5 menit)

1. Buka [supabase.com](https://supabase.com) → **New project**
2. Isi:
   - Name: `euband`
   - Database password: simpan baik-baik (admin password DB)
   - Region: **Southeast Asia (Singapore)** — terdekat ke Indonesia
3. Tunggu provisioning (~2 menit)

### 1a. Jalankan schema database

1. Di Supabase dashboard → **SQL Editor** → **New query**
2. Buka file `supabase/schema.sql` di project ini
3. Copy seluruh isinya, paste ke SQL Editor
4. Klik **Run**
5. Cek di **Table Editor**: tabel `sessions` muncul
6. Cek di **Authentication → Policies**: ada 4 policy untuk `sessions`

### 1b. Ambil API credentials

1. **Settings → API**
2. Copy 2 nilai:
   - **Project URL** → `https://xxx.supabase.co`
   - **anon public** key → `` (string panjang)
3. Buka `js/config.js` di project ini, ganti placeholder:
   ```js
   SUPABASE_URL:      'https://xxx.supabase.co',
   SUPABASE_ANON_KEY: 'eyJxxx...',
   ```
   ⚠️ **JANGAN paste `service_role` key**, itu private. Yang dipakai cuma `anon public`.

### 1c. Konfigurasi Auth

Default Supabase mengirim email konfirmasi sebelum user bisa login. Untuk testing cepat:

1. **Authentication → Providers → Email**
2. Toggle off **Confirm email** (sementara, supaya register langsung bisa login)
3. Atau biarkan on, tapi pastikan SMTP terkonfigurasi (built-in Supabase punya rate limit kalau pakai email gratis)

---

## 2. Test lokal dulu

Sebelum push ke Vercel, test di laptop:

```bash
cd dashboard-vanilla
# Pakai server static apa saja, contoh python:
python3 -m http.server 8000
```

Buka `http://localhost:8000`:
1. Auto-redirect ke `/login.html`
2. Klik **Register**, buat akun (email + password min 6 char)
3. Login → masuk Dashboard
4. Connect device BLE → rekam → stop
5. Cek **Riwayat** di nav: harus muncul sesi tersimpan
6. Cek Supabase dashboard → **Table Editor → sessions**: row baru muncul

Kalau ada error di console browser tentang Supabase, double-check `config.js`.

---

## 3. Push ke GitHub

```bash
cd dashboard-vanilla
git init
git add .
git commit -m "Initial Euband dashboard (Supabase + Vercel)"

# Buat repo baru di GitHub bernama `euband-dashboard` (tanpa README/gitignore)
# lalu:
git branch -M main
git remote add origin https://github.com/USERNAME/euband-dashboard.git
git push -u origin main
```

⚠️ **PERHATIAN SECURITY**: `js/config.js` berisi anon key Supabase. Anon key
**aman dibocorkan** (memang dipakai dari client). Tapi pastikan TIDAK ADA
`service_role` key di file mana pun yang di-commit.

---

## 4. Deploy ke Vercel

### Cara A — Via Web UI (Recommended)

1. Buka [vercel.com](https://vercel.com) → **Sign in with GitHub**
2. **Add New → Project**
3. Pilih repo `euband-dashboard`
4. Configure project:
   - **Project Name**: `euband` → otomatis dapat `euband.vercel.app`
   - **Framework Preset**: `Other`
   - **Root Directory**: `./` (default, karena repo-nya memang dashboard-vanilla)
   - Build settings: biarkan kosong (static site, no build)
5. Klik **Deploy**
6. Tunggu ~30 detik, lihat URL hasil: `https://euband.vercel.app`

### Cara B — Via CLI

```bash
npm install -g vercel
cd dashboard-vanilla
vercel login
vercel --prod
```

Pilih:
- Set up and deploy: **Y**
- Scope: (akun kamu)
- Link to existing project: **N**
- Project name: **euband**
- Directory: **./** (current)
- Build override: **N**

---

## 5. Verifikasi production

1. Buka `https://euband.vercel.app`
2. Register akun baru (atau pakai akun lokal — sama database Supabase)
3. Login → dashboard
4. Test BLE recording → cek riwayat
5. Cek **Supabase → Authentication → Users**: user kamu terdaftar

---

## 6. Update domain (opsional)

Kalau nanti punya domain custom (mis. `euband.id`):
1. Vercel project → **Settings → Domains → Add**
2. Tambahkan `euband.id` → ikuti instruksi DNS (CNAME/A record di registrar)
3. SSL otomatis (Let's Encrypt)

---

## Troubleshooting

| Gejala | Penyebab | Fix |
|---|---|---|
| Console: "Supabase belum dikonfigurasi" | Placeholder di `config.js` belum diganti | Edit `js/config.js`, paste URL + anon key dari Supabase |
| Register sukses tapi login gagal "invalid credentials" | Email confirmation belum dicabut/ dikonfirmasi | Auth → Providers → Email → off "Confirm email" sementara |
| Browser tidak deteksi device BLE | Bukan HTTPS / browser tidak support | Pakai Chrome/Edge di HTTPS (Vercel auto-HTTPS) atau localhost |
| Riwayat kosong walau sudah rekam | `sessionsApi.create()` error silent | Buka DevTools Console, cek error. Mungkin RLS belum aktif |
| 401 Unauthorized saat insert | Session expired / belum login | Logout-login ulang |

---

## Reset / Re-deploy

Setiap push ke `main` di GitHub → Vercel auto re-deploy (~30 detik).

Kalau mau rollback: Vercel dashboard → **Deployments** → cari versi sebelumnya → **Promote to Production**.

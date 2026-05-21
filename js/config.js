// ============================================================
// Konfigurasi global aplikasi Euband (Vanilla JS + Supabase)
//
// CARA SETUP:
//   1. Buat project Supabase di https://supabase.com
//   2. Buka Settings → API
//   3. Copy "Project URL" → SUPABASE_URL di bawah
//   4. Copy "anon public" key → SUPABASE_ANON_KEY di bawah
//   5. Jalankan supabase/schema.sql di SQL Editor (sekali aja)
//
// CATATAN KEAMANAN:
//   anon key AMAN ditaruh di client. Yang berbahaya adalah
//   "service_role" key — JANGAN PERNAH paste itu di sini.
//   Row Level Security (RLS) di schema.sql memastikan user
//   cuma bisa akses data miliknya sendiri.
// ============================================================

window.APP_CONFIG = {
  // Ganti dengan URL & key dari project Supabase kamu:
  SUPABASE_URL:      'https://cublfwuyndoyfmtqdbtp.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1Ymxmd3V5bmRveWZtdHFkYnRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNzYyNDksImV4cCI6MjA5NDk1MjI0OX0.wh1nD_KJOCoORfxMuIZDkhjz7EkqVaYT0HRb7edpTK0',
};

// Inisialisasi Supabase client global (dipakai api.js & auth.js)
// Library di-load via <script> di tiap halaman HTML.
if (window.supabase && window.APP_CONFIG.SUPABASE_URL.indexOf('YOUR_') === -1) {
  window.supabaseClient = window.supabase.createClient(
    window.APP_CONFIG.SUPABASE_URL,
    window.APP_CONFIG.SUPABASE_ANON_KEY
  );
} else {
  console.warn(
    '[Euband] Supabase belum dikonfigurasi.\n' +
    'Edit js/config.js dan masukkan SUPABASE_URL & SUPABASE_ANON_KEY.\n' +
    'Lihat DEPLOY.md untuk detail.'
  );
}

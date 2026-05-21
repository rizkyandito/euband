-- ============================================================
-- Euband Supabase Schema (Anonymous mode)
--
-- Cara pakai:
--   1. Buka Supabase dashboard → SQL Editor → New query
--   2. Paste seluruh file ini → Run
--   3. Cek di Table Editor: tabel `sessions` ada
--
-- Schema ini idempotent: aman dijalankan ulang.
--
-- CATATAN:
--   Tidak ada login/registrasi di app. Semua user share 1 pool
--   data. RLS dikonfigurasi untuk allow anonymous insert/select/
--   delete via anon key.
-- ============================================================

-- ============================================================
-- Table: sessions
-- Menyimpan hasil analisis tiap sesi rekam (bukan raw samples).
-- ============================================================

-- Drop foreign key dulu (kalau dari versi sebelumnya yang punya FK ke auth.users)
ALTER TABLE IF EXISTS public.sessions
  DROP CONSTRAINT IF EXISTS sessions_user_id_fkey;

CREATE TABLE IF NOT EXISTS public.sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid,                                -- nullable: anonymous mode
  device_session  bigint,                              -- session ID dari ESP32
  started_at      timestamptz NOT NULL DEFAULT now(),
  duration_sec    numeric(8,1) NOT NULL,
  sample_count    integer NOT NULL,
  sample_rate_hz  integer,

  -- Hasil analisis
  bpm             numeric(5,1),
  hrv_sdnn_ms     numeric(6,1),
  gsr_mean_adc    integer,
  gsr_us          numeric(6,3),

  -- Klasifikasi
  category_gsr    text CHECK (category_gsr IN ('Normal', 'Sedang', 'Tinggi', '—')),
  category_bpm    text CHECK (category_bpm IN ('Normal', 'Sedang', 'Tinggi', '—')),
  level           text NOT NULL CHECK (level IN ('Normal', 'Sedang', 'Tinggi')),

  -- Metadata anonymous mode
  device_label    text,                                -- optional: nama device/user yang user kasih
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Kalau tabel sudah ada dari versi sebelumnya, pastikan user_id nullable
ALTER TABLE public.sessions ALTER COLUMN user_id DROP NOT NULL;

-- Tambah column device_label kalau belum ada (migrasi dari schema lama)
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS device_label text;

-- Index untuk list sesi terbaru
CREATE INDEX IF NOT EXISTS sessions_started_idx
  ON public.sessions (started_at DESC);

-- ============================================================
-- Row Level Security (RLS) — ANONYMOUS MODE
-- Semua orang (anon key) bisa SELECT/INSERT/DELETE.
-- ============================================================

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- Drop policies versi sebelumnya
DROP POLICY IF EXISTS "sessions_select_own"     ON public.sessions;
DROP POLICY IF EXISTS "sessions_insert_own"     ON public.sessions;
DROP POLICY IF EXISTS "sessions_update_own"     ON public.sessions;
DROP POLICY IF EXISTS "sessions_delete_own"     ON public.sessions;
DROP POLICY IF EXISTS "sessions_select_public"  ON public.sessions;
DROP POLICY IF EXISTS "sessions_insert_public"  ON public.sessions;
DROP POLICY IF EXISTS "sessions_delete_public"  ON public.sessions;

-- Anonymous policies: semua key (anon + authenticated) boleh akses
CREATE POLICY "sessions_select_public"
  ON public.sessions FOR SELECT
  USING (true);

CREATE POLICY "sessions_insert_public"
  ON public.sessions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "sessions_delete_public"
  ON public.sessions FOR DELETE
  USING (true);

-- ============================================================
-- View: ringkasan stats global (semua sesi)
-- ============================================================

CREATE OR REPLACE VIEW public.session_stats AS
SELECT
  COUNT(*)                                  AS total_sessions,
  SUM(duration_sec)                         AS total_duration_sec,
  AVG(bpm) FILTER (WHERE bpm IS NOT NULL)   AS avg_bpm,
  AVG(gsr_us) FILTER (WHERE gsr_us IS NOT NULL) AS avg_gsr_us,
  COUNT(*) FILTER (WHERE level = 'Tinggi')  AS tinggi_count,
  COUNT(*) FILTER (WHERE level = 'Sedang')  AS sedang_count,
  COUNT(*) FILTER (WHERE level = 'Normal')  AS normal_count,
  MAX(started_at)                           AS last_session_at
FROM public.sessions;

-- Drop view per-user lama kalau ada
DROP VIEW IF EXISTS public.user_session_stats;

-- ============================================================
-- DONE
-- ============================================================

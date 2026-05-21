-- ============================================================
-- Euband Supabase Schema
--
-- Cara pakai:
--   1. Buka Supabase dashboard → SQL Editor → New query
--   2. Paste seluruh file ini → Run
--   3. Cek di Table Editor: tabel `sessions` ada
--   4. Cek di Authentication → Policies: 4 RLS policies aktif
--
-- Schema ini idempotent: aman dijalankan ulang.
-- ============================================================

-- ============================================================
-- Table: sessions
-- Menyimpan hasil analisis tiap sesi rekam (bukan raw samples).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_session  bigint,                              -- session ID dari ESP32 (#START session=...)
  started_at      timestamptz NOT NULL DEFAULT now(),
  duration_sec    numeric(8,1) NOT NULL,
  sample_count    integer NOT NULL,
  sample_rate_hz  integer,

  -- Hasil analisis
  bpm             numeric(5,1),                        -- detak jantung rata-rata
  hrv_sdnn_ms     numeric(6,1),                        -- HRV (info only)
  gsr_mean_adc    integer,                             -- ADC raw mean
  gsr_us          numeric(6,3),                        -- konduktansi µS

  -- Klasifikasi
  category_gsr    text CHECK (category_gsr IN ('Normal', 'Sedang', 'Tinggi', '—')),
  category_bpm    text CHECK (category_bpm IN ('Normal', 'Sedang', 'Tinggi', '—')),
  level           text NOT NULL CHECK (level IN ('Normal', 'Sedang', 'Tinggi')),

  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Index untuk query riwayat user (paling sering: list sesi user, ordered desc)
CREATE INDEX IF NOT EXISTS sessions_user_started_idx
  ON public.sessions (user_id, started_at DESC);

-- ============================================================
-- Row Level Security (RLS)
-- User hanya bisa lihat / insert / update / delete sesi miliknya sendiri.
-- ============================================================

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (idempotent)
DROP POLICY IF EXISTS "sessions_select_own" ON public.sessions;
DROP POLICY IF EXISTS "sessions_insert_own" ON public.sessions;
DROP POLICY IF EXISTS "sessions_update_own" ON public.sessions;
DROP POLICY IF EXISTS "sessions_delete_own" ON public.sessions;

CREATE POLICY "sessions_select_own"
  ON public.sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "sessions_insert_own"
  ON public.sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "sessions_update_own"
  ON public.sessions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "sessions_delete_own"
  ON public.sessions FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- View: ringkasan stats per user (opsional, untuk dashboard)
-- ============================================================

CREATE OR REPLACE VIEW public.user_session_stats AS
SELECT
  user_id,
  COUNT(*)                                  AS total_sessions,
  SUM(duration_sec)                         AS total_duration_sec,
  AVG(bpm) FILTER (WHERE bpm IS NOT NULL)   AS avg_bpm,
  AVG(gsr_us) FILTER (WHERE gsr_us IS NOT NULL) AS avg_gsr_us,
  COUNT(*) FILTER (WHERE level = 'Tinggi')  AS tinggi_count,
  COUNT(*) FILTER (WHERE level = 'Sedang')  AS sedang_count,
  COUNT(*) FILTER (WHERE level = 'Normal')  AS normal_count,
  MAX(started_at)                           AS last_session_at
FROM public.sessions
GROUP BY user_id;

-- View juga ikut RLS dari sessions, jadi user otomatis cuma lihat rownya sendiri.

-- ============================================================
-- DONE
-- ============================================================

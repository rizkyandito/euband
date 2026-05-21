// ============================================================
// API wrapper — sekarang langsung ke Supabase (no backend server)
//
// Tetap expose window.api dengan method generic supaya kode lama
// yang panggil api.get/post/put/delete tetap kompatibel.
// Tapi juga expose window.sessionsApi yang lebih ergonomis untuk
// kasus baru (Supabase native query).
// ============================================================

(function () {
  const sb = window.supabaseClient;

  // ============================================================
  // sessionsApi — high-level untuk tabel `sessions`
  // ============================================================
  const sessionsApi = {
    // Insert hasil analisis sesi rekam.
    // result: { device_session, duration_sec, sample_count, sample_rate_hz,
    //           bpm, hrv_sdnn_ms, gsr_mean_adc, gsr_us,
    //           category_gsr, category_bpm, level, notes }
    async create(result) {
      if (!sb) throw new Error('Supabase belum dikonfigurasi');
      const user = window.auth.getUser();
      if (!user) throw new Error('Belum login');
      const row = { ...result, user_id: user.id };
      const { data, error } = await sb
        .from('sessions')
        .insert(row)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },

    // List sesi user terbaru
    async list(limit = 50) {
      if (!sb) throw new Error('Supabase belum dikonfigurasi');
      const { data, error } = await sb
        .from('sessions')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return data || [];
    },

    async getById(id) {
      if (!sb) throw new Error('Supabase belum dikonfigurasi');
      const { data, error } = await sb
        .from('sessions')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw new Error(error.message);
      return data;
    },

    async deleteById(id) {
      if (!sb) throw new Error('Supabase belum dikonfigurasi');
      const { error } = await sb.from('sessions').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },

    // Stats agregat dari view `user_session_stats`
    async getStats() {
      if (!sb) return null;
      const { data, error } = await sb
        .from('user_session_stats')
        .select('*')
        .maybeSingle();
      if (error) {
        console.warn('[sessionsApi.getStats]', error.message);
        return null;
      }
      return data;
    },
  };

  // ============================================================
  // Legacy api.get/post/... — minimal compat untuk halaman lama.
  // Map beberapa path lama ke operasi Supabase yang ekuivalen.
  // Path yang tidak ke-handle akan throw "Not implemented".
  // ============================================================
  async function legacyRequest(method, path, body) {
    if (!sb) throw { message: 'Supabase belum dikonfigurasi' };

    // /sessions          GET  → list
    // /sessions          POST → create
    // /sessions/:id      GET  → getById
    // /sessions/:id      DELETE → deleteById
    // /me                GET  → return cached user

    const m = method.toUpperCase();
    if (path === '/me' && m === 'GET') {
      const u = window.auth.getUser();
      if (!u) throw { message: 'Not authenticated' };
      return u;
    }
    if (path === '/sessions' && m === 'GET')  return sessionsApi.list();
    if (path === '/sessions' && m === 'POST') return sessionsApi.create(body);

    const idMatch = path.match(/^\/sessions\/([^\/]+)$/);
    if (idMatch && m === 'GET')    return sessionsApi.getById(idMatch[1]);
    if (idMatch && m === 'DELETE') return sessionsApi.deleteById(idMatch[1]);

    throw { message: `api: path "${method} ${path}" tidak di-handle di Supabase mode` };
  }

  window.api = {
    get:    (path)        => legacyRequest('GET', path),
    post:   (path, body)  => legacyRequest('POST', path, body),
    put:    (path, body)  => legacyRequest('PUT', path, body),
    delete: (path)        => legacyRequest('DELETE', path),
  };

  window.sessionsApi = sessionsApi;
})();

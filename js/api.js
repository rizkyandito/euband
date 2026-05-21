// ============================================================
// API wrapper — anonymous mode (no auth).
//
// Semua user share 1 pool sessions di Supabase.
// RLS policies (lihat supabase/schema.sql) allow SELECT/INSERT/DELETE
// dengan anon key tanpa user login.
// ============================================================

(function () {
  const sb = window.supabaseClient;

  // ============================================================
  // sessionsApi — CRUD untuk tabel `sessions`
  // ============================================================
  const sessionsApi = {
    // Insert hasil analisis sesi rekam.
    async create(result) {
      if (!sb) throw new Error('Supabase belum dikonfigurasi');
      // user_id biarkan null (anonymous mode)
      const row = { ...result };
      delete row.user_id;
      const { data, error } = await sb
        .from('sessions')
        .insert(row)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },

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

    // Stats agregat global
    async getStats() {
      if (!sb) return null;
      const { data, error } = await sb
        .from('session_stats')
        .select('*')
        .maybeSingle();
      if (error) {
        console.warn('[sessionsApi.getStats]', error.message);
        return null;
      }
      return data;
    },
  };

  window.sessionsApi = sessionsApi;
})();

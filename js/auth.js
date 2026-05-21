// ============================================================
// Auth helpers — Supabase Auth wrapper
//
// API yang di-expose ke halaman: window.auth.{ ... }
//
//   await auth.signUp(email, password, fullName)  → { user, error }
//   await auth.signIn(email, password)            → { user, error }
//   await auth.signOut()                          → void (redirect ke login.html)
//   auth.getUser()                                → { id, email, ... } | null  (sync, cached)
//   auth.isAuthenticated()                        → bool                       (sync)
//   await auth.requireAuth()                      → bool (redirect kalau belum login)
//
// Backward-compat:
//   - localStorage key 'user' tetap diisi {id, email, full_name}
//     supaya kode lama (layout.js, profile.js) yang baca dari sana
//     tetap jalan tanpa perubahan.
// ============================================================

(function () {
  const sb = window.supabaseClient;
  const USER_KEY = 'user';

  function cacheUser(supaUser) {
    if (!supaUser) {
      localStorage.removeItem(USER_KEY);
      return;
    }
    const u = {
      id: supaUser.id,
      email: supaUser.email,
      full_name: supaUser.user_metadata?.full_name || supaUser.email,
      role: supaUser.user_metadata?.role || 'user',
    };
    localStorage.setItem(USER_KEY, JSON.stringify(u));
  }

  function getUser() {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  function isAuthenticated() {
    // Truthy check ke cache. Validasi real (token expired?) dilakukan
    // di requireAuth() yang call Supabase getSession.
    return !!getUser();
  }

  async function signUp(email, password, fullName) {
    if (!sb) return { user: null, error: 'Supabase belum dikonfigurasi (cek js/config.js)' };
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) return { user: null, error: error.message };
    cacheUser(data.user);
    return { user: data.user, error: null };
  }

  async function signIn(email, password) {
    if (!sb) return { user: null, error: 'Supabase belum dikonfigurasi (cek js/config.js)' };
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return { user: null, error: error.message };
    cacheUser(data.user);
    return { user: data.user, error: null };
  }

  async function signOut() {
    if (sb) await sb.auth.signOut();
    localStorage.removeItem(USER_KEY);
    window.location.href = './login.html';
  }

  // Guard: panggil di awal halaman ter-protect. Async — di-await di top of page.
  async function requireAuth(opts) {
    opts = opts || {};
    if (!sb) {
      window.location.href = './login.html';
      return false;
    }
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      window.location.href = './login.html';
      return false;
    }
    cacheUser(session.user);

    if (opts.role) {
      const u = getUser();
      if (!u || u.role !== opts.role) {
        window.location.href = './dashboard.html';
        return false;
      }
    }
    return true;
  }

  // Sinkronisasi cache kalau session berubah dari tab lain
  if (sb) {
    sb.auth.onAuthStateChange((_event, session) => {
      cacheUser(session?.user || null);
    });
  }

  // ============================================================
  // Backward compatibility shim untuk kode lama yang panggil
  //   auth.login(token, user)  / auth.logout()  (sync style)
  // ============================================================
  function legacyLogin(_token, user) {
    // Token di-handle otomatis oleh Supabase client. Cuma cache user.
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  window.auth = {
    // New API
    signUp, signIn, signOut,
    // Common
    getUser, isAuthenticated, requireAuth,
    // Legacy shims
    login: legacyLogin,
    logout: signOut,
  };
})();

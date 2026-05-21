// Renders sidebar + topbar (mengganti Layout.tsx + Sidebar.tsx)
// Pakai di setiap halaman terproteksi:
//   <div id="app-shell"></div>
//   <script>renderLayout({ active: 'dashboard', content: '<div>...</div>' });</script>
(function () {
  const PATHS = {
    dashboard: './dashboard.html',
    analysis: './analysis.html',
    admin: './admin.html',
    profile: './profile.html',
  };

  // Inline SVG icons (mengganti lucide-react)
  const ICONS = {
    dashboard: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>',
    analysis: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12l2 2 4-4"/></svg>',
    users: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="26" height="26"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
    chevronLeft: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
    chevronDown: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
    sun: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
    moon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    menu: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
    close: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  };

  window.LAYOUT_ICONS = ICONS;

  function renderLayout(opts) {
    opts = opts || {};
    const root = document.getElementById('app-shell');
    if (!root) {
      console.error('renderLayout: #app-shell not found');
      return;
    }

    const user = window.auth.getUser() || { username: 'User', role: 'user' };
    const initial = (user.username || 'U')[0].toUpperCase();
    const isAdmin = user.role === 'admin';
    const minimized = localStorage.getItem('sidebarMinimized') === '1';
    const themeNow = window.theme.current();

    root.innerHTML = `
      <div class="app-shell">
        <aside class="sidebar ${minimized ? 'minimized' : ''}" id="sidebar">
          <div class="mobile-header">
            <div class="logo-badge small">${ICONS.activity.replace('width="26"','width="20"').replace('height="26"','height="20"')}</div>
            <button class="btn-ghost" id="mobileToggle" type="button">${ICONS.menu}</button>
          </div>
          <div class="sidebar-body" id="sidebarBody">
            <div class="sidebar-logo">
              <div class="logo-badge">${ICONS.activity}</div>
              <button class="minimize-btn" id="minimizeBtn" title="Minimize">${ICONS.chevronLeft}</button>
            </div>
            <div class="sidebar-userinfo">
              <div class="avatar">${initial}</div>
              <div class="info min-w-0">
                <p class="name">${escapeHtml(user.username)}</p>
                <p class="role">${escapeHtml(user.role)}</p>
              </div>
            </div>
            <nav class="sidebar-nav">
              <a href="${PATHS.dashboard}" class="nav-link ${opts.active === 'dashboard' ? 'active' : ''}">
                <span>${ICONS.dashboard}</span><span class="label">Dashboard</span>
              </a>
              <a href="${PATHS.analysis}" class="nav-link ${opts.active === 'analysis' ? 'active' : ''}">
                <span>${ICONS.analysis}</span><span class="label">Analysis</span>
              </a>
              ${isAdmin ? `<a href="${PATHS.admin}" class="nav-link ${opts.active === 'admin' ? 'active' : ''}"><span>${ICONS.users}</span><span class="label">User Management</span></a>` : ''}
            </nav>
          </div>
        </aside>

        <main class="main-area">
          <div class="topbar">
            <div class="topbar-inner">
              <button id="themeToggle" class="theme-toggle" title="Toggle theme">${themeNow === 'dark' ? ICONS.moon : ICONS.sun}</button>
              <button class="user-button" id="userMenuBtn" type="button">
                <div class="avatar">${initial}</div>
                <span>${escapeHtml(user.username)}</span>
                <span>${ICONS.chevronDown}</span>
              </button>
              <div class="user-menu hidden" id="userMenu">
                <button id="profileBtn" type="button">Profile</button>
                <button id="logoutBtn" type="button" class="danger">Logout</button>
              </div>
            </div>
          </div>
          <div id="page-content"></div>
        </main>
      </div>
    `;

    // Inject content into page-content
    const content = document.getElementById('page-content');
    if (typeof opts.content === 'string') {
      content.innerHTML = opts.content;
    } else if (opts.content instanceof Node) {
      content.appendChild(opts.content);
    }

    // Wire interactions
    document.getElementById('themeToggle').addEventListener('click', () => {
      const next = window.theme.toggle();
      document.getElementById('themeToggle').innerHTML = next === 'dark' ? ICONS.moon : ICONS.sun;
    });

    const userBtn = document.getElementById('userMenuBtn');
    const userMenu = document.getElementById('userMenu');
    userBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userMenu.classList.toggle('hidden');
    });
    document.addEventListener('click', () => userMenu.classList.add('hidden'));

    document.getElementById('profileBtn').addEventListener('click', () => {
      window.location.href = PATHS.profile;
    });
    document.getElementById('logoutBtn').addEventListener('click', () => {
      window.auth.logout();
    });

    document.getElementById('minimizeBtn').addEventListener('click', () => {
      const sidebar = document.getElementById('sidebar');
      sidebar.classList.toggle('minimized');
      localStorage.setItem('sidebarMinimized', sidebar.classList.contains('minimized') ? '1' : '0');
    });

    document.getElementById('mobileToggle').addEventListener('click', () => {
      document.getElementById('sidebarBody').classList.toggle('open');
    });

    if (typeof opts.onReady === 'function') opts.onReady();
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  window.renderLayout = renderLayout;
  window.escapeHtml = escapeHtml;
})();

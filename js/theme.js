// Theme management — meniru ThemeContext.tsx
(function () {
  function applyTheme(theme) {
    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    root.classList.add(theme);
    localStorage.setItem('theme', theme);
  }

  function getCurrentTheme() {
    return localStorage.getItem('theme') || 'light';
  }

  function toggleTheme() {
    const current = getCurrentTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    document.dispatchEvent(new CustomEvent('themechange', { detail: next }));
    return next;
  }

  // Apply on load (sebelum DOM ready supaya tidak flicker)
  applyTheme(getCurrentTheme());

  window.theme = {
    apply: applyTheme,
    current: getCurrentTheme,
    toggle: toggleTheme,
  };
})();

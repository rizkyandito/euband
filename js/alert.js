// Toast alert system — meniru AlertContext.tsx
(function () {
  let container = null;

  function ensureContainer() {
    if (container) return container;
    container = document.createElement('div');
    container.className = 'alert-wrap';
    document.body.appendChild(container);
    return container;
  }

  const ICONS = {
    success: '✓',
    error: '!',
    warning: '⚠',
    info: 'i',
  };

  function toText(message) {
    if (message == null) return '';
    if (typeof message === 'string') return message;
    if (typeof message === 'object') {
      if (message.message && typeof message.message === 'string') return message.message;
      try { return JSON.stringify(message); } catch { return String(message); }
    }
    return String(message);
  }

  window.showAlert = function (message, type) {
    type = type || 'info';
    const wrap = ensureContainer();
    const el = document.createElement('div');
    el.className = 'alert ' + type;
    el.innerHTML = `
      <div class="icon">${ICONS[type] || 'i'}</div>
      <div class="msg"></div>
      <button class="close" type="button">×</button>
    `;
    el.querySelector('.msg').textContent = toText(message);
    el.querySelector('.close').addEventListener('click', () => el.remove());
    wrap.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 5000);
  };
})();

// Modal Dialog — meniru DialogContext.tsx (showConfirm + showPrompt)
(function () {
  function buildDialog(opts) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'dialog-overlay';

      const isPrompt = opts.type === 'prompt';
      const variant = opts.variant || 'danger';
      const titleIcon = variant === 'danger' ? '⚠' : (variant === 'info' ? '🔑' : 'ℹ');

      overlay.innerHTML = `
        <div class="dialog" role="dialog" aria-modal="true">
          <div class="dialog-head">
            <h3 class="dialog-title">
              <span>${titleIcon}</span>
              <span class="dialog-title-text"></span>
            </h3>
            <button class="btn-ghost dialog-close" type="button">×</button>
          </div>
          <p class="msg"></p>
          ${isPrompt ? `<input class="input" type="${opts.inputType || 'text'}" autofocus />` : ''}
          <div class="dialog-actions">
            <button type="button" class="ghost btn dialog-cancel"></button>
            <button type="button" class="confirm btn dialog-confirm ${variant === 'danger' ? 'danger' : ''}"></button>
          </div>
        </div>
      `;

      overlay.querySelector('.dialog-title-text').textContent = opts.title || (isPrompt ? 'Enter Value' : 'Confirm Action');
      overlay.querySelector('.msg').textContent = opts.message;
      overlay.querySelector('.dialog-cancel').textContent = opts.cancelText || 'Cancel';
      overlay.querySelector('.dialog-confirm').textContent = opts.confirmText || (isPrompt ? 'Submit' : 'Confirm');

      const input = overlay.querySelector('input');

      function close(value) {
        overlay.remove();
        resolve(value);
      }

      overlay.querySelector('.dialog-close').addEventListener('click', () => close(isPrompt ? null : false));
      overlay.querySelector('.dialog-cancel').addEventListener('click', () => close(isPrompt ? null : false));
      overlay.querySelector('.dialog-confirm').addEventListener('click', () => close(isPrompt ? input.value : true));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(isPrompt ? null : false); });
      if (input) {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') close(input.value);
          if (e.key === 'Escape') close(null);
        });
        setTimeout(() => input.focus(), 50);
      }

      document.body.appendChild(overlay);
    });
  }

  window.showConfirm = function (message, options) {
    return buildDialog(Object.assign({
      message,
      type: 'confirm',
      title: 'Confirm Action',
      confirmText: 'Confirm',
      cancelText: 'Cancel',
      variant: 'danger',
    }, options || {}));
  };

  window.showPrompt = function (message, options) {
    return buildDialog(Object.assign({
      message,
      type: 'prompt',
      title: 'Enter Value',
      confirmText: 'Submit',
      cancelText: 'Cancel',
      inputType: 'text',
      variant: 'info',
    }, options || {}));
  };
})();

// Profile page logic — port dari src/pages/Profile.tsx
(function () {
  if (!window.auth.requireAuth()) return;

  const user = window.auth.getUser() || {};
  const ICON_USER = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
  const ICON_LOCK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

  function pageMarkup() {
    return `
      <div class="profile-wrap">
        <h1 class="text-primary" style="font-size: 30px; font-weight: 700;">My Profile</h1>
        <div class="card lg">
          <div class="profile-head">
            <div class="profile-avatar">${ICON_USER}</div>
            <div>
              <p class="text-xs text-secondary uppercase tracking-wide font-bold">Username</p>
              <p class="profile-uname">${window.escapeHtml(user.username || '')}</p>
              <p class="text-sm text-secondary">Role: <span class="uppercase">${window.escapeHtml(user.role || '')}</span></p>
            </div>
          </div>

          <form id="pwForm" class="profile-form-section">
            <h3 class="text-primary"><span style="color: var(--accent);">${ICON_LOCK}</span> Change Password</h3>
            <div>
              <label class="label">New Password</label>
              <input type="password" id="newPw" class="input" />
            </div>
            <div>
              <label class="label">Confirm Password</label>
              <input type="password" id="confirmPw" class="input" />
            </div>
            <button type="submit" class="btn btn-primary" style="padding: 8px 24px; font-size: 14px;">Update Password</button>
          </form>
        </div>
      </div>
    `;
  }

  window.renderLayout({ active: 'profile', content: pageMarkup(), onReady: () => {
    document.getElementById('pwForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const pw = document.getElementById('newPw').value;
      const confirm = document.getElementById('confirmPw').value;
      if (pw !== confirm) return window.showAlert('Passwords do not match', 'error');
      if (pw.length < 6) return window.showAlert('Password must be at least 6 characters', 'error');
      try {
        await window.api.post('/api/change-password', { password: pw });
        window.showAlert('Password updated successfully', 'success');
        document.getElementById('newPw').value = '';
        document.getElementById('confirmPw').value = '';
      } catch (err) {
        window.showAlert(err?.message || 'Failed to update password', 'error');
      }
    });
  }});
})();

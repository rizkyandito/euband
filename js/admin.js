// Admin page — port dari src/pages/AdminDashboard.tsx
(function () {
  if (!window.auth.requireAuth({ role: 'admin' })) return;

  const ICON_KEY = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>';
  const ICON_TRASH = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>';

  function pageMarkup() {
    return `
      <div>
        <h1 class="text-primary mb-6" style="font-size: 30px; font-weight: 700;">User Management</h1>
        <div style="overflow-x: auto;">
          <table class="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Username</th>
                <th>Role</th>
                <th>Created At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="userTbody">
              <tr><td colspan="5" class="text-center text-secondary">Loading...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  window.renderLayout({ active: 'admin', content: pageMarkup(), onReady: load });

  async function load() {
    try {
      const data = await window.api.get('/api/users');
      render(Array.isArray(data) ? data : []);
    } catch (e) {
      window.showAlert(e?.message || 'Failed to load users', 'error');
    }
  }

  function render(users) {
    const tbody = document.getElementById('userTbody');
    if (users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-secondary">No users.</td></tr>';
      return;
    }
    tbody.innerHTML = users.map((u) => `
      <tr>
        <td>${u.id}</td>
        <td>${window.escapeHtml(u.username)}</td>
        <td><span class="role-pill ${u.role === 'admin' ? 'admin' : 'user'}">${window.escapeHtml(u.role)}</span></td>
        <td>${new Date(u.created_at).toLocaleDateString()}</td>
        <td>
          <div style="display: flex; gap: 8px;">
            <button class="text-accent" data-pw="${u.id}" title="Change Password" style="background:none;">${ICON_KEY}</button>
            <button class="text-danger" data-del="${u.id}" title="Delete User" style="background:none;">${ICON_TRASH}</button>
          </div>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('button[data-pw]').forEach((b) =>
      b.addEventListener('click', () => changePassword(parseInt(b.dataset.pw, 10))),
    );
    tbody.querySelectorAll('button[data-del]').forEach((b) =>
      b.addEventListener('click', () => deleteUser(parseInt(b.dataset.del, 10))),
    );
  }

  async function deleteUser(id) {
    const ok = await window.showConfirm(
      'Are you sure you want to permanently delete this user? This action cannot be undone.',
      { title: 'Delete User', confirmText: 'Delete', variant: 'danger' },
    );
    if (!ok) return;
    try {
      await window.api.delete('/api/users/' + id);
      window.showAlert('User deleted successfully', 'success');
      load();
    } catch (e) {
      window.showAlert(e?.message || 'Failed to delete', 'error');
    }
  }

  async function changePassword(id) {
    const pw = await window.showPrompt('Enter the new password for this user:', {
      title: 'Change Password',
      inputType: 'password',
      confirmText: 'Update',
      variant: 'info',
    });
    if (!pw) return;
    if (pw.length < 6) return window.showAlert('Password must be at least 6 characters', 'error');
    try {
      await window.api.put('/api/users/' + id + '/password', { password: pw });
      window.showAlert('User password updated', 'success');
    } catch (e) {
      window.showAlert(e?.message || 'Failed to update password', 'error');
    }
  }
})();

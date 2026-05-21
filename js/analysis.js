// Analysis page logic — port dari src/pages/Analysis.tsx
(function () {
  if (!window.auth.requireAuth()) return;

  const ICON_ACTIVITY = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>';

  function pageMarkup() {
    return `
      <div>
        <div class="mb-6">
          <h1 class="text-primary" style="font-size: 24px; font-weight: 600;">Analysis</h1>
          <p class="subtitle" style="font-size: 14px;">Summaries for recorded gyro sessions.</p>
        </div>
        <div id="analysisRoot"><p class="text-secondary">Loading analysis...</p></div>
      </div>
    `;
  }

  window.renderLayout({ active: 'analysis', content: pageMarkup(), onReady: load });

  async function load() {
    const root = document.getElementById('analysisRoot');
    try {
      const data = await window.api.get('/api/history');
      const groups = window.analysisUtils.groupHistoryByTimestamp(Array.isArray(data) ? data : []);
      if (groups.length === 0) {
        root.innerHTML = `
          <div class="card lg text-center text-secondary">
            No gyro data found. Record a session first.
          </div>`;
        return;
      }

      root.innerHTML = `
        <div class="analysis-list">
          ${groups.map((g) => `
            <div class="analysis-group">
              <div class="analysis-group-head">
                <span>Record</span>
                <span class="time">${window.escapeHtml(g.formattedTime)}</span>
              </div>
              <div class="analysis-group-body">
                ${g.items.map((it) => `
                  <div class="analysis-item analysis-color-${it.analysis.color}">
                    <div class="analysis-gyro">
                      <div class="gyro-icon">${ICON_ACTIVITY}</div>
                      <div>
                        <div class="text-xs text-secondary">Gyro Avg</div>
                        <div class="font-semibold text-lg">${Number(it.gyro).toFixed(2)}</div>
                      </div>
                    </div>
                    <div class="flex-1">
                      <div class="mb-1">
                        <span class="level-pill">Level ${it.analysis.level}</span>
                        <span class="font-semibold">${window.escapeHtml(it.analysis.name)}</span>
                      </div>
                      <p class="text-sm text-secondary">${window.escapeHtml(it.analysis.summary)}</p>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } catch (e) {
      window.showAlert('Failed to load analysis data', 'error');
      root.innerHTML = '<p class="text-danger">Failed to load.</p>';
    }
  }
})();

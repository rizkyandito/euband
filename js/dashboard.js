// UserDashboard logic — vanilla JS port dari src/pages/UserDashboard.tsx
// Memerlukan: api.js, auth.js, alert.js, dialog.js, theme.js, layout.js, config.js
// + Chart.js dari CDN, mqtt.min.js dari CDN
(function () {
  if (!window.auth.requireAuth()) return;

  const cfg = window.APP_CONFIG;
  const MQTT_HOST = cfg.MQTT_HOST;
  const MQTT_USER = cfg.MQTT_USER;
  const MQTT_PASS = cfg.MQTT_PASS;

  const MAX_POINTS = 1000;  // 10 detik @ 100 Hz

  // State
  const state = {
    history: [],
    gsrData: [], // {t, gsr}
    pulseData: [], // {t, bpm, spo2?}
    irData: [], // {t, ir}
    sensorIr: 0,
    fingerDetected: 0,
    status: 'Disconnected',
    isMonitoring: false,
    elapsed: 0,
    deviceStatus: { on: 0, motionExcess: 0 },
  };

  const refs = {
    sessionBuffer: [],
    startTime: 0,
    client: null,
    timerId: null,
    elapsedInterval: null,
  };

  // ---------- Markup helpers ----------
  const ICON = {
    activity: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
    heart: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
    droplet: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>',
    radio: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/></svg>',
    clock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    play: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>',
    stop: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    power: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>',
    zap: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    alert: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    finger: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 11V3a3 3 0 0 1 6 0v9"/><path d="M6 11V8a3 3 0 0 1 6 0v6"/><path d="M18 11a3 3 0 0 1 3 3v0a9 9 0 0 1-9 9H9a4 4 0 0 1-4-4v-2a4 4 0 0 1 4-4"/></svg>',
    trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/></svg>',
    refresh: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
    waves: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s2-3 5-3 5 6 8 6 5-3 7-3"/></svg>',
  };

  function pageMarkup() {
    return `
      <!-- Hero -->
      <section class="hero">
        <div class="hero-inner">
          <div class="live-pill" id="livePill">
            <span class="pulse"></span>
            <span id="liveLabel">DISCONNECTED</span>
          </div>
          <h1>Bio-Signal Monitor</h1>
          <p class="subtitle">Pantau sinyal GSR, denyut jantung, dan SpO₂ secara real-time.</p>
          <div class="hero-meta">
            <div class="meta-chip" id="elapsedChip" style="display:none;">
              ${ICON.clock}
              <span><strong id="elapsedText">0:00</strong> elapsed</span>
            </div>
            <div class="meta-chip">
              ${ICON.radio}
              <span>MQTT <strong id="mqttHost">HiveMQ</strong></span>
            </div>
            <div class="meta-chip">
              ${ICON.waves}
              <span><strong id="sampleCount">0</strong> samples</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Gauges -->
      <div class="gauges">
        ${gaugeCard('GSR Value',     '0', '',    'statGsr',  'blue',   ICON.activity, 'gsrSpark')}
        ${gaugeCard('Heart Rate',    '—', 'bpm', 'statBpm',  'red',    ICON.heart,    'bpmSpark')}
        ${gaugeCard('SpO₂',          '—', '%',   'statSpo2', 'green',  ICON.droplet,  'spo2Spark')}
        ${gaugeCard('IR Signal',     '—', '',    'statIr',   'purple', ICON.radio,    'irSparkMini')}
      </div>

      <!-- Action bar -->
      <div class="action-bar">
        <button id="startBtn" class="btn-action">${ICON.play} Start Monitoring</button>
        <button id="stopBtn" class="btn-action stop hidden">${ICON.stop} Stop</button>
        <div class="quick-pills">
          <button class="quick-pill quick" data-sec="5">5s</button>
          <button class="quick-pill quick" data-sec="10">10s</button>
          <button class="quick-pill quick" data-sec="30">30s</button>
        </div>
      </div>

      <!-- IR Signal panel -->
      <div class="glass">
        <div class="glass-head">
          <div class="glass-title">
            <h2>IR Signal</h2>
            <p>Raw infrared dari MAX30102 — indikator perfusi darah</p>
          </div>
          <span class="tag dim" id="fingerTag">Finger not detected</span>
        </div>
        <div id="irEmpty" class="chart-empty-modern">
          <div class="glow">${ICON.radio}</div>
          <h3>Menunggu sinyal IR…</h3>
          <p>Tempelkan jari ke sensor MAX30102 untuk mulai membaca.</p>
        </div>
        <div id="irWrap" class="chart-area chart-area-sm hidden" style="height:140px;">
          <canvas id="irChart"></canvas>
        </div>
      </div>

      <!-- Big chart panel -->
      <div class="glass">
        <div class="glass-head">
          <div class="glass-title">
            <h2>Real-time Monitoring</h2>
            <p>Visualisasi gabungan GSR & Heart Rate</p>
          </div>
          <span class="tag" id="liveTag" style="display:none;">● LIVE</span>
        </div>
        <div id="bigEmpty" class="chart-empty-modern">
          <div class="glow">${ICON.waves}</div>
          <h3>Belum ada data</h3>
          <p id="bigEmptySub">Klik Start Monitoring untuk mulai merekam.</p>
        </div>
        <div id="bigWrap" class="chart-area chart-area-lg hidden">
          <canvas id="bigChart"></canvas>
        </div>
      </div>

      <!-- System status -->
      <div class="section-h">
        <h2>System Status</h2>
        <div class="line"></div>
      </div>
      <div class="status-cards">
        ${statusCard('Device', 'device', ICON.power)}
        ${statusCard('Motor',  'motor',  ICON.zap)}
        ${statusCard('Motion', 'motion', ICON.alert, true)}
        ${statusCard('Finger', 'finger', ICON.finger)}
      </div>

      <!-- History -->
      <div class="glass history-modern">
        <div class="glass-head">
          <div class="glass-title">
            <h2>Session History</h2>
            <p>10 rekaman terakhir</p>
          </div>
          <button id="refreshHistoryBtn" class="quick-pill" style="padding:8px 14px;">
            ${ICON.refresh} Refresh
          </button>
        </div>
        <div class="history-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Sensor</th>
                <th class="right">Average</th>
                <th class="right">Maximum</th>
                <th class="center">Action</th>
              </tr>
            </thead>
            <tbody id="historyBody">
              <tr><td colspan="5" class="empty">No data yet</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function gaugeCard(label, value, unit, id, color, icon, sparkId) {
    return `
      <div class="gauge-card" data-color="${color}">
        <div class="gauge-head">
          <div class="gauge-icon">${icon}</div>
          <span class="gauge-trend hidden" id="${id}-trend">—</span>
        </div>
        <p class="gauge-label">${label}</p>
        <div>
          <span class="gauge-value" id="${id}">${value}</span>
          ${unit ? `<span class="gauge-unit">${unit}</span>` : ''}
        </div>
        <div class="chart-area chart-area-xs gauge-spark"><canvas id="${sparkId}"></canvas></div>
      </div>`;
  }

  function statusCard(label, key, icon, isAlert) {
    return `
      <div class="status-card" id="status-${key}" data-alert="${isAlert ? '1' : '0'}">
        <div class="ic">${icon}</div>
        <div>
          <p class="lbl">${label}</p>
          <p class="val">Inactive</p>
        </div>
      </div>`;
  }

  // ---------- Render ----------
  window.renderLayout({
    active: 'dashboard',
    content: pageMarkup(),
    onReady: init,
  });

  let irChart = null;
  let bigChart = null;

  function init() {
    document.getElementById('startBtn').addEventListener('click', () => startMonitoring());
    document.getElementById('stopBtn').addEventListener('click', () => stopMonitoring(true));
    document.querySelectorAll('.quick').forEach((btn) => {
      btn.addEventListener('click', () => handleQuickRecord(parseInt(btn.dataset.sec, 10)));
    });
    document.getElementById('refreshHistoryBtn').addEventListener('click', loadHistory);

    document.addEventListener('themechange', () => {
      if (irChart) updateChartTheme(irChart);
      if (bigChart) updateChartTheme(bigChart);
    });

    loadHistory();

    // Auto-connect MQTT begitu halaman terbuka.
    if (window.mqtt && window.mqtt.connect) {
      autoConnectMqtt();
    } else {
      console.warn('mqtt.js belum ke-load — fallback API polling perlu Start');
    }

    // Staleness watchdog — kalau tidak ada batch dalam 3 detik, anggap stream mati.
    // Ini untuk kasus ESP32 mati / WiFi putus tapi browser masih nyangkut connect ke broker.
    setInterval(() => {
      if (!state.lastDataMs) return;
      const stale = Date.now() - state.lastDataMs;
      if (stale > 3000 && state.deviceStatus.on === 1) {
        console.warn('[watchdog] no data for', stale, 'ms — marking device offline');
        state.deviceStatus.on = 0;
        state.fingerDetected = 0;
        sampleQueue.length = 0;
        updateLiveUI();
      }
    }, 1000);
  }

  function autoConnectMqtt() {
    if (refs.client) return;
    setStatus('Connecting...');
    const clientId = 'web_' + Date.now() + '_' + Math.random().toString(16).slice(2, 10);
    const opts = {
      protocol: 'wss',
      clientId,
      rejectUnauthorized: false,
      reconnectPeriod: 1000,
      connectTimeout: 15000,
      clean: true,
      keepalive: 60,
    };
    if (MQTT_USER) opts.username = MQTT_USER;
    if (MQTT_PASS) opts.password = MQTT_PASS;

    const client = window.mqtt.connect(MQTT_HOST, opts);
    refs.client = client;

    client.on('connect', () => {
      setStatus('Connected');
      const topics = [
        'euband/Euband01/sensors',
        'euband/Euband01/status',
      ];
      topics.forEach((t) => client.subscribe(t, (err) => {
        if (err) console.warn('subscribe fail', t, err);
        else console.log('✓ subscribed', t);
      }));
    });

    client.on('message', handleIncomingMessage);

    client.on('error', (err) => {
      const msg = (err && err.message) || 'Unknown';
      console.error('[mqtt error]', msg);
      setStatus('Error: ' + msg);
    });

    client.on('disconnect', () => onMqttDown('Disconnected'));
    client.on('close', () => onMqttDown('Disconnected'));
    client.on('offline', () => onMqttDown('Offline'));
    client.on('reconnect', () => setStatus('Reconnecting...'));
  }

  // Dipanggil saat koneksi MQTT putus — bersihkan UI agar tidak misleading.
  function onMqttDown(label) {
    setStatus(label);
    state.deviceStatus.on = 0;
    state.deviceStatus.motionExcess = 0;
    state.fingerDetected = 0;
    // Buang sample yang masih antri — kalau tidak, drip-feed akan tetap
    // render data lama walau ESP32 sudah mati.
    sampleQueue.length = 0;
    updateLiveUI();
  }


  // ---------- API ----------
  async function loadHistory() {
    try {
      const data = await window.api.get('/api/history');
      state.history = Array.isArray(data) ? data : [];
      renderHistory();
    } catch (e) {
      console.error('loadHistory error:', e);
    }
  }

  async function saveData() {
    const buffer = refs.sessionBuffer;
    if (buffer.length === 0) return;
    const min = Math.min(...buffer);
    const max = Math.max(...buffer);
    const avg = buffer.reduce((a, b) => a + b, 0) / buffer.length;
    try {
      await window.api.post('/api/history', {
        sensor_type: 'gsr',
        start_time: new Date(refs.startTime).toISOString(),
        end_time: new Date().toISOString(),
        min_value: min,
        max_value: max,
        avg_value: avg,
        sample_count: buffer.length,
      });
      window.showAlert('Data saved successfully!', 'success');
      loadHistory();
    } catch (e) {
      window.showAlert('Error saving data: ' + (e?.message || 'Unknown'), 'error');
    }
    refs.sessionBuffer = [];
  }

  async function handleDelete(id) {
    const ok = await window.showConfirm('Are you sure you want to delete this session record?', {
      title: 'Delete Session',
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await window.api.delete('/api/history/' + id);
      window.showAlert('Session deleted', 'success');
      loadHistory();
    } catch (e) {
      window.showAlert('Failed to delete', 'error');
    }
  }

  // ---------- MQTT message dispatcher ----------
  function handleIncomingMessage(topic, payload) {
    // mqtt.js v5 di browser kasih payload sebagai Uint8Array (atau Buffer-shim).
    let u8;
    if (payload instanceof Uint8Array) {
      u8 = payload;
    } else if (payload && typeof payload.length === 'number' && payload.buffer) {
      u8 = new Uint8Array(payload.buffer, payload.byteOffset || 0, payload.length);
    } else if (payload && typeof payload.length === 'number') {
      u8 = new Uint8Array(payload);
    } else if (typeof payload === 'string') {
      u8 = new TextEncoder().encode(payload);
    } else {
      console.warn('[mqtt] unknown payload type', typeof payload, payload);
      return;
    }
    console.log('[mqtt msg]', topic, 'bytes=', u8.byteLength);

    if (topic === 'esp32/vib/state' ||
        topic === 'euband/Euband01/status' ||
        topic === 'euband/Euband01/session') {
      try {
        const text = new TextDecoder().decode(u8);
        console.log('[state]', topic, text);
        const obj = JSON.parse(text);
        if (obj && obj.event === 'online') state.deviceStatus.on = 1;
        if (obj && (obj.event === 'session_start' || obj.event === 'reconnected')) {
          state.deviceStatus.on = 1;
        }
        updateLiveUI();
      } catch { /* raw text */ }
      return;
    }

    if (topic === 'esp32/gsr/batch') return handleGsrBatch(u8);
    if (topic === 'esp32/vitals/bin') return handleVitalsBin(u8);
    if (topic === 'esp32/vitals/raw') return handleVitalsJsonRaw(u8);
    if (topic === 'esp32/vib/bin') return handleGyroBin(u8);
    if (topic === 'euband/Euband01/sensors') return handleEubandSensors(u8);

    console.log('[unknown topic]', topic, 'len=', u8.byteLength);
  }

  // ---------- Topic handlers ----------
  function pushPoint(arr, point, max) {
    arr.push(point);
    if (arr.length > max) arr.shift();
  }

  function handleGsrBatch(u8) {
    // BATCH_SIZE = 40 sampel uint16 little-endian = 80 bytes
    if (u8.byteLength < 2 || u8.byteLength % 2 !== 0) {
      console.warn('[gsr/batch] invalid size', u8.byteLength);
      return;
    }
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const count = u8.byteLength / 2;
    const t = Date.now();
    for (let i = 0; i < count; i++) {
      const v = dv.getUint16(i * 2, true);
      pushPoint(state.gsrData, { t: t + i, gsr: v }, MAX_POINTS);
      refs.sessionBuffer.push(v);
    }
    console.log('[gsr/batch]', count, 'samples, last=', dv.getUint16((count - 1) * 2, true));
    updateLiveUI();
  }

  function handleVitalsBin(u8) {
    // VitalsPacket = 4f + 4B = 20 bytes (LK2.ino), atau bentuk lain
    if (u8.byteLength < 16) {
      console.warn('[vitals/bin] too small', u8.byteLength);
      return;
    }
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const tSec = dv.getFloat32(0, true);
    const hr = dv.getFloat32(4, true);
    const spo2 = dv.getFloat32(8, true);
    const hrValid = dv.byteLength >= 13 ? dv.getUint8(12) : 0;
    const spo2Valid = dv.byteLength >= 14 ? dv.getUint8(13) : 0;
    const deviceOn = dv.byteLength >= 15 ? dv.getUint8(14) : 0;

    const t = Date.now();
    pushPoint(state.pulseData, { t, bpm: hr, spo2, hrValid, spo2Valid }, MAX_POINTS);
    state.deviceStatus.on = deviceOn;
    console.log('[vitals/bin] hr=', hr.toFixed(1), 'spo2=', spo2.toFixed(1), 'valid=', hrValid, spo2Valid);
    updateLiveUI();
  }

  function handleVitalsJsonRaw(u8) {
    try {
      const text = new TextDecoder().decode(u8);
      const obj = JSON.parse(text);
      const ir = Number(obj.ir) || 0;
      const finger = Number(obj.finger) || 0;
      const t = Date.now();
      pushPoint(state.irData, { t, ir }, MAX_POINTS);
      state.sensorIr = ir;
      state.fingerDetected = finger;
      console.log('[vitals/raw] ir=', ir, 'finger=', finger);
      updateLiveUI();
    } catch (e) {
      console.error('[vitals/raw] parse error', e);
    }
  }

  function handleGyroBin(u8) {
    // GyroPacket: 5 float + 4 uint8 = 24 bytes (simulator) atau sejenis
    if (u8.byteLength < 20) {
      console.warn('[vib/bin] too small', u8.byteLength);
      return;
    }
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const tSec = dv.getFloat32(0, true);
    const gx = dv.getFloat32(4, true);
    const gy = dv.getFloat32(8, true);
    const gz = dv.getFloat32(12, true);
    const mag = dv.getFloat32(16, true);
    const deviceOn = dv.byteLength >= 21 ? dv.getUint8(20) : 0;
    const motorOn = dv.byteLength >= 22 ? dv.getUint8(21) : 0;
    const motionExcess = dv.byteLength >= 23 ? dv.getUint8(22) : 0;

    const t = Date.now();
    // Pakai magnitude sebagai proxy GSR-like view (compat dengan grafik existing)
    pushPoint(state.gsrData, { t, gsr: mag * 100 }, MAX_POINTS);
    refs.sessionBuffer.push(mag);
    state.deviceStatus = { on: deviceOn, motionExcess };
    console.log('[vib/bin] gx=', gx.toFixed(1), 'mag=', mag.toFixed(2), 'motor=', motorOn);
    updateLiveUI();
  }

  // Handler untuk firmware Euband (LK2.ino)
  // SensorFrame layout (#pragma pack(1)):
  //   uint32 session_id      offset   0 (4 bytes)
  //   float  ts_sec          offset   4 (4 bytes)
  //   uint32 ppg_samples[50] offset   8 (200 bytes)
  //   uint16 gsr_samples[50] offset 208 (100 bytes)
  // total: 308 bytes
  // Antrean sample untuk drip-feed ke chart. Tiap batch (n sample) ditaruh di
  // sini dulu, lalu loop drip-feed pop 1-2 sample per frame supaya kelihatan
  // mengalir, BUKAN nge-jump 50 titik tiap 0.5s.
  const sampleQueue = [];
  let dripStarted = false;

  function handleEubandSensors(u8) {
    if (u8.byteLength < 14) {
      console.warn('[euband/sensors] payload too small', u8.byteLength);
      return;
    }
    const headerSize = 8;
    const remaining = u8.byteLength - headerSize;
    if (remaining % 6 !== 0) {
      console.warn('[euband/sensors] unexpected size', u8.byteLength);
      return;
    }
    const BATCH = remaining / 6;

    // Penanda data terakhir tiba dari device (untuk staleness watchdog)
    state.lastDataMs = Date.now();
    state.deviceStatus.on = 1;

    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const sessionId = dv.getUint32(0, true);
    const tsSec = dv.getFloat32(4, true);
    const ppgOffset = headerSize;
    const gsrOffset = ppgOffset + BATCH * 4;

    // Antri SEMUA sample dari batch ini — di-drip-feed oleh loop animator
    for (let i = 0; i < BATCH; i++) {
      sampleQueue.push({
        ppg: dv.getUint32(ppgOffset + i * 4, true),
        gsr: dv.getUint16(gsrOffset + i * 2, true),
      });
    }

    console.log('[euband/sensors] session=', sessionId, 'ts=', tsSec.toFixed(2),
                'batch=', BATCH, 'queued=', sampleQueue.length);

    if (!dripStarted) {
      dripStarted = true;
      startDripFeed();
    }
  }

  // Drip-feed: pop sample dari queue dengan rate yang merata.
  // Target rate = 100 Hz (sesuai sampling rate firmware).
  // Algoritma: setiap animation frame (~16ms), pop sebanyak yang dibutuhkan
  // berdasarkan elapsed time. Jika queue panjang (catch up), pop lebih banyak.
  function startDripFeed() {
    let lastTick = performance.now();
    const TARGET_HZ = 100;

    function tick(now) {
      const dt = now - lastTick;
      lastTick = now;

      // Berapa sample harus di-pop frame ini berdasarkan elapsed time
      let toPop = Math.max(1, Math.round((dt / 1000) * TARGET_HZ));
      // Catch-up: kalau queue terlalu panjang, percepat
      if (sampleQueue.length > 100) toPop = Math.max(toPop, 4);
      if (sampleQueue.length > 200) toPop = Math.max(toPop, 8);

      let lastPpg = state.sensorIr;
      let lastGsr = state.gsrData.length ? state.gsrData[state.gsrData.length - 1].gsr : 0;
      let popped = 0;

      if (state.sampleCounter === undefined) state.sampleCounter = 0;

      while (popped < toPop && sampleQueue.length > 0) {
        const s = sampleQueue.shift();
        const t = state.sampleCounter++;
        pushPoint(state.irData, { t, ir: s.ppg }, MAX_POINTS);
        pushPoint(state.gsrData, { t, gsr: s.gsr }, MAX_POINTS);
        if (state.isMonitoring) refs.sessionBuffer.push(s.gsr);
        lastPpg = s.ppg;
        lastGsr = s.gsr;
        popped++;
      }

      if (popped > 0) {
        state.sensorIr = lastPpg;
        state.fingerDetected = lastPpg > 50000 ? 1 : 0;
        updateLiveUI();
      }

      requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }


  // ---------- Monitoring control ----------
  // Catatan: MQTT sudah auto-connect saat halaman dibuka.
  // Tombol Start cuma menandai "mulai rekam ke session buffer".
  function startMonitoring(duration) {
    if (state.isMonitoring) return;

    // Kalau MQTT belum aktif (mqtt.js gagal load), fallback ke API polling.
    if (!refs.client) {
      if (window.mqtt && window.mqtt.connect) {
        autoConnectMqtt();
      } else {
        return startAPIPolling(duration);
      }
    }

    state.isMonitoring = true;
    refs.sessionBuffer = [];
    refs.startTime = Date.now();
    startElapsed();
    onMonitoringChange();

    if (duration) {
      refs.timerId = setTimeout(() => stopMonitoring(true), duration * 1000);
    }
  }

  function startAPIPolling(duration) {
    setStatus('Connected (API mode)');
    state.isMonitoring = true;
    refs.sessionBuffer = [];
    refs.startTime = Date.now();
    startElapsed();
    onMonitoringChange();

    const intervalId = setInterval(async () => {
      try {
        const r = await fetch(window.APP_CONFIG.API_URL + '/api/test-data');
        const data = await r.json();
        if (data.gx !== undefined) {
          const t = Date.now();
          state.gsrData.push({ t, gsr: data.mag || 0 });
          if (state.gsrData.length > MAX_POINTS) state.gsrData.shift();
          state.deviceStatus = { on: data.deviceOn, motionExcess: data.motionExcess };
          const magnitude = Math.sqrt(data.gx*data.gx + data.gy*data.gy + data.gz*data.gz);
          refs.sessionBuffer.push(magnitude);
          updateLiveUI();
        }
      } catch (e) {
        console.error('polling error', e);
      }
    }, 100);

    refs.client = { interval: intervalId };

    if (duration) {
      refs.timerId = setTimeout(() => {
        stopMonitoring(true);
      }, duration * 1000);
    }
  }

  async function stopMonitoring(save) {
    // Hentikan API polling kalau sedang dipakai (fallback mode).
    // MQTT TIDAK diputus — biar terus stream data ke chart meski user tidak rekam.
    if (refs.client && refs.client.interval) {
      clearInterval(refs.client.interval);
      refs.client = null;
      setStatus('Disconnected');
    }
    state.isMonitoring = false;
    if (refs.timerId) clearTimeout(refs.timerId);
    refs.timerId = null;
    stopElapsed();
    onMonitoringChange();

    if (save && refs.sessionBuffer.length > 0) {
      await saveData();
    } else if (save) {
      window.showAlert('No data to save', 'warning');
    }
  }

  function handleQuickRecord(seconds) {
    if (state.isMonitoring) {
      window.showAlert('Already monitoring. Stop first.', 'warning');
      return;
    }
    startMonitoring(seconds);
  }

  // ---------- UI updates ----------
  function setStatus(text) {
    state.status = text;
    const pill = document.getElementById('livePill');
    const label = document.getElementById('liveLabel');
    if (!pill) return;
    const isConnected = text === 'Connected' || text.startsWith('Connected');
    pill.classList.toggle('connected', isConnected);
    label.textContent = isConnected ? 'LIVE' : text.toUpperCase();
    const sub = document.getElementById('bigEmptySub');
    if (sub) sub.textContent = isConnected ? 'Klik Start Monitoring untuk mulai merekam.' : 'Menyambung ke sensor…';
    const liveTag = document.getElementById('liveTag');
    if (liveTag) liveTag.style.display = isConnected ? '' : 'none';
  }

  function startElapsed() {
    stopElapsed();
    const chip = document.getElementById('elapsedChip');
    if (chip) chip.style.display = '';
    refs.elapsedInterval = setInterval(() => {
      if (refs.startTime > 0) {
        const sec = Math.floor((Date.now() - refs.startTime) / 1000);
        const min = Math.floor(sec / 60);
        const s = sec % 60;
        const t = document.getElementById('elapsedText');
        if (t) t.textContent = min + ':' + (s < 10 ? '0' + s : s);
      }
    }, 1000);
  }

  function stopElapsed() {
    if (refs.elapsedInterval) clearInterval(refs.elapsedInterval);
    refs.elapsedInterval = null;
    const chip = document.getElementById('elapsedChip');
    if (chip) chip.style.display = 'none';
  }

  function onMonitoringChange() {
    document.getElementById('startBtn').classList.toggle('hidden', state.isMonitoring);
    document.getElementById('stopBtn').classList.toggle('hidden', !state.isMonitoring);
    document.querySelectorAll('.quick').forEach((b) => { b.disabled = state.isMonitoring; });
  }

  function updateLiveUI() {
    const latestGsr = state.gsrData.length ? state.gsrData[state.gsrData.length - 1].gsr : 0;
    const latestBpm = state.pulseData.length ? state.pulseData[state.pulseData.length - 1].bpm : 0;
    const latestSpo2 = state.pulseData.length ? state.pulseData[state.pulseData.length - 1].spo2 : undefined;

    setText('statGsr', state.gsrData.length ? Math.round(latestGsr) : '—');
    setText('statBpm', state.pulseData.length ? Math.round(latestBpm) : '—');
    setText('statSpo2', latestSpo2 !== undefined && latestSpo2 > 0 ? Math.round(latestSpo2) : '—');
    setText('statIr', Number.isFinite(state.sensorIr) && state.sensorIr > 0 ? Math.round(state.sensorIr) : '—');
    setText('sampleCount', state.gsrData.length);

    const fingerTag = document.getElementById('fingerTag');
    if (fingerTag) {
      const ok = state.fingerDetected === 1;
      fingerTag.textContent = ok ? '✓ Finger detected' : 'Finger not detected';
      fingerTag.className = 'tag ' + (ok ? '' : 'dim');
    }

    updateStatusCards();

    // IR chart + sparkline
    if (state.irData.length > 0) {
      document.getElementById('irEmpty').classList.add('hidden');
      document.getElementById('irWrap').classList.remove('hidden');
      drawIrChart();
      drawSpark('irSparkMini', state.irData.map(d => d.ir), '#8b5cf6');
    }

    // Big chart
    if (state.gsrData.length > 0) {
      document.getElementById('bigEmpty').classList.add('hidden');
      document.getElementById('bigWrap').classList.remove('hidden');
      drawBigChart();
      drawSpark('gsrSpark', state.gsrData.map(d => d.gsr), '#3b82f6');
    }

    // BPM/SpO2 sparkline
    if (state.pulseData.length > 0) {
      drawSpark('bpmSpark', state.pulseData.map(d => d.bpm), '#ef4444');
      drawSpark('spo2Spark', state.pulseData.map(d => d.spo2 || 0), '#10b981');
    }
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function updateStatusCards() {
    setStatusCard('device', state.deviceStatus.on === 1);
    setStatusCard('motor', state.deviceStatus.on === 1);
    setStatusCard('motion', state.deviceStatus.motionExcess === 1);
    setStatusCard('finger', state.fingerDetected === 1);
  }

  function setStatusCard(key, active) {
    const el = document.getElementById('status-' + key);
    if (!el) return;
    const isAlert = el.dataset.alert === '1';
    el.classList.toggle('on', active && !isAlert);
    el.classList.toggle('alert', active && isAlert);
    const val = el.querySelector('.val');
    if (val) val.textContent = active ? 'Active' : 'Inactive';
  }

  // ---------- Charts ----------
  function getThemeColors() {
    const dark = document.documentElement.classList.contains('dark');
    return {
      grid: dark ? '#334155' : '#e2e8f0',
      text: dark ? '#94a3b8' : '#64748b',
      tooltipBg: dark ? '#1e293b' : '#f8fafc',
    };
  }

  // Mini sparkline charts in gauge cards
  const sparks = {};
  function drawSpark(id, values, color) {
    const canvas = document.getElementById(id);
    if (!canvas || !values || values.length === 0) return;
    if (!sparks[id]) {
      const ctx = canvas.getContext('2d');
      const grad = ctx.createLinearGradient(0, 0, 0, 32);
      grad.addColorStop(0, color + '50');
      grad.addColorStop(1, color + '00');
      sparks[id] = new Chart(ctx, {
        type: 'line',
        data: {
          labels: values.map((_, i) => i),
          datasets: [{
            data: values.slice(),
            borderColor: color,
            borderWidth: 1.5,
            backgroundColor: grad,
            fill: true,
            tension: 0,
            pointRadius: 0,
            spanGaps: true,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: { x: { display: false, type: 'linear' }, y: { display: false } },
          elements: { line: { borderJoinStyle: 'round' } },
        },
      });
    } else {
      const last30 = values.slice(-30);
      sparks[id].data.labels = last30.map((_, i) => i);
      sparks[id].data.datasets[0].data = last30;
      sparks[id].update('none');
    }
  }

  function drawIrChart() {
    const colors = getThemeColors();

    // Hilangkan DC offset dengan rolling mean (high-pass filter sederhana).
    // Komponen DC (~70.000 saat saturasi) di-remove, sisakan hanya pulsasi
    // (komponen AC) yang adalah denyut jantung.
    const raw = state.irData.map((d) => d.ir);
    let mean = 0;
    if (raw.length > 0) {
      // Rolling mean dari N sampel terakhir (window 1 detik @ 100 Hz)
      const win = Math.min(100, raw.length);
      let sum = 0;
      for (let i = raw.length - win; i < raw.length; i++) sum += raw[i];
      mean = sum / win;
    }
    const data = state.irData.map((d) => ({ x: d.t, y: d.ir - mean }));

    if (!irChart) {
      const ctx = document.getElementById('irChart').getContext('2d');
      const grad = ctx.createLinearGradient(0, 0, 0, 120);
      grad.addColorStop(0, 'rgba(99, 102, 241, 0.4)');
      grad.addColorStop(1, 'rgba(99, 102, 241, 0)');

      irChart = new Chart(ctx, {
        type: 'line',
        data: {
          datasets: [{
            label: 'IR',
            data,
            borderColor: '#6366f1',
            borderWidth: 1.5,
            backgroundColor: grad,
            fill: true,
            tension: 0.2,
            pointRadius: 0,
            spanGaps: false,
            cubicInterpolationMode: 'monotone',
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 80, easing: 'linear' },
          parsing: false,
          normalized: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: colors.tooltipBg,
              borderColor: colors.grid,
              borderWidth: 1,
              titleColor: colors.text,
              bodyColor: colors.text,
              callbacks: { label: (c) => Math.round(c.parsed.y).toString() },
            },
            decimation: { enabled: true, algorithm: 'min-max' },
          },
          scales: {
            x: { display: false, type: 'linear' },
            y: { ticks: { color: colors.text, font: { size: 10 } }, grid: { color: colors.grid }, border: { display: false } },
          },
        },
      });
    } else {
      irChart.data.datasets[0].data = data;
      irChart.update('none');
    }
  }

  function drawBigChart() {
    const colors = getThemeColors();
    const gsrData = state.gsrData.map((d) => ({ x: d.t, y: d.gsr }));
    const hasPulse = state.pulseData.length > 0;
    const bpmData = hasPulse
      ? state.gsrData.map((g) => {
          const closest = state.pulseData.reduce((p, c) => (Math.abs(c.t - g.t) < Math.abs(p.t - g.t) ? c : p));
          return { x: g.t, y: closest.bpm };
        })
      : [];

    if (!bigChart) {
      const ctx = document.getElementById('bigChart').getContext('2d');
      const gradGsr = ctx.createLinearGradient(0, 0, 0, 384);
      gradGsr.addColorStop(0, 'rgba(59, 130, 246, 0.4)');
      gradGsr.addColorStop(1, 'rgba(59, 130, 246, 0)');
      const gradBpm = ctx.createLinearGradient(0, 0, 0, 384);
      gradBpm.addColorStop(0, 'rgba(239, 68, 68, 0.4)');
      gradBpm.addColorStop(1, 'rgba(239, 68, 68, 0)');

      bigChart = new Chart(ctx, {
        type: 'line',
        data: {
          datasets: [
            {
              label: 'GSR Value',
              data: gsrData,
              borderColor: '#3b82f6',
              borderWidth: 2,
              backgroundColor: gradGsr,
              fill: true,
              tension: 0.25,
              pointRadius: 0,
              spanGaps: false,
              cubicInterpolationMode: 'monotone',
            },
            {
              label: 'Heart Rate (bpm)',
              data: bpmData,
              borderColor: '#ef4444',
              borderWidth: 2,
              backgroundColor: gradBpm,
              fill: true,
              tension: 0.25,
              pointRadius: 0,
              spanGaps: false,
              hidden: !hasPulse,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 80, easing: 'linear' },
          parsing: false,
          normalized: true,
          plugins: {
            legend: { position: 'bottom', labels: { color: colors.text, usePointStyle: true } },
            tooltip: {
              backgroundColor: colors.tooltipBg,
              borderColor: colors.grid,
              borderWidth: 1,
              titleColor: colors.text,
              bodyColor: colors.text,
              callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y.toFixed(2)}` },
            },
            decimation: { enabled: true, algorithm: 'min-max' },
          },
          scales: {
            x: { display: false, type: 'linear' },
            y: { ticks: { color: colors.text, font: { size: 12 } }, grid: { color: colors.grid }, border: { display: false } },
          },
        },
      });
    } else {
      bigChart.data.datasets[0].data = gsrData;
      bigChart.data.datasets[1].data = bpmData;
      bigChart.data.datasets[1].hidden = !hasPulse;
      bigChart.update('none');
    }
  }

  function updateChartTheme(chart) {
    const c = getThemeColors();
    chart.options.scales.y.ticks.color = c.text;
    chart.options.scales.y.grid.color = c.grid;
    if (chart.options.plugins.tooltip) {
      chart.options.plugins.tooltip.backgroundColor = c.tooltipBg;
      chart.options.plugins.tooltip.borderColor = c.grid;
      chart.options.plugins.tooltip.titleColor = c.text;
      chart.options.plugins.tooltip.bodyColor = c.text;
    }
    if (chart.options.plugins.legend && chart.options.plugins.legend.labels) {
      chart.options.plugins.legend.labels.color = c.text;
    }
    chart.update('none');
  }

  // ---------- History table ----------
  function renderHistory() {
    const tbody = document.getElementById('historyBody');
    if (!tbody) return;
    if (state.history.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty">No data yet</td></tr>';
      return;
    }

    const last10 = state.history.slice().reverse().slice(0, 10);
    tbody.innerHTML = last10.map((h) => `
      <tr>
        <td>${new Date(h.start_time).toLocaleDateString('id-ID', { month: 'short', day: 'numeric' })}</td>
        <td><span class="pill">${window.escapeHtml((h.sensor_type || '').toUpperCase())}</span></td>
        <td class="right">${Number(h.avg_value).toFixed(1)}</td>
        <td class="right">${Number(h.max_value).toFixed(1)}</td>
        <td class="center"><button class="del-btn" data-del="${h.id}" title="Delete">${ICON.trash}</button></td>
      </tr>
    `).join('');

    tbody.querySelectorAll('button[data-del]').forEach((btn) => {
      btn.addEventListener('click', () => handleDelete(parseInt(btn.dataset.del, 10)));
    });
  }

  // Cleanup on unload
  window.addEventListener('beforeunload', () => stopMonitoring(false));
})();

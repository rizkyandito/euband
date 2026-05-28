// ============================================================
//  EUBAND Dashboard — BLE client + filter + analisis stress
//
//  Sumber data: ESP32 firmware `bluetooth.ino` via Web Bluetooth
//  Service UUID Nordic UART, dump CSV setelah STOP.
//
//  3 level klasifikasi: Normal / Sedang / Tinggi
// ============================================================

// ===== UUIDs (HARUS sama dengan bluetooth.ino) =====
const SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const RX_UUID      = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // app → ESP (write)
const TX_UUID      = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // ESP → app (notify)

// ===== State =====
let device = null;
let rxChar = null;
let txChar = null;
let samples = [];      // {t, ppg, gsr}
let inDump  = false;
let lineBuf = '';
let sessionStartMs = 0;
let trendChart = null;
let lastResult = null;

// ===== Dump progress state =====
let dumpExpected   = 0;          // total sample yang ESP32 akan kirim (dari #BEGIN)
let dumpStartedAt  = 0;          // millis saat #BEGIN diterima
let dumpLastUiTick = 0;          // throttle update UI
let dumpRateEma    = 0;          // exponential moving average sample/s

// ===== DOM helpers =====
const $ = (id) => document.getElementById(id);
const log = (msg) => {
  const t = new Date().toLocaleTimeString();
  const box = $('logBox');
  if (box) {
    box.textContent += `[${t}] ${msg}\n`;
    box.scrollTop = box.scrollHeight;
  }
  console.log('[ble]', msg);
};

// ============================================================
// Signal processing (sama dengan web-bluetooth-test.html)
// ============================================================
function highpass(values, cutoffHz, fs) {
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / fs;
  const alpha = rc / (rc + dt);
  const out = new Array(values.length);
  let prevIn = values[0] || 0;
  let prevOut = 0;
  out[0] = 0;
  for (let i = 1; i < values.length; i++) {
    prevOut = alpha * (prevOut + values[i] - prevIn);
    prevIn = values[i];
    out[i] = prevOut;
  }
  return out;
}
function lowpass(values, cutoffHz, fs) {
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / fs;
  const alpha = dt / (rc + dt);
  const out = new Array(values.length);
  out[0] = values[0] || 0;
  for (let i = 1; i < values.length; i++) {
    out[i] = out[i - 1] + alpha * (values[i] - out[i - 1]);
  }
  return out;
}
function bandpass(values, lowHz, highHz, fs) {
  return lowpass(highpass(values, lowHz, fs), highHz, fs);
}

function findPeaks(values, minDistance, minHeight) {
  const peaks = [];
  for (let i = 1; i < values.length - 1; i++) {
    if (values[i] > values[i - 1] && values[i] >= values[i + 1] && values[i] > minHeight) {
      if (peaks.length === 0 || (i - peaks[peaks.length - 1]) >= minDistance) {
        peaks.push(i);
      }
    }
  }
  return peaks;
}

// ============================================================
// Grove GSR: ADC raw → konduktansi (µS)
//   Rumus resmi Seeed (10-bit ADC): R(Ω) = ((1024 + 2*adc) * 10000) / (512 - adc)
//   ESP32 pakai 12-bit (0..4095), jadi adc di-scale ke 10-bit dulu (/4).
//   µS = 1e6 / R(Ω).
// ============================================================
function adcToMicroSiemens(adc12) {
  const adc10 = adc12 / 4;
  const denom = 512 - adc10;
  if (denom <= 0) return 0;
  const R = ((1024 + 2 * adc10) * 10000) / denom;
  if (R <= 0) return 0;
  return 1e6 / R;
}

// Klasifikasi 3 level (parameter baseline):
//   Normal : GSR < 4 µS  & HR < 90
//   Sedang : GSR 4-6 µS  atau HR 90-100
//   Tinggi : GSR > 6 µS  atau HR > 100
// OR logic: ambil kategori paling TINGGI antar dua sinyal.
// Rasional: stress bisa muncul di salah satu sinyal duluan (mis. GSR naik
// karena keringat dingin walau denyut belum naik). Lebih sensitif & sesuai
// intuisi user yang lihat angka GSR tinggi tapi level masih Normal.
function categorize(gsrUs, bpm) {
  const catGsr =
    gsrUs > 6  ? 'Tinggi' :
    gsrUs >= 4 ? 'Sedang' :
                 'Normal';      // < 4 (termasuk < 2) → Normal
  const catBpm =
    bpm > 100  ? 'Tinggi' :
    bpm >= 90  ? 'Sedang' :
                 'Normal';      // < 90 → Normal
  const rank = { 'Normal': 0, 'Sedang': 1, 'Tinggi': 2 };
  // OR: ambil yang paling tinggi
  const level = rank[catGsr] >= rank[catBpm] ? catGsr : catBpm;
  return { catGsr, catBpm, level };
}

function analyzeStress(samples, ppgFilt, gsrFilt, fs) {
  if (samples.length < fs * 5) {
    return { bpm: 0, hrv: 0, gsrMean: 0, gsrUs: 0,
             catGsr: '—', catBpm: '—', level: 'Normal', valid: false };
  }
  // BPM + HRV dengan outlier rejection (RR yang jauh dari median diabaikan)
  let sum = 0, sumSq = 0;
  for (const v of ppgFilt) { sum += v; sumSq += v * v; }
  const mean = sum / ppgFilt.length;
  const variance = (sumSq / ppgFilt.length) - mean * mean;
  const std = Math.sqrt(Math.max(0, variance));
  const minHeight = mean + std * 0.4;
  const peaks = findPeaks(ppgFilt, fs * 0.5, minHeight);

  let bpm = 0, hrv = 0;
  if (peaks.length >= 4) {
    const rrs = [];
    for (let i = 1; i < peaks.length; i++) {
      const rr = (peaks[i] - peaks[i - 1]) * 1000 / fs;
      if (rr > 350 && rr < 1500) rrs.push(rr);
    }
    if (rrs.length >= 3) {
      const sorted = [...rrs].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const clean = rrs.filter(r => Math.abs(r - median) / median < 0.3);
      if (clean.length >= 2) {
        const meanRr = clean.reduce((a, b) => a + b, 0) / clean.length;
        bpm = 60000 / meanRr;
        const v = clean.reduce((a, r) => a + (r - meanRr) ** 2, 0) / clean.length;
        hrv = Math.sqrt(v);
      }
    }
  }

  // GSR — mean dari sinyal yang sudah di-lowpass, lalu konversi ADC → µS
  const gsrMean = gsrFilt.reduce((a, b) => a + b, 0) / gsrFilt.length;
  const gsrUs = adcToMicroSiemens(gsrMean);

  // Klasifikasi. Kalau BPM tidak terdeteksi, pakai GSR saja.
  let catRes;
  if (bpm > 0) {
    catRes = categorize(gsrUs, bpm);
  } else {
    const gsrOnly = categorize(gsrUs, 75); // HR netral
    catRes = { catGsr: gsrOnly.catGsr, catBpm: '—', level: gsrOnly.catGsr };
  }

  return {
    bpm, hrv, gsrMean, gsrUs,
    catGsr: catRes.catGsr,
    catBpm: catRes.catBpm,
    level: catRes.level,
    valid: true,
  };
}

// ============================================================
// BLE — Scan, connect, command, parse dump
// ============================================================
$('btnConnect').addEventListener('click', async () => {
  if (device && device.gatt.connected) {
    device.gatt.disconnect();
    return;
  }
  try {
    if (!navigator.bluetooth) {
      alert('Web Bluetooth tidak tersedia. Pakai Chrome/Edge di Mac/Android.');
      return;
    }
    setConnStatus('Memindai…', false);
    log('Requesting device…');
    device = await navigator.bluetooth.requestDevice({
      filters: [
        { services: [SERVICE_UUID] },
        { namePrefix: 'Euband' },
      ],
      optionalServices: [SERVICE_UUID],
    });
    log(`Found: ${device.name || '(no name)'}`);
    device.addEventListener('gattserverdisconnected', onDisconnect);

    setConnStatus('Menyambung…', false);
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);
    rxChar = await service.getCharacteristic(RX_UUID);
    txChar = await service.getCharacteristic(TX_UUID);
    await txChar.startNotifications();
    txChar.addEventListener('characteristicvaluechanged', onNotify);

    setConnStatus('Perangkat Terhubung', true);
    $('btnStart').disabled = false;
    $('btnStop').disabled = true;
    $('btnStatus').disabled = false;
    $('hintText').textContent = 'Siap merekam — tekan Mulai Rekam';
    log('✓ Connected & ready');

    // Auto-cek status alat: kalau lagi RECORDING (tombol fisik sudah dipencet),
    // dashboard akan adjust UI lewat handleLine pas firmware reply #STATUS
    setTimeout(() => sendCmd('STATUS'), 300);
  } catch (e) {
    log('ERR: ' + e.message);
    setConnStatus('Hubungkan Perangkat', false);
  }
});

function onDisconnect() {
  log('Device disconnected');
  setConnStatus('Hubungkan Perangkat', false);
  $('btnStart').disabled = true;
  $('btnStop').disabled = true;
  $('btnStatus').disabled = true;
  $('hintText').textContent = 'Hubungkan perangkat dulu untuk mulai merekam';
  rxChar = null;
  txChar = null;
  // Kalau disconnect saat dump → batalin modal supaya tidak nyangkut
  if (inDump) {
    inDump = false;
    hideDumpModal();
  }
}

function setConnStatus(text, connected) {
  $('connText').textContent = text;
  const pill = $('btnConnect');
  pill.classList.toggle('disconnected', !connected);
}

async function sendCmd(cmd) {
  if (!rxChar) return;
  await rxChar.writeValue(new TextEncoder().encode(cmd + '\n'));
  log('→ ' + cmd);
}

$('btnStart').addEventListener('click', () => {
  sendCmd('START');
  // UI update menunggu firmware reply #START (di handleLine)
});

$('btnStop').addEventListener('click', () => {
  // Kalau label tombol jadi "Ambil Data" → kirim DUMP (data sudah ter-rekam di alat)
  const isPullMode = $('btnStop').textContent.includes('Ambil');
  if (isPullMode) {
    $('btnStop').disabled = true;
    $('hintText').textContent = 'Mengambil data tersimpan…';
    sendCmd('DUMP');
  } else {
    $('btnStop').disabled = true;
    $('hintText').textContent = 'Menerima data dari perangkat…';
    sendCmd('STOP');
  }
});
$('btnStatus').addEventListener('click', () => sendCmd('STATUS'));

// ============================================================
// Dump progress modal — controlled dari handleLine() saat parse
//   #BEGIN <session> <duration_ms> <sample_count>
//   <sample rows...>
//   #END
// ============================================================
function showDumpModal(expected) {
  dumpExpected   = expected || 0;
  dumpStartedAt  = Date.now();
  dumpLastUiTick = 0;
  dumpRateEma    = 0;
  $('dumpOverlay').classList.add('active');
  $('dumpOverlay').setAttribute('aria-hidden', 'false');
  $('dumpPct').textContent    = '0%';
  $('dumpBarFill').style.width = '0%';
  $('dumpCount').textContent  = '0';
  $('dumpTotal').textContent  = expected > 0 ? expected.toLocaleString('id-ID') : '?';
  $('dumpEta').textContent    = '—';
  $('dumpRate').textContent   = '—';
  $('dumpStatus').textContent = 'Menunggu data pertama…';
}

function updateDumpProgress(received) {
  // Throttle UI update ke ~10 Hz biar tidak burn CPU
  const now = Date.now();
  if (now - dumpLastUiTick < 100 && received < dumpExpected) return;
  dumpLastUiTick = now;

  const elapsed = (now - dumpStartedAt) / 1000;   // detik
  const rate = elapsed > 0 ? received / elapsed : 0;
  // EMA biar rate display tidak jumpy
  dumpRateEma = dumpRateEma === 0 ? rate : (0.7 * dumpRateEma + 0.3 * rate);

  let pct;
  let etaStr;
  if (dumpExpected > 0) {
    pct = Math.min(100, Math.round((received / dumpExpected) * 100));
    const remaining = Math.max(0, dumpExpected - received);
    const eta = dumpRateEma > 0 ? remaining / dumpRateEma : 0;
    etaStr = eta > 0 ? `~${Math.ceil(eta)}s` : '—';
  } else {
    pct = 0;
    etaStr = '—';
  }

  $('dumpPct').textContent     = pct + '%';
  $('dumpBarFill').style.width = pct + '%';
  $('dumpCount').textContent   = received.toLocaleString('id-ID');
  $('dumpEta').textContent     = etaStr;
  $('dumpRate').textContent    = Math.round(dumpRateEma).toLocaleString('id-ID');
  $('dumpStatus').textContent  = 'Mengirim sample…';
}

function setDumpAnalyzing() {
  $('dumpBarFill').style.width = '100%';
  $('dumpPct').textContent     = '100%';
  $('dumpEta').textContent     = '0s';
  $('dumpStatus').textContent  = 'Menganalisis hasil…';
}

function hideDumpModal() {
  $('dumpOverlay').classList.remove('active');
  $('dumpOverlay').setAttribute('aria-hidden', 'true');
}

// ===== Notify =====
function onNotify(ev) {
  const chunk = new TextDecoder().decode(ev.target.value);
  lineBuf += chunk;
  const lines = lineBuf.split('\n');
  lineBuf = lines.pop();
  for (const line of lines) handleLine(line.trim());
}

// Parse "key=value" pairs dari line firmware → object
function parseKv(line) {
  const out = {};
  for (const part of line.split(/\s+/)) {
    const eq = part.indexOf('=');
    if (eq > 0) out[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return out;
}

function handleLine(line) {
  if (!line) return;

  // ─── Recording started (bisa via BLE atau tombol fisik) ─────────
  if (line.startsWith('#START')) {
    log('← ' + line);
    const kv = parseKv(line);
    const source = kv.source || 'BLE';
    // Update UI sesuai state RECORDING
    samples = []; inDump = false; sessionStartMs = Date.now();
    $('btnStart').disabled = true;
    $('btnStop').disabled = false;
    $('btnExportCsv').disabled = true;
    $('btnExportPng').disabled = true;
    $('btnExportReport').disabled = true;
    if (source === 'BTN') {
      $('hintText').textContent = 'Merekam… (dipicu dari tombol alat). Tekan tombol lagi atau klik Stop di sini untuk berhenti.';
    } else {
      $('hintText').textContent = 'Merekam… Pegang sensor & rileks. Klik Stop untuk analisis.';
    }
    return;
  }

  // ─── Recording stopped ─────────
  if (line.startsWith('#STOP')) {
    log('← ' + line);
    const kv = parseKv(line);
    const source = kv.source || 'BLE';
    $('btnStop').disabled = true;
    if (source === 'BTN') {
      $('hintText').textContent = 'Berhenti rekam (dari tombol). Menunggu dump data…';
    } else {
      $('hintText').textContent = 'Menerima data dari perangkat…';
    }
    return;
  }

  // ─── #STATUS: cek apakah alat sedang RECORDING / ada data tersimpan ──
  if (line.startsWith('#STATUS')) {
    log('← ' + line);
    const kv = parseKv(line);
    if (kv.state === 'RECORDING') {
      $('btnStart').disabled = true;
      $('btnStop').disabled = false;
      $('btnStop').textContent = '■ Stop & Analisis';
      $('hintText').textContent = 'Alat sudah merekam (mode tombol). Klik Stop untuk berhenti & analisis.';
    } else if (kv.state === 'IDLE' && parseInt(kv.samples) > 0) {
      // Ada data lama tersimpan
      $('btnStop').disabled = false;
      $('btnStop').textContent = '⬇ Ambil Data';
      $('hintText').textContent = `Data tersimpan di alat (${kv.samples} sample). Klik "Ambil Data" untuk download.`;
    }
    return;
  }

  // ─── Data stored tapi belum dump (mis. rekam via tombol tanpa BLE) ──
  if (line.startsWith('#INFO')) {
    log('← ' + line);
    // Kalau ada hint "ready to dump", tawarkan tombol DUMP otomatis
    if (line.includes('ready to dump')) {
      $('hintText').textContent = 'Data tersimpan di alat. Klik Status / atau DUMP untuk ambil data.';
      // Kasih tombol Stop alias DUMP biar user bisa pull data
      $('btnStop').disabled = false;
      $('btnStop').textContent = '⬇ Ambil Data';
    }
    return;
  }

  // ─── Dump CSV ─────────
  if (line.startsWith('#BEGIN')) {
    inDump = true; samples = [];
    log('← ' + line);
    // Format: #BEGIN <session> <duration_ms> <sample_count>
    const parts = line.split(/\s+/);
    const expectedCount = parts.length >= 4 ? parseInt(parts[3]) : 0;
    showDumpModal(expectedCount);
    return;
  }
  if (line.startsWith('#END')) {
    inDump = false;
    log(`← #END — total ${samples.length} sample`);
    setDumpAnalyzing();
    // Beri browser jeda 1 frame supaya UI "100% Menganalisis…" sempat repaint
    // sebelum analyzeAndRender() blocking thread.
    setTimeout(() => {
      analyzeAndRender();
      hideDumpModal();
      $('btnStart').disabled = false;
      $('btnStop').disabled = true;
      $('btnStop').textContent = '■ Stop & Analisis';
      $('btnExportCsv').disabled = false;
      $('btnExportPng').disabled = false;
      $('btnExportReport').disabled = false;
      $('hintText').textContent = 'Analisis selesai. Bisa rekam ulang atau export data.';
    }, 50);
    return;
  }
  if (line.startsWith('#')) {
    log('← ' + line);
    return;
  }
  if (line.startsWith('t_ms')) return;
  if (!inDump) return;

  const cols = line.split(',');
  if (cols.length < 3) return;
  const t   = parseInt(cols[0]);
  const ppg = parseInt(cols[1]);
  const gsr = parseInt(cols[2]);
  if (isNaN(t) || isNaN(ppg) || isNaN(gsr)) return;
  samples.push({ t, ppg, gsr });
  updateDumpProgress(samples.length);
}

// ============================================================
// Render hasil ke UI
// ============================================================
function analyzeAndRender() {
  if (samples.length < 50) {
    $('hintText').textContent = 'Data terlalu sedikit untuk analisis. Coba rekam lebih lama.';
    return;
  }
  const fs = samples.length > 1
    ? Math.round(1000 / ((samples[samples.length - 1].t - samples[0].t) / (samples.length - 1)))
    : 100;

  const ppgRaw = samples.map(s => s.ppg);
  const gsrRaw = samples.map(s => s.gsr);
  const ppgFilt = bandpass(ppgRaw, 0.5, 3, fs);
  const gsrFilt = lowpass(gsrRaw, 0.5, fs);

  const result = analyzeStress(samples, ppgFilt, gsrFilt, fs);
  lastResult = result;

  // Update cards
  const levelLower = result.level.toLowerCase();    // normal/sedang/tinggi
  $('statLevel').textContent = result.level;
  $('cardStress').classList.remove('normal', 'sedang', 'tinggi');
  $('cardStress').classList.add(levelLower);
  $('statBpm').textContent = result.bpm > 0 ? result.bpm.toFixed(0) : '—';
  $('statGsr').textContent = result.gsrUs > 0 ? result.gsrUs.toFixed(2) : '—';

  // Update level pills (highlight active)
  ['pillNormal', 'pillSedang', 'pillTinggi'].forEach((id) => {
    $(id).classList.toggle('active', $(id).textContent.toLowerCase() === levelLower);
  });

  // Alert banner
  const ab = $('alertBanner');
  ab.style.display = '';
  ab.classList.remove('normal', 'sedang');
  ab.classList.add(levelLower === 'tinggi' ? '' : levelLower);
  if (levelLower !== 'tinggi') ab.classList.add(levelLower);
  $('alertIcon').textContent = result.level[0];
  $('alertLevel').textContent = result.level;
  $('alertText').textContent =
    levelLower === 'normal'  ? 'Kondisi fisiologis baik. Pertahankan dengan istirahat cukup.' :
    levelLower === 'sedang'  ? 'Stres sedang terdeteksi. Coba teknik pernapasan atau istirahat singkat.' :
                               'Stres tinggi terdeteksi. Segera istirahat dan pertimbangkan konsultasi ke konselor.';

  // Render chart
  drawTrendChart(samples, ppgFilt, gsrFilt);

  // Simpan hasil ke Supabase (anonymous, kalau client tersedia)
  saveSessionToSupabase(samples, result, fs).catch(err => {
    log('⚠ Gagal simpan ke cloud: ' + err.message);
  });
}

// Simpan hasil analisis sesi ke Supabase. Silent kalau Supabase belum
// dikonfigurasi (mode lokal-only).
async function saveSessionToSupabase(samples, result, fs) {
  if (!window.sessionsApi) return;
  const duration = samples.length > 0
    ? (samples[samples.length - 1].t - samples[0].t) / 1000
    : 0;
  const row = {
    device_session: null,        // ESP32 session ID — bisa diambil dari header #START kalau perlu
    duration_sec:   Number(duration.toFixed(1)),
    sample_count:   samples.length,
    sample_rate_hz: fs,
    bpm:            result.bpm > 0 ? Number(result.bpm.toFixed(1)) : null,
    hrv_sdnn_ms:    result.hrv > 0 ? Number(result.hrv.toFixed(1)) : null,
    gsr_mean_adc:   result.gsrMean ? Math.round(result.gsrMean) : null,
    gsr_us:         result.gsrUs > 0 ? Number(result.gsrUs.toFixed(3)) : null,
    category_gsr:   result.catGsr || '—',
    category_bpm:   result.catBpm || '—',
    level:          result.level,
  };
  const saved = await window.sessionsApi.create(row);
  log(`✓ Sesi tersimpan ke cloud (id=${saved.id.slice(0, 8)}...)`);
}

// ============================================================
// Chart.js — line chart 2 axis: BPM + GSR
//
// BPM dihitung dengan strategi STABIL:
//   1. Sliding window 15 detik untuk dapat banyak RR interval
//   2. RR interval di-filter outlier (reject perubahan >20% dari median)
//   3. Smoothing eksponensial antar window (alpha 0.3)
//   4. Reject window dengan <4 peak (tidak cukup data untuk reliable)
// ============================================================
function drawTrendChart(samples, ppgFilt, gsrFilt) {
  if (samples.length < 100) return;

  // Estimasi fs sebenarnya dari timestamp (bukan hardcoded 100!)
  const totalMs = samples[samples.length - 1].t - samples[0].t;
  const fs = Math.round(1000 * (samples.length - 1) / totalMs);

  // Target ~80 titik di chart
  const target = 80;
  const step = Math.max(1, Math.floor(samples.length / target));

  // Sliding window 15 detik (lebih panjang = lebih stabil)
  const windowSize = Math.min(samples.length, fs * 15);

  const labels = [];
  const bpmData = [];
  const gsrData = [];
  let lastBpm = 0;            // untuk smoothing
  const SMOOTH = 0.3;         // 0 = no smooth, 1 = no update

  // Pre-compute MAD-based threshold per signal (lebih robust dari std)
  function bpmFromWindow(wPpg) {
    if (wPpg.length < fs * 3) return 0;
    let sum = 0, sumSq = 0;
    for (const v of wPpg) { sum += v; sumSq += v * v; }
    const m = sum / wPpg.length;
    const std = Math.sqrt(Math.max(0, sumSq / wPpg.length - m * m));
    const peaks = findPeaks(wPpg, fs * 0.5, m + std * 0.4);  // min 0.5s antar peak (max 120 bpm)
    if (peaks.length < 4) return 0;  // tidak cukup data

    // Hitung RR intervals
    const rrs = [];
    for (let i = 1; i < peaks.length; i++) {
      const rr = (peaks[i] - peaks[i - 1]) * 1000 / fs;
      if (rr > 350 && rr < 1500) rrs.push(rr);  // sanity 40-170 bpm
    }
    if (rrs.length < 3) return 0;

    // Reject outlier RR: ambil median, buang yang >30% beda
    const sorted = [...rrs].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const clean = rrs.filter(r => Math.abs(r - median) / median < 0.3);
    if (clean.length < 2) return 0;

    const meanRr = clean.reduce((a, b) => a + b, 0) / clean.length;
    return 60000 / meanRr;
  }

  for (let i = 0; i < samples.length; i += step) {
    const tSec = ((samples[i].t - samples[0].t) / 1000).toFixed(0);
    labels.push(tSec + 's');

    const wStart = Math.max(0, i - Math.floor(windowSize / 2));
    const wEnd   = Math.min(samples.length, i + Math.floor(windowSize / 2));
    const wPpg   = ppgFilt.slice(wStart, wEnd);
    const bpm = bpmFromWindow(wPpg);

    // Smoothing eksponensial — kalau valid, EMA dengan lastBpm
    let displayBpm = null;
    if (bpm > 0) {
      if (lastBpm === 0) displayBpm = bpm;
      else               displayBpm = (1 - SMOOTH) * lastBpm + SMOOTH * bpm;
      lastBpm = displayBpm;
    } else if (lastBpm > 0) {
      // Tidak ada peak terdeteksi → carry forward last value (lebih realistis)
      displayBpm = lastBpm;
    }
    bpmData.push(displayBpm);

    // GSR mean window → konversi real ke μS (Grove formula)
    const wGsr = gsrFilt.slice(wStart, wEnd);
    const gMean = wGsr.length ? wGsr.reduce((a, b) => a + b, 0) / wGsr.length : 0;
    gsrData.push(adcToMicroSiemens(gMean));
  }

  const ctx = $('trendChart').getContext('2d');
  if (trendChart) trendChart.destroy();
  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'BPM',
          data: bpmData,
          borderColor: '#0f766e',
          backgroundColor: 'transparent',
          borderWidth: 2,
          tension: 0.3,
          pointRadius: 3,
          pointBackgroundColor: '#0f766e',
          yAxisID: 'yBpm',
          spanGaps: true,
        },
        {
          label: 'GSR (μS)',
          data: gsrData,
          borderColor: '#f59e0b',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [5, 4],
          tension: 0.3,
          pointRadius: 0,
          yAxisID: 'yGsr',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: '#111827', padding: 10, cornerRadius: 6 },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#6b7280', font: { size: 11 } } },
        yBpm: {
          position: 'left',
          grid: { color: '#f3f4f6' },
          ticks: { color: '#6b7280', font: { size: 11 } },
          title: { display: false },
        },
        yGsr: {
          position: 'right',
          grid: { display: false },
          ticks: { color: '#6b7280', font: { size: 11 } },
        },
      },
    },
  });
}

// ============================================================
// EXPORT — CSV, PNG, JSON Report
// ============================================================

// Helper: trigger browser download dari blob
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Generate timestamp untuk nama file: 2026-05-20_14-30-15
function timestampTag() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_` +
         `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

// Export raw + filtered samples → CSV
$('btnExportCsv').addEventListener('click', () => {
  if (samples.length === 0) {
    alert('Belum ada data. Rekam dulu sebelum export.');
    return;
  }
  // Re-compute filtered values supaya CSV self-contained
  const fs = samples.length > 1
    ? Math.round(1000 * (samples.length - 1) /
                 (samples[samples.length - 1].t - samples[0].t))
    : 100;
  const ppgRaw = samples.map(s => s.ppg);
  const gsrRaw = samples.map(s => s.gsr);
  const ppgFilt = bandpass(ppgRaw, 0.5, 3, fs);
  const gsrFilt = lowpass(gsrRaw, 0.5, fs);

  // Header dengan metadata
  let csv = '';
  csv += `# Euband Stress Monitor — Export\n`;
  csv += `# Timestamp: ${new Date().toISOString()}\n`;
  csv += `# Sample count: ${samples.length}\n`;
  csv += `# Sample rate (estimated): ${fs} Hz\n`;
  csv += `# Duration: ${((samples[samples.length-1].t - samples[0].t) / 1000).toFixed(1)} s\n`;
  if (lastResult && lastResult.valid) {
    csv += `# Stress level: ${lastResult.level}\n`;
    csv += `# Kategori GSR: ${lastResult.catGsr}  Kategori HR: ${lastResult.catBpm}\n`;
    csv += `# BPM: ${lastResult.bpm.toFixed(1)}\n`;
    csv += `# HRV (SDNN, info only): ${lastResult.hrv.toFixed(1)} ms\n`;
    csv += `# GSR mean (ADC raw): ${lastResult.gsrMean.toFixed(1)}\n`;
    csv += `# GSR (µS): ${lastResult.gsrUs.toFixed(3)}\n`;
  }
  csv += `#\n`;
  csv += `t_ms,ppg_raw,ppg_filtered,gsr_raw,gsr_filtered\n`;

  // Data rows
  for (let i = 0; i < samples.length; i++) {
    csv += `${samples[i].t},${ppgRaw[i]},${ppgFilt[i].toFixed(2)},` +
           `${gsrRaw[i]},${gsrFilt[i].toFixed(2)}\n`;
  }

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, `euband_data_${timestampTag()}.csv`);
  log(`✓ CSV exported (${samples.length} rows)`);
});

// Export chart sebagai PNG
$('btnExportPng').addEventListener('click', () => {
  if (!trendChart) {
    alert('Belum ada grafik. Rekam dulu sebelum export.');
    return;
  }
  // Chart.js punya method bawaan toBase64Image()
  const dataUrl = trendChart.toBase64Image('image/png', 1.0);
  // Convert dataURL → blob untuk konsistensi
  fetch(dataUrl)
    .then(r => r.blob())
    .then(blob => {
      downloadBlob(blob, `euband_chart_${timestampTag()}.png`);
      log('✓ PNG chart exported');
    });
});

// Export ringkasan analisis sebagai JSON Report
$('btnExportReport').addEventListener('click', () => {
  if (!lastResult || !lastResult.valid) {
    alert('Belum ada hasil analisis. Rekam dulu sebelum export.');
    return;
  }
  const fs = samples.length > 1
    ? Math.round(1000 * (samples.length - 1) /
                 (samples[samples.length - 1].t - samples[0].t))
    : 100;
  const duration = samples.length > 0
    ? (samples[samples.length - 1].t - samples[0].t) / 1000
    : 0;

  const report = {
    device: 'Euband01',
    exported_at: new Date().toISOString(),
    session: {
      start_iso: new Date(Date.now() - duration * 1000).toISOString(),
      duration_sec: Number(duration.toFixed(1)),
      sample_rate_hz: fs,
      sample_count: samples.length,
    },
    physiology: {
      bpm: Number(lastResult.bpm.toFixed(1)),
      hrv_sdnn_ms: Number(lastResult.hrv.toFixed(1)),
      gsr_mean_raw_adc: Number(lastResult.gsrMean.toFixed(1)),
      gsr_microsiemens: Number(lastResult.gsrUs.toFixed(3)),
    },
    stress: {
      level: lastResult.level,
      category_from_gsr: lastResult.catGsr,
      category_from_bpm: lastResult.catBpm,
      logic: 'OR (level = paling tinggi antar GSR & BPM)',
      thresholds: {
        gsr_us: { Normal: '2-4', Sedang: '4-6', Tinggi: '>6' },
        bpm:    { Normal: '70-90', Sedang: '90-100', Tinggi: '>100' },
      },
    },
    notes: 'PPG analog di pergelangan tangan rentan motion artifact. GSR adalah indikator utama stress.',
  };

  const blob = new Blob([JSON.stringify(report, null, 2)],
                       { type: 'application/json' });
  downloadBlob(blob, `euband_report_${timestampTag()}.json`);
  log('✓ Report JSON exported');
});

// ============================================================
// Misc UI
// ============================================================
// Clock
function updateClock() {
  const elapsed = sessionStartMs ? Math.floor((Date.now() - sessionStartMs) / 1000) : 0;
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  if (sessionStartMs) {
    $('statDur').textContent = `${h}j ${m}m`;
  }
  const now = new Date();
  $('clock').textContent = now.toTimeString().slice(0, 8);
}
setInterval(updateClock, 1000);
updateClock();

// Toggle debug log dengan Ctrl+L
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) {
    const dl = $('debugLog');
    dl.style.display = dl.style.display === 'none' ? '' : 'none';
    e.preventDefault();
  }
});

// Sidebar nav
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const page = item.dataset.page;
    if (page === 'dashboard') return;          // already here
    if (page === 'riwayat') {
      window.location.href = './analysis.html';
      return;
    }
    if (page === 'konseling') {
      window.open('https://studentaffairs.telkomuniversity.ac.id/konseling/', '_blank', 'noopener');
      return;
    }
    // Halaman lain belum diimplementasi
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    log(`Halaman "${item.textContent.trim()}" belum tersedia.`);
  });
});

// Initial state
setConnStatus('Hubungkan Perangkat', false);

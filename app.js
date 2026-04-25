const state = {
  rawRows: [],
  platformFilter: 'all',
  period: 'day',
};

const ui = {
  status: document.getElementById('status'),
  tableBody: document.getElementById('tableBody'),
  canvas: document.getElementById('chart'),
  apiBase: document.getElementById('apiBase'),
  metaAdId: document.getElementById('metaAdId'),
  appleAdId: document.getElementById('appleAdId'),
};

function formatCurrency(value) {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(value);
}

function dateKey(dateText, period) {
  const d = new Date(dateText);
  if (period === 'day') return d.toISOString().slice(0, 10);
  if (period === 'week') {
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const day = Math.floor((d - jan1) / (24 * 60 * 60 * 1000));
    const week = Math.ceil((day + jan1.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function aggregateRows(rows, period) {
  const map = new Map();

  for (const row of rows) {
    const key = `${dateKey(row.date, period)}|${row.platform}|${row.adId}`;
    const prev = map.get(key) || {
      bucket: dateKey(row.date, period),
      platform: row.platform,
      adId: row.adId,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      spend: 0,
    };

    prev.impressions += row.impressions;
    prev.clicks += row.clicks;
    prev.conversions += row.conversions;
    prev.spend += row.spend;

    map.set(key, prev);
  }

  return [...map.values()].sort((a, b) => a.bucket.localeCompare(b.bucket));
}

function getFilteredRows() {
  const rows = state.rawRows.filter((row) => state.platformFilter === 'all' || row.platform === state.platformFilter);
  return aggregateRows(rows, state.period);
}

function renderTable() {
  const rows = getFilteredRows();
  ui.tableBody.innerHTML = '';

  for (const row of rows) {
    const tr = document.createElement('tr');
    const ctr = row.impressions ? (row.clicks / row.impressions) * 100 : 0;
    tr.innerHTML = `
      <td>${row.bucket}</td>
      <td>${row.platform.toUpperCase()}</td>
      <td>${row.adId}</td>
      <td>${row.impressions.toLocaleString()}</td>
      <td>${row.clicks.toLocaleString()}</td>
      <td>${row.conversions.toLocaleString()}</td>
      <td>${formatCurrency(row.spend)}</td>
      <td>${ctr.toFixed(2)}%</td>
    `;
    ui.tableBody.appendChild(tr);
  }
}

function renderChart() {
  const rows = getFilteredRows();
  const buckets = [...new Set(rows.map((r) => r.bucket))];
  const totals = buckets.map((bucket) => rows.filter((r) => r.bucket === bucket).reduce((sum, r) => sum + r.impressions, 0));

  const ctx = ui.canvas.getContext('2d');
  const { width, height } = ui.canvas;
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  if (!totals.length) {
    ctx.fillStyle = '#61708e';
    ctx.font = '16px sans-serif';
    ctx.fillText('표시할 데이터가 없습니다.', 20, 40);
    return;
  }

  const max = Math.max(...totals) * 1.1;
  const plotX = 50;
  const plotY = 25;
  const plotW = width - 80;
  const plotH = height - 80;

  ctx.strokeStyle = '#cdd8f2';
  ctx.beginPath();
  ctx.moveTo(plotX, plotY);
  ctx.lineTo(plotX, plotY + plotH);
  ctx.lineTo(plotX + plotW, plotY + plotH);
  ctx.stroke();

  ctx.strokeStyle = '#3355ff';
  ctx.lineWidth = 2;
  ctx.beginPath();

  totals.forEach((value, i) => {
    const x = plotX + (i / Math.max(totals.length - 1, 1)) * plotW;
    const y = plotY + plotH - (value / max) * plotH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);

    ctx.fillStyle = '#3355ff';
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#61708e';
    ctx.font = '11px sans-serif';
    ctx.fillText(buckets[i], x - 20, plotY + plotH + 18);
  });

  ctx.stroke();
}

function render() {
  renderTable();
  renderChart();
}

function normalizeRows(platform, adId, rows) {
  return rows.map((r) => ({
    date: r.date,
    platform,
    adId,
    impressions: Number(r.impressions || 0),
    clicks: Number(r.clicks || 0),
    conversions: Number(r.conversions || 0),
    spend: Number(r.spend || 0),
  }));
}

async function fetchPlatformData(apiBase, platform, adId) {
  if (!adId) return [];

  const path = platform === 'meta' ? '/api/meta-ads' : '/api/apple-ads';
  const url = `${apiBase}${path}?adId=${encodeURIComponent(adId)}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`${platform.toUpperCase()} API 오류: ${res.status}`);
  }

  const payload = await res.json();
  return normalizeRows(platform, adId, payload.data || []);
}

async function loadLiveData() {
  const apiBase = ui.apiBase.value.trim();
  const metaAdId = ui.metaAdId.value.trim();
  const appleAdId = ui.appleAdId.value.trim();

  if (!apiBase || (!metaAdId && !appleAdId)) {
    ui.status.textContent = 'API Base URL과 최소 1개 광고 ID를 입력해 주세요.';
    return;
  }

  ui.status.textContent = '데이터를 불러오는 중...';

  try {
    const [metaRows, appleRows] = await Promise.all([
      fetchPlatformData(apiBase, 'meta', metaAdId),
      fetchPlatformData(apiBase, 'apple', appleAdId),
    ]);

    state.rawRows = [...metaRows, ...appleRows];
    ui.status.textContent = `로딩 완료: ${state.rawRows.length}건`;
    render();
  } catch (error) {
    ui.status.textContent = `오류: ${error.message}`;
  }
}

function loadMockData() {
  const mock = [
    { date: '2026-04-01', platform: 'meta', adId: 'M-100', impressions: 12000, clicks: 580, conversions: 33, spend: 320000 },
    { date: '2026-04-02', platform: 'meta', adId: 'M-100', impressions: 16000, clicks: 700, conversions: 44, spend: 400000 },
    { date: '2026-04-03', platform: 'meta', adId: 'M-100', impressions: 11000, clicks: 500, conversions: 29, spend: 300000 },
    { date: '2026-04-01', platform: 'apple', adId: 'A-200', impressions: 9000, clicks: 420, conversions: 26, spend: 290000 },
    { date: '2026-04-02', platform: 'apple', adId: 'A-200', impressions: 9800, clicks: 430, conversions: 30, spend: 310000 },
    { date: '2026-04-03', platform: 'apple', adId: 'A-200', impressions: 13000, clicks: 510, conversions: 35, spend: 345000 },
  ];

  state.rawRows = mock;
  ui.status.textContent = `샘플 데이터 로딩 완료: ${state.rawRows.length}건`;
  render();
}

for (const btn of document.querySelectorAll('.nav-btn')) {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.platformFilter = btn.dataset.filter;
    render();
  });
}

for (const btn of document.querySelectorAll('.period-btn')) {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.period-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.period = btn.dataset.period;
    render();
  });
}

document.getElementById('loadBtn').addEventListener('click', loadLiveData);
document.getElementById('mockBtn').addEventListener('click', loadMockData);

loadMockData();

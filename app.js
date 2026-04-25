const STORAGE_KEY = 'adview_connection';

const state = {
  rawRows: [],
  platformFilter: 'all',
  rangeType: 'today',
  customStart: '',
  customEnd: '',
  connection: {
    apiBase: '',
    metaAdId: '',
    appleAdId: '',
  },
};

const ui = {
  dashboardStatus: document.getElementById('dashboardStatus'),
  integrationStatus: document.getElementById('integrationStatus'),
  tableBody: document.getElementById('tableBody'),
  canvas: document.getElementById('chart'),
  apiBase: document.getElementById('apiBase'),
  metaAdId: document.getElementById('metaAdId'),
  appleAdId: document.getElementById('appleAdId'),
  startDate: document.getElementById('startDate'),
  endDate: document.getElementById('endDate'),
  customDateRange: document.getElementById('customDateRange'),
  dashboardPage: document.getElementById('dashboardPage'),
  integrationPage: document.getElementById('integrationPage'),
};

function formatCurrency(value) {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(value);
}

function saveConnection() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.connection));
}

function loadSavedConnection() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    state.connection = {
      apiBase: saved.apiBase || '',
      metaAdId: saved.metaAdId || '',
      appleAdId: saved.appleAdId || '',
    };
  } catch {
    state.connection = { apiBase: '', metaAdId: '', appleAdId: '' };
  }

  ui.apiBase.value = state.connection.apiBase;
  ui.metaAdId.value = state.connection.metaAdId;
  ui.appleAdId.value = state.connection.appleAdId;

  ui.integrationStatus.textContent = state.connection.apiBase
    ? '저장된 API 연동 정보가 있습니다.'
    : '연동 정보가 없습니다.';
}

function clearConnection() {
  state.connection = { apiBase: '', metaAdId: '', appleAdId: '' };
  state.rawRows = [];
  localStorage.removeItem(STORAGE_KEY);
  ui.apiBase.value = '';
  ui.metaAdId.value = '';
  ui.appleAdId.value = '';
  ui.integrationStatus.textContent = 'API 연동이 해제되었습니다.';
  ui.dashboardStatus.textContent = '연동 정보가 해제되어 데이터가 없습니다.';
  render();
}

function toISODate(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfWeek(date) {
  const s = startOfWeek(date);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  e.setHours(23, 59, 59, 999);
  return e;
}

function getRangeBounds() {
  const now = new Date();
  now.setHours(12, 0, 0, 0);

  if (state.rangeType === 'today') {
    const d = toISODate(now);
    return { start: d, end: d };
  }

  if (state.rangeType === 'yesterday') {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const d = toISODate(y);
    return { start: d, end: d };
  }

  if (state.rangeType === 'thisWeek') {
    return { start: toISODate(startOfWeek(now)), end: toISODate(endOfWeek(now)) };
  }

  if (state.rangeType === 'lastWeek') {
    const lastWeekDay = new Date(now);
    lastWeekDay.setDate(lastWeekDay.getDate() - 7);
    return { start: toISODate(startOfWeek(lastWeekDay)), end: toISODate(endOfWeek(lastWeekDay)) };
  }

  return { start: state.customStart, end: state.customEnd };
}

function aggregateRows(rows) {
  const map = new Map();

  for (const row of rows) {
    const key = `${row.date}|${row.platform}|${row.adId}`;
    const prev = map.get(key) || {
      date: row.date,
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

  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function getFilteredRows() {
  const { start, end } = getRangeBounds();
  if (!start || !end) return [];

  const filtered = state.rawRows.filter((row) => {
    const platformMatched = state.platformFilter === 'all' || row.platform === state.platformFilter;
    const dateMatched = row.date >= start && row.date <= end;
    return platformMatched && dateMatched;
  });

  return aggregateRows(filtered);
}

function renderTable() {
  const rows = getFilteredRows();
  ui.tableBody.innerHTML = '';

  for (const row of rows) {
    const tr = document.createElement('tr');
    const ctr = row.impressions ? (row.clicks / row.impressions) * 100 : 0;
    tr.innerHTML = `
      <td>${row.date}</td>
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
  const buckets = [...new Set(rows.map((r) => r.date))];
  const totals = buckets.map((bucket) => rows.filter((r) => r.date === bucket).reduce((sum, r) => sum + r.impressions, 0));

  const ctx = ui.canvas.getContext('2d');
  const { width, height } = ui.canvas;
  ctx.clearRect(0, 0, width, height);

  if (!totals.length) {
    ctx.fillStyle = '#61708e';
    ctx.font = '16px sans-serif';
    ctx.fillText('선택한 기간에 표시할 데이터가 없습니다.', 20, 40);
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

    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#3355ff';
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

async function refreshData() {
  const { apiBase, metaAdId, appleAdId } = state.connection;
  if (!apiBase || (!metaAdId && !appleAdId)) {
    ui.dashboardStatus.textContent = '먼저 API 연동 관리 페이지에서 연동 정보를 저장해 주세요.';
    return;
  }

  ui.dashboardStatus.textContent = '저장된 연동 정보로 데이터를 불러오는 중...';

  try {
    const [metaRows, appleRows] = await Promise.all([
      fetchPlatformData(apiBase, 'meta', metaAdId),
      fetchPlatformData(apiBase, 'apple', appleAdId),
    ]);

    state.rawRows = [...metaRows, ...appleRows];
    ui.dashboardStatus.textContent = `로딩 완료: ${state.rawRows.length}건`;
    render();
  } catch (error) {
    ui.dashboardStatus.textContent = `오류: ${error.message}`;
  }
}

function saveConnectionFromForm() {
  const apiBase = ui.apiBase.value.trim();
  const metaAdId = ui.metaAdId.value.trim();
  const appleAdId = ui.appleAdId.value.trim();

  if (!apiBase || (!metaAdId && !appleAdId)) {
    ui.integrationStatus.textContent = 'API Base URL과 최소 1개 광고 ID를 입력해 주세요.';
    return;
  }

  state.connection = { apiBase, metaAdId, appleAdId };
  saveConnection();
  ui.integrationStatus.textContent = 'API 연동 정보가 저장되었습니다. 대시보드에서 새로고침하세요.';
}

function loadMockData() {
  state.rawRows = [
    { date: '2026-04-20', platform: 'meta', adId: 'M-100', impressions: 12000, clicks: 580, conversions: 33, spend: 320000 },
    { date: '2026-04-21', platform: 'meta', adId: 'M-100', impressions: 16000, clicks: 700, conversions: 44, spend: 400000 },
    { date: '2026-04-22', platform: 'meta', adId: 'M-100', impressions: 11000, clicks: 500, conversions: 29, spend: 300000 },
    { date: '2026-04-20', platform: 'apple', adId: 'A-200', impressions: 9000, clicks: 420, conversions: 26, spend: 290000 },
    { date: '2026-04-21', platform: 'apple', adId: 'A-200', impressions: 9800, clicks: 430, conversions: 30, spend: 310000 },
    { date: '2026-04-22', platform: 'apple', adId: 'A-200', impressions: 13000, clicks: 510, conversions: 35, spend: 345000 },
  ];

  ui.dashboardStatus.textContent = `샘플 데이터 로딩 완료: ${state.rawRows.length}건`;
  ui.integrationStatus.textContent = '샘플 데이터를 로딩했습니다.';
  render();
}

function activatePage(pageName) {
  const isDashboard = pageName === 'dashboard';
  ui.dashboardPage.classList.toggle('active', isDashboard);
  ui.integrationPage.classList.toggle('active', !isDashboard);

  document.querySelectorAll('.page-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.page === pageName);
  });
}

for (const btn of document.querySelectorAll('.filter-btn')) {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.platformFilter = btn.dataset.filter;
    render();
  });
}

for (const btn of document.querySelectorAll('.page-btn')) {
  btn.addEventListener('click', () => activatePage(btn.dataset.page));
}

for (const btn of document.querySelectorAll('.date-btn')) {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.date-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.rangeType = btn.dataset.range;
    ui.customDateRange.classList.toggle('hidden', state.rangeType !== 'custom');
    render();
  });
}

document.getElementById('applyCustomDate').addEventListener('click', () => {
  state.customStart = ui.startDate.value;
  state.customEnd = ui.endDate.value;

  if (!state.customStart || !state.customEnd) {
    ui.dashboardStatus.textContent = '직접 선택을 사용하려면 시작일/종료일을 모두 입력해 주세요.';
    return;
  }

  if (state.customStart > state.customEnd) {
    ui.dashboardStatus.textContent = '시작일은 종료일보다 이전이어야 합니다.';
    return;
  }

  ui.dashboardStatus.textContent = `직접 선택 기간 적용: ${state.customStart} ~ ${state.customEnd}`;
  render();
});

document.getElementById('refreshBtn').addEventListener('click', refreshData);
document.getElementById('saveConnectionBtn').addEventListener('click', saveConnectionFromForm);
document.getElementById('disconnectBtn').addEventListener('click', clearConnection);
document.getElementById('mockBtn').addEventListener('click', loadMockData);

loadSavedConnection();
loadMockData();

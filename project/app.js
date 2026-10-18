/* Калькулятор стоимости каркасного дома — логика приложения */

const S = {
  items: [],
  on: {},          // id -> включено
  qty: {},         // id -> количество (ручное переопределение)
  area: 120, perim: 44, facade: 160, roof: 150, glass: 26, piles: 40, extra: 0,
  level: 50, reserve: 12,
  naklad: true, over: false, clean: true,
  collapsed: {}
};

const fmt = n => (Math.round(n) || 0).toLocaleString('ru-RU') + ' ₽';
const num = n => Math.round(n).toLocaleString('ru-RU');
const $ = id => document.getElementById(id);

/* ---------- цена с учётом уровня (мин → база → макс) ---------- */
function price(it) {
  const t = S.level / 100;
  if (t <= 0.5) return it.min + (it.base - it.min) * (t / 0.5);
  return it.base + (it.max - it.base) * ((t - 0.5) / 0.5);
}

/* ---------- автоколичество по единице измерения ---------- */
function autoQty(it) {
  const u = (it.unit || '').toLowerCase();
  const n = (it.name || '').toLowerCase();
  const p = S;
  if (n.includes('террас') || n.includes('навес')) return p.extra;
  if (u.includes('площади дома')) return p.area;
  if (u === 'м² фасада') return p.facade;
  if (u === 'м² кровли') return p.roof;
  if (u === 'м² стены') return Math.round(p.area * 0.65);
  if (u === 'м² остекления') return p.glass;
  if (u === 'м²') {
    if (n.includes('фасад')) return p.facade;
    if (n.includes('кровл')) return p.roof;
    if (n.includes('остекл')) return p.glass;
    if (n.includes('плитк') || n.includes('мойк')) return Math.round(p.area * 0.15);
    return p.area;
  }
  if (u === 'пог. м') {
    if (n.includes('водосток')) return Math.round(p.perim);
    return p.perim;
  }
  if (u === 'лист') return Math.ceil(p.area / 3.125);
  if (u === 'м³') return Math.max(1, Math.ceil(p.area * (n.includes('ват') ? 0.3 : 0.14)));
  if (u === 'шт.') {
    if (n.includes('свая')) return p.piles;
    if (n.includes('снегозадерж') && n.includes('точечн')) return Math.ceil(p.perim / 3);
    if (n.includes('снегозадерж')) return Math.ceil(p.perim / 8);
    if (n.includes('межкомнат')) return 5;
    if (n.includes('входная') || n.includes('балкон') || n.includes('террасная')) return 1;
    if (n.includes('котёл') || n.includes('навес')) return 1;
    return 1;
  }
  if (u === 'рулон') return 8;
  if (u === 'рейс') return 2;
  if (u === 'контейнер') return 1;
  if (u === 'смена' || u === 'сутки' || u === 'месяц') return 1;
  return 1;
}

function qtyOf(it) {
  return S.qty[it.id] !== undefined ? S.qty[it.id] : autoQty(it);
}

/* ---------- служебные позиции (проценты и резерв) ---------- */
const SPECIAL = new Set();
function isSpecial(it) {
  const n = (it.name || '').toLowerCase();
  return n.includes('накладные расходы') || n.includes('технический надзор') ||
         n.includes('финальная уборка') || n.includes('резерв на непредвиденные') ||
         (it.section || '').startsWith('16.');
}
function specialRow(kind) {
  const n = kind === 'naklad' ? 'накладные' : kind === 'over' ? 'технический надзор' : 'финальная уборка';
  return S.items.find(it => (it.name || '').toLowerCase().includes(n));
}

function defaultOn(it) {
  const st = (it.status || '').toLowerCase();
  if (it.section.startsWith('16.')) return false;
  if (st.includes('обязательно') || st.includes('рекомендуется') || st.includes('минимум')) return true;
  return false;
}

/* ---------- расчёт ---------- */
function compute() {
  const rows = [];
  let subtotal = 0;
  for (const it of S.items) {
    if (isSpecial(it)) continue;
    if (!S.on[it.id]) continue;
    const q = qtyOf(it);
    if (!q) continue;
    const sum = price(it) * q;
    subtotal += sum;
    rows.push({ section: it.section, name: it.name, unit: it.unit, qty: q, price: price(it), sum });
  }
  const extras = [];
  const nak = specialRow('naklad');
  if (S.naklad && nak) {
    const v = subtotal * price(nak) / 100;
    extras.push({ name: 'Доставка и накладные расходы', sum: v });
  }
  const ov = specialRow('over');
  if (S.over && ov) {
    const v = subtotal * price(ov) / 100;
    extras.push({ name: 'Независимый технический надзор', sum: v });
  }
  const cl = specialRow('clean');
  if (S.clean && cl) {
    extras.push({ name: 'Финальная уборка и вывоз остатков', sum: price(cl) });
  }
  const beforeReserve = subtotal + extras.reduce((a, e) => a + e.sum, 0);
  const reserve = beforeReserve * S.reserve / 100;
  const total = beforeReserve + reserve;
  return { rows, subtotal, extras, reserve, total, perM2: S.area ? total / S.area : 0 };
}

/* ---------- рендер ---------- */
function renderSections() {
  const groups = {};
  for (const it of S.items) {
    if (isSpecial(it)) continue;
    (groups[it.section] = groups[it.section] || []).push(it);
  }
  const host = $('sections');
  host.innerHTML = '';
  Object.keys(groups).forEach(sec => {
    const items = groups[sec];
    const el = document.createElement('section');
    el.className = 'sec';
    const head = document.createElement('header');
    head.innerHTML = `<span>${sec}</span><span class="sum" data-sum="${sec}">— ₽</span>`;
    head.onclick = () => {
      S.collapsed[sec] = !S.collapsed[sec];
      body.hidden = !!S.collapsed[sec];
    };
    const body = document.createElement('div');
    body.className = 'items';
    items.forEach(it => {
      const row = document.createElement('div');
      row.className = 'item';
      const st = (it.status || '').toLowerCase();
      const cls = st.includes('обязательно') || st.includes('рекомендуется') || st.includes('минимум') ? 'ob' : 'opt';
      row.innerHTML = `
        <input type="checkbox" data-on="${it.id}" ${S.on[it.id] ? 'checked' : ''}>
        <div class="nm">${it.name}<small>${it.unit} · база ${num(it.base)} ₽ <span class="tag ${cls}">${it.status || '—'}</span></small></div>
        <input class="qty" type="number" min="0" step="1" data-qty="${it.id}" value="${qtyOf(it)}">`;
      body.appendChild(row);
    });
    el.appendChild(head);
    el.appendChild(body);
    host.appendChild(el);
  });
  host.oninput = e => {
    const id = e.target.getAttribute('data-qty');
    if (id) { S.qty[id] = parseFloat(e.target.value) || 0; update(); }
  };
  host.onchange = e => {
    const id = e.target.getAttribute('data-on');
    if (id) { S.on[id] = e.target.checked; update(); }
  };
}

function update() {
  const r = compute();
  $('total').textContent = fmt(r.total);
  $('perM2').textContent = fmt(r.perM2) + ' / м²';
  $('sub').textContent = fmt(r.subtotal);
  $('res').textContent = fmt(r.reserve);
  $('cnt').textContent = r.rows.length;

  // суммы по разделам
  const per = {};
  r.rows.forEach(x => per[x.section] = (per[x.section] || 0) + x.sum);
  document.querySelectorAll('[data-sum]').forEach(el => {
    const v = per[el.getAttribute('data-sum')] || 0;
    el.textContent = v ? fmt(v) : '— ₽';
  });

  // разбивка
  const bd = $('breakdown');
  bd.innerHTML = '';
  const parts = Object.entries(per).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...parts.map(p => p[1]));
  parts.forEach(([sec, v]) => {
    const d = document.createElement('div');
    d.className = 'row';
    d.innerHTML = `<span>${sec}</span><b>${fmt(v)}</b><div class="bar"><i style="width:${(v / max * 100).toFixed(1)}%"></i></div>`;
    bd.appendChild(d);
  });
  r.extras.forEach(e => {
    const d = document.createElement('div');
    d.className = 'row';
    d.innerHTML = `<span>${e.name}</span><b>${fmt(e.sum)}</b>`;
    bd.appendChild(d);
  });
  const d = document.createElement('div');
  d.className = 'row';
  d.innerHTML = `<span>Резерв на непредвиденное (${S.reserve}%)</span><b>${fmt(r.reserve)}</b>`;
  bd.appendChild(d);

  window.__last = r;
  return r;
}

/* ---------- связка ползунков ---------- */
function bindRange(id, key, outId, suffix) {
  const el = $(id);
  el.addEventListener('input', () => {
    S[key] = parseFloat(el.value);
    $(outId).textContent = S[key] + (suffix || '');
    update();
  });
}
function syncLabels() {
  $('vArea').textContent = S.area; $('vPerim').textContent = S.perim;
  $('vFacade').textContent = S.facade; $('vRoof').textContent = S.roof;
  $('vGlass').textContent = S.glass; $('vPiles').textContent = S.piles;
  $('vExtra').textContent = S.extra; $('vReserve').textContent = S.reserve;
  const lv = S.level < 25 ? 'минимальный' : S.level < 45 ? 'ниже базового' :
             S.level <= 55 ? 'базовый' : S.level < 80 ? 'выше базового' : 'максимальный';
  $('vLevel').textContent = lv;
}

function resetAll() {
  S.on = {}; S.qty = {};
  S.area = 120; S.perim = 44; S.facade = 160; S.roof = 150; S.glass = 26; S.piles = 40; S.extra = 0;
  S.level = 50; S.reserve = 12; S.naklad = true; S.over = false; S.clean = true;
  $('area').value = 120; $('perim').value = 44; $('facade').value = 160; $('roof').value = 150;
  $('glass').value = 26; $('piles').value = 40; $('extra').value = 0; $('level').value = 50;
  $('reserve').value = 12; $('optNaklad').checked = true; $('optOver').checked = false; $('optClean').checked = true;
  S.items.forEach(it => S.on[it.id] = defaultOn(it));
  renderSections(); syncLabels(); update();
}

/* ---------- загрузка данных ---------- */
function applyData(items, source, online) {
  S.items = items;
  S.on = {}; S.qty = {};
  items.forEach(it => S.on[it.id] = defaultOn(it));
  renderSections(); syncLabels(); update();
  $('source').textContent = (online ? '🔄 онлайн-таблица: ' : '📄 файл: ') + source;
}

async function loadData() {
  setStatus('Читаю прайс…', '');
  try {
    const res = await fetch('/api/data');
    const j = await res.json();
    if (!j.ok) throw new Error(j.error);
    applyData(j.items, j.source, j.online);
    setStatus(`Данные загружены: ${j.items.length} позиций прайса.`, 'ok');
  } catch (e) {
    setStatus('Ошибка загрузки: ' + e.message, 'err');
  }
}

function setStatus(t, cls) {
  const el = $('status');
  el.textContent = t;
  el.className = 'status ' + (cls || '');
}

/* ---------- события ---------- */
$('fileInput').addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  setStatus('Загружаю таблицу «' + f.name + '»…', '');
  try {
    const buf = await f.arrayBuffer();
    const res = await fetch('/api/load', { method: 'POST', body: buf });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error);
    applyData(j.items, f.name, false);
    setStatus('Таблица загружена в приложение: ' + j.items.length + ' позиций.', 'ok');
    flashResult();
  } catch (err) {
    setStatus('Не удалось загрузить таблицу: ' + err.message, 'err');
  }
});

$('btnOnline').onclick = () => { $('modal').hidden = false; };
$('onlineCancel').onclick = () => { $('modal').hidden = true; };
$('onlineGo').onclick = async () => {
  const url = $('onlineUrl').value.trim();
  $('modal').hidden = true;
  setStatus('Обновляю данные из онлайн-таблицы…', '');
  try {
    const res = await fetch('/api/update?url=' + encodeURIComponent(url));
    const j = await res.json();
    if (!j.ok) throw new Error(j.error);
    applyData(j.items, j.source, true);
    setStatus('Данные обновлены из онлайн-таблицы: ' + j.items.length + ' позиций.', 'ok');
    flashResult();
  } catch (e) {
    setStatus('Не удалось обновить данные: ' + e.message, 'err');
  }
};

$('btnResult').onclick = flashResult;
$('btnResult2').onclick = flashResult;
function flashResult() {
  update();
  const p = $('resultPanel');
  p.scrollIntoView({ behavior: 'smooth', block: 'start' });
  p.classList.remove('flash'); void p.offsetWidth; p.classList.add('flash');
}

$('btnReset').onclick = () => { resetAll(); setStatus('Новый расчёт: параметры сброшены.', 'ok'); };

$('btnQuit').onclick = async () => {
  if (!confirm('Закрыть приложение?')) return;
  try { await fetch('/api/quit'); } catch (e) { /* сервер уже остановлен */ }
  document.body.innerHTML =
    '<div style="display:grid;place-items:center;height:100vh;color:#8b98ab;font-family:Segoe UI,sans-serif">' +
    '<div style="text-align:center"><h2 style="color:#e8edf5">Приложение закрыто</h2>' +
    '<p>Сервер остановлен. Эту вкладку можно закрыть.</p></div></div>';
};

$('btnExport').onclick = async () => {
  const r = update();
  const rows = r.rows.concat(r.extras.map(e => ({ section: 'Итоговые расходы', name: e.name, unit: '%', qty: '', price: '', sum: e.sum })));
  try {
    const res = await fetch('/api/export', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows, total: Math.round(r.total), perM2: Math.round(r.perM2) })
    });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'raschet_karkasnyy_dom.csv';
    a.click();
    setStatus('Расчёт выгружен в файл raschet_karkasnyy_dom.csv.', 'ok');
  } catch (e) {
    setStatus('Ошибка экспорта: ' + e.message, 'err');
  }
};

$('optNaklad').onchange = e => { S.naklad = e.target.checked; update(); };$('optOver').onchange = e => { S.over = e.target.checked; update(); };
$('optClean').onchange = e => { S.clean = e.target.checked; update(); };

bindRange('area', 'area', 'vArea', ' м²');
bindRange('perim', 'perim', 'vPerim', ' пог. м');
bindRange('facade', 'facade', 'vFacade', ' м²');
bindRange('roof', 'roof', 'vRoof', ' м²');
bindRange('glass', 'glass', 'vGlass', ' м²');
bindRange('piles', 'piles', 'vPiles', ' шт.');
bindRange('extra', 'extra', 'vExtra', ' м²');
$('level').addEventListener('input', e => { S.level = parseFloat(e.target.value); syncLabels(); update(); });
bindRange('reserve', 'reserve', 'vReserve', ' %');

loadData();

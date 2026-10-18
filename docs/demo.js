/* Статичная демо-версия для GitHub Pages.
   Подменяет обращения к локальному серверу, поэтому интерфейс
   работает прямо в браузере на демонстрационных данных. */
(function () {
  'use strict';

  var DEMO = window.KALK_DEMO || { source: 'demo', items: [] };
  var realFetch = window.fetch ? window.fetch.bind(window) : null;

  function json(obj, status) {
    return new Response(JSON.stringify(obj), {
      status: status || 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  /* Выгрузка сметы формируется в браузере (в приложении это делает сервер). */
  function toCsv(payload) {
    function esc(v) {
      var s = String(v === undefined || v === null ? '' : v);
      return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    var lines = [['Раздел', 'Позиция', 'Ед.', 'Кол-во', 'Цена', 'Сумма'].map(esc).join(';')];
    (payload.rows || []).forEach(function (r) {
      lines.push([r.section, r.name, r.unit, r.qty, r.price, r.sum].map(esc).join(';'));
    });
    lines.push('');
    lines.push(['', '', '', '', 'Итого:', payload.total].map(esc).join(';'));
    lines.push(['', '', '', '', 'Цена за м²:', payload.perM2].map(esc).join(';'));
    return '\ufeff' + lines.join('\r\n') + '\r\n';
  }

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf('/api/data') === 0) {
      return Promise.resolve(json({ ok: true, items: DEMO.items, source: DEMO.source, online: false }));
    }
    if (url.indexOf('/api/export') === 0) {
      var payload = {};
      try { payload = JSON.parse((init && init.body) || '{}'); } catch (e) { /* пусто */ }
      return Promise.resolve(new Response(toCsv(payload), {
        status: 200,
        headers: { 'Content-Type': 'text/csv; charset=utf-8' }
      }));
    }
    if (url.indexOf('/api/load') === 0) {
      return Promise.resolve(json({ ok: false, error: 'загрузка своей таблицы доступна в локальной версии приложения' }));
    }
    if (url.indexOf('/api/update') === 0) {
      return Promise.resolve(json({ ok: false, error: 'обновление из онлайн-таблицы доступно в локальной версии приложения' }));
    }
    if (url.indexOf('/api/quit') === 0) {
      return Promise.resolve(json({ ok: false, error: 'демо-версия' }));
    }
    return realFetch ? realFetch(input, init) : Promise.reject(new Error('нет соединения'));
  };

  /* Честно помечаем демо-режим и отключаем функции, которым нужен сервер. */
  window.addEventListener('load', function () {
    var style = document.createElement('style');
    style.textContent =
      '.demo-badge{margin-left:auto;font-size:12px;color:#f0b25e;' +
      'border:1px solid rgba(240,178,94,.45);border-radius:999px;' +
      'padding:3px 10px;white-space:nowrap}';
    document.head.appendChild(style);

    var bar = document.querySelector('.statusbar');
    if (bar) {
      var badge = document.createElement('div');
      badge.className = 'demo-badge';
      badge.textContent = 'Демо-версия · цены примерные';
      bar.appendChild(badge);
    }

    [['btnOnline', 'Демо-версия: обновление из онлайн-таблицы доступно в локальном приложении.'],
     ['btnQuit', 'Демо-версия: закрытие доступно в локальном приложении.']].forEach(function (pair) {
      var el = document.getElementById(pair[0]);
      if (!el) return;
      el.disabled = true;
      el.style.opacity = '.45';
      el.title = pair[1];
    });

    var fileInput = document.getElementById('fileInput');
    var fileLabel = document.querySelector('label.btn.ghost');
    if (fileInput) fileInput.disabled = true;
    if (fileLabel) {
      fileLabel.style.opacity = '.45';
      fileLabel.title = 'Демо-версия: загрузка своей таблицы доступна в локальном приложении.';
    }
  });
})();

/* ==========================================================================
   材料科学 RAG 知识库 · 前端逻辑
   原生 JS / 无构建 / 无外部依赖
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* 常量与工具                                                          */
  /* ------------------------------------------------------------------ */

  var API = '';                 // 同源部署，方便替换成网关地址
  var LS_THEME = 'msrag.theme';
  var LS_PREFILL = 'msrag.prefill';
  var LS_TOPK = 'msrag.topk';

  var PROCESSING = ['uploaded', 'queued', 'parsing', 'chunking', 'embedding'];

  var STATUS_MAP = {
    uploaded:  { text: '已上传',   cls: 'info' },
    queued:    { text: '排队中',   cls: 'info' },
    parsing:   { text: '解析中',   cls: 'info' },
    chunking:  { text: '切分中',   cls: 'info' },
    embedding: { text: '向量化中', cls: 'info' },
    ready:     { text: '已就绪',   cls: 'ok'   },
    failed:    { text: '失败',     cls: 'err'  }
  };

  var EXAMPLES = [
    '高熵合金的强化机制有哪些？',
    '钙钛矿太阳能电池为什么稳定性差？',
    '如何通过热处理调控铝合金析出相？',
    '简述固态电解质中的锂枝晶抑制策略。'
  ];

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  function esc(v) {
    return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var NUMF = (typeof Intl !== 'undefined' && Intl.NumberFormat)
    ? new Intl.NumberFormat('zh-CN')
    : { format: function (n) { return String(n); } };

  function num(v) { return NUMF.format(Number(v || 0)); }

  function fmtBytes(n) {
    n = Number(n || 0);
    if (!n) return '—';
    var units = ['B', 'KB', 'MB', 'GB'];
    var i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
    return (i === 0 ? n : n.toFixed(1)) + ' ' + units[i];
  }

  function fmtDate(s) {
    if (!s) return '—';
    var d = new Date(String(s).replace(' ', 'T'));
    if (isNaN(d.getTime())) return String(s);
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
           ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function debounce(fn, wait) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      if (t) clearTimeout(t);
      t = setTimeout(function () { t = null; fn.apply(self, args); }, wait);
    };
  }

  function isProcessing(status) { return PROCESSING.indexOf(String(status || '')) !== -1; }

  function statusBadge(status) {
    var m = STATUS_MAP[String(status)] || { text: String(status || '未知'), cls: '' };
    var spin = isProcessing(status)
      ? '<svg class="spin" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 3a9 9 0 1 0 9 9" /></svg>'
      : '';
    return '<span class="badge ' + m.cls + '">' + spin + esc(m.text) + '</span>';
  }

  function pageRange(a, b) {
    var s = (a === null || a === undefined) ? null : a;
    var e = (b === null || b === undefined) ? null : b;
    if (s === null && e === null) return '';
    if (s === null) return '至第 ' + e + ' 页';
    if (e === null || s === e) return '第 ' + s + ' 页';
    return '第 ' + s + '–' + e + ' 页';
  }

  function scoreText(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    if (isNaN(n)) return null;
    return n.toFixed(2);
  }

  /* 版面解析的截图以 ![id](/api/assets/...) 内联在正文里。
     直接转义展示的话用户只会看到一串语法文本，所以拆出来单独渲染成 <img>。 */
  var IMG_REF_RE = /!\[([^\]]*)\]\((\/api\/assets\/[^)\s]+)\)/g;

  function splitImages(text) {
    var imgs = [];
    var src = (text === null || text === undefined) ? '' : String(text);
    var clean = src.replace(IMG_REF_RE, function (m, alt, url) {
      imgs.push({ alt: alt || '', url: url });
      return '';
    });
    return {
      text: clean.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim(),
      imgs: imgs
    };
  }

  function normImages(list) {
    return (list || []).map(function (im) {
      return (typeof im === 'string') ? { url: im, alt: '' } : (im || {});
    }).filter(function (im) { return im && im.url; });
  }

  function imagesHtml(list) {
    var imgs = normImages(list);
    if (!imgs.length) return '';
    return '<div class="chunk-media">' + imgs.map(function (im) {
      // 包一层链接：缩略图看不清公式/表格时可直接点开原图
      return '<figure class="chunk-figure">' +
        '<a href="' + esc(im.url) + '" target="_blank" rel="noopener" title="点击查看原图">' +
        '<img src="' + esc(im.url) + '" alt="' + esc(im.alt || '版面截图') +
        '" loading="lazy" decoding="async"></a>' +
        '</figure>';
    }).join('') + '</div>';
  }

  /* ------------------------------------------------------------------ */
  /* 图标（全部内联 SVG）                                                */
  /* ------------------------------------------------------------------ */

  var svg = function (body, size, extra) {
    return '<svg viewBox="0 0 24 24" width="' + (size || 16) + '" height="' + (size || 16) +
      '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ' +
      (extra || '') + ' aria-hidden="true">' + body + '</svg>';
  };

  var ICONS = {
    sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>', 17),
    moon: svg('<path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.4 8.4 0 1 0 20 14.2z"/>', 17),
    menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>', 17),
    sliders: svg('<path d="M4 8h10M18 8h2M4 16h4M12 16h8"/><circle cx="16" cy="8" r="2"/><circle cx="10" cy="16" r="2"/>', 17),
    bot: svg('<rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9.5 16.2h5"/>', 17),
    user: svg('<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20c.9-3.6 3.6-5.4 7.2-5.4s6.3 1.8 7.2 5.4"/>', 17),
    chevron: svg('<path d="M9 5l7 7-7 7"/>', 14),
    search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>', 15),
    refresh: svg('<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v4h-4"/>', 15),
    trash: svg('<path d="M4 7h16M9 7V5h6v2M6.5 7l.8 12.1A1.5 1.5 0 0 0 8.8 20.5h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7"/>', 14),
    edit: svg('<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z"/>', 14),
    copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>', 14),
    copyOk: svg('<path d="M5 13l4 4L19 7"/>', 14),
    arrow: svg('<path d="M5 12h13M13 6l6 6-6 6"/>', 15),
    file: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>', 15),
    layers: svg('<path d="M12 3l8 4.5-8 4.5-8-4.5L12 3z"/><path d="M4 12.5l8 4.5 8-4.5M4 17l8 4.5 8-4.5"/>', 15),
    alert: svg('<path d="M12 4l9 16H3l9-16z"/><path d="M12 10v4M12 17h.01"/>', 15),
    image: svg('<rect x="3" y="4.5" width="18" height="15" rx="2"/><circle cx="8.5" cy="10" r="1.6"/><path d="M21 16.5l-4.5-4.5L6 20"/>', 15)
  };

  function emptyArt() {
    return '<svg class="empty-art" viewBox="0 0 120 92" width="132" height="101" fill="none" aria-hidden="true">' +
      '<g stroke="currentColor" stroke-width="1.3" opacity="0.75">' +
      '<path d="M60 8 L96 29 L96 63 L60 84 L24 63 L24 29 Z"/>' +
      '<path d="M60 8 L60 46 M96 29 L60 46 M24 29 L60 46 M60 46 L60 84 M60 46 L96 63 M60 46 L24 63"/>' +
      '</g>' +
      '<g fill="currentColor" opacity="0.9">' +
      '<circle cx="60" cy="8" r="3.4"/><circle cx="96" cy="29" r="2.6"/><circle cx="96" cy="63" r="2.6"/>' +
      '<circle cx="60" cy="84" r="2.6"/><circle cx="24" cy="63" r="2.6"/><circle cx="24" cy="29" r="2.6"/>' +
      '<circle cx="60" cy="46" r="5"/>' +
      '</g>' +
      '<g stroke="currentColor" stroke-width="1.1" opacity="0.35">' +
      '<path d="M8 20h10M8 26h7M102 70h10M102 76h7"/></g>' +
      '</svg>';
  }

  /* ------------------------------------------------------------------ */
  /* Toast                                                               */
  /* ------------------------------------------------------------------ */

  function toast(message, type, ms) {
    var root = $('#toastRoot');
    if (!root) return;
    var el = document.createElement('div');
    el.className = 'toast ' + (type || 'info');
    el.innerHTML = '<span class="toast-dot"></span><span>' + esc(message) + '</span>';
    root.appendChild(el);
    var life = ms || 2600;
    setTimeout(function () {
      el.classList.add('is-out');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 240);
    }, life);
  }

  /* ------------------------------------------------------------------ */
  /* API 封装                                                            */
  /* ------------------------------------------------------------------ */

  function extractError(payload, res) {
    var err = (payload && payload.error) || {};
    var e = new Error(err.message || ('请求失败（HTTP ' + res.status + '）'));
    e.code = err.code || 'http_error';
    e.details = err.details || {};
    e.status = res.status;
    return e;
  }

  function api(path, options) {
    options = options || {};
    var init = { method: options.method || 'GET', headers: {} };
    if (options.body instanceof FormData) {
      init.body = options.body;
    } else if (options.body !== null && options.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }
    if (options.signal) init.signal = options.signal;

    return fetch(API + path, init).then(function (res) {
      return res.text().then(function (text) {
        var payload = null;
        try { payload = text ? JSON.parse(text) : null; } catch (e) { payload = null; }
        if (!res.ok || (payload && payload.success === false)) {
          throw extractError(payload, res);
        }
        if (payload && Object.prototype.hasOwnProperty.call(payload, 'data')) return payload.data;
        return payload;
      });
    });
  }

  function parseSSEBlock(block, onEvent) {
    var name = 'message';
    var dataLines = [];
    String(block).split(/\r?\n/).forEach(function (line) {
      if (!line) return;
      if (line.indexOf('event:') === 0) name = line.slice(6).trim();
      else if (line.indexOf('data:') === 0) dataLines.push(line.slice(5).trim());
      else if (line.indexOf(':') === 0) return; // 注释/心跳
    });
    if (!dataLines.length) return;
    var raw = dataLines.join('\n');
    var obj;
    try { obj = JSON.parse(raw); } catch (e) { obj = { raw: raw }; }
    onEvent(name, obj);
  }

  function streamSSE(path, body, onEvent, signal) {
    return fetch(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      signal: signal
    }).then(function (res) {
      if (!res.ok || !res.body) {
        return res.text().then(function (t) {
          var msg = t;
          try {
            var j = JSON.parse(t);
            msg = (j && j.error && j.error.message) || t;
          } catch (e) { /* 保持原文 */ }
          var err = new Error(msg || ('请求失败（HTTP ' + res.status + '）'));
          err.status = res.status;
          throw err;
        });
      }
      var reader = res.body.getReader();
      var decoder = new TextDecoder('utf-8');
      var buffer = '';
      function pump() {
        return reader.read().then(function (r) {
          if (r.done) {
            if (buffer.trim()) parseSSEBlock(buffer, onEvent);
            return;
          }
          buffer += decoder.decode(r.value, { stream: true });
          var idx;
          while ((idx = buffer.indexOf('\n\n')) !== -1) {
            var block = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            parseSSEBlock(block, onEvent);
          }
          return pump();
        });
      }
      return pump();
    });
  }

  /* ------------------------------------------------------------------ */
  /* 轻量 Markdown 渲染（先转义，再结构化，防 XSS）                       */
  /* ------------------------------------------------------------------ */

  function mdInline(s) {
    return String(s)
      .replace(/`([^`]+)`/g, function (m, c) { return '<code class="md-code">' + c + '</code>'; })
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  }

  function renderMarkdown(src) {
    var fences = [];
    var text = String(src === null || src === undefined ? '' : src);
    // 1) 抽出代码块（内容立即转义）
    text = text.replace(/```([A-Za-z0-9_+-]*)\n?([\s\S]*?)```/g, function (m, lang, code) {
      fences.push(esc(code.replace(/\n$/, '')));
      return '@@MSRAGFENCE' + (fences.length - 1) + '@@';
    });
    // 2) 全文转义
    text = esc(text);

    var lines = text.split('\n');
    var out = [];
    var para = [];
    var listType = null;

    function flushPara() {
      if (para.length) {
        out.push('<p>' + mdInline(para.join(' ')) + '</p>');
        para = [];
      }
    }
    function closeList() {
      if (listType) { out.push(listType === 'ul' ? '</ul>' : '</ol>'); listType = null; }
    }
    function isTableSep(line) { return /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.indexOf('-') !== -1; }

    for (var i = 0; i < lines.length; i += 1) {
      var line = lines[i];

      var fence = /^@@MSRAGFENCE(\d+)@@$/.exec(line.trim());
      if (fence) {
        flushPara(); closeList();
        out.push('<pre class="md-pre"><code>' + fences[Number(fence[1])] + '</code></pre>');
        continue;
      }

      // 表格
      if (line.indexOf('|') !== -1 && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        flushPara(); closeList();
        var cells = line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|');
        var rows = [];
        var j = i + 2;
        while (j < lines.length && lines[j].indexOf('|') !== -1 && lines[j].trim() !== '') {
          rows.push(lines[j].replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|'));
          j += 1;
        }
        var html = '<table class="md-table"><thead><tr>';
        cells.forEach(function (c) { html += '<th>' + mdInline(c.trim()) + '</th>'; });
        html += '</tr></thead><tbody>';
        rows.forEach(function (r) {
          html += '<tr>';
          r.forEach(function (c) { html += '<td>' + mdInline(c.trim()) + '</td>'; });
          html += '</tr>';
        });
        html += '</tbody></table>';
        out.push(html);
        i = j - 1;
        continue;
      }

      var h = /^(#{1,6})\s+(.*)$/.exec(line);
      if (h) {
        flushPara(); closeList();
        var lv = Math.min(h[1].length, 6);
        out.push('<h' + lv + ' class="md-h">' + mdInline(h[2]) + '</h' + lv + '>');
        continue;
      }

      var ul = /^\s*[-*+]\s+(.*)$/.exec(line);
      if (ul) {
        flushPara();
        if (listType !== 'ul') { closeList(); out.push('<ul class="md-list">'); listType = 'ul'; }
        out.push('<li>' + mdInline(ul[1]) + '</li>');
        continue;
      }

      var ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
      if (ol) {
        flushPara();
        if (listType !== 'ol') { closeList(); out.push('<ol class="md-list">'); listType = 'ol'; }
        out.push('<li>' + mdInline(ol[1]) + '</li>');
        continue;
      }

      // 注意：此时文本已转义，'>' 表现为 '&gt;'
      var bq = /^\s*(?:>|&gt;)\s?(.*)$/.exec(line);
      if (bq) {
        flushPara(); closeList();
        out.push('<blockquote class="md-quote">' + mdInline(bq[1]) + '</blockquote>');
        continue;
      }

      if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
        flushPara(); closeList();
        out.push('<hr class="md-hr">');
        continue;
      }

      if (!line.trim()) { flushPara(); closeList(); continue; }

      para.push(line.trim());
    }
    flushPara(); closeList();
    return out.join('') || '';
  }

  function highlightIn(content, quote) {
    var c = String(content || '');
    var q = String(quote || '').trim();
    if (!q) return esc(c);
    var i = c.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return esc(c);
    return esc(c.slice(0, i)) + '<mark class="hl">' + esc(c.slice(i, i + q.length)) + '</mark>' + esc(c.slice(i + q.length));
  }

  /* ------------------------------------------------------------------ */
  /* 全局状态                                                            */
  /* ------------------------------------------------------------------ */

  var state = {
    meta: null,
    route: '',
    docs: [],
    docTotal: 0,
    libQuery: '',
    libStatus: '',
    pollTimer: null,
    docDetail: null,      // { id, query }
    allDocs: [],          // 问答限定文献候选
    selectedDocs: [],     // document_ids
    topK: 6,
    convs: [],
    currentConvId: null,
    streaming: false,
    abort: null,
    rendered: {}
  };

  /* ------------------------------------------------------------------ */
  /* 模态 / 抽屉                                                         */
  /* ------------------------------------------------------------------ */

  var modalRoot, modalTitle, modalBody, modalFoot;
  var drawerRoot, drawerTitle, drawerBody;

  function openModal(opts) {
    modalTitle.textContent = opts.title || '';
    modalBody.innerHTML = opts.body || '';
    modalFoot.innerHTML = '';
    var ctx = {
      close: closeModal,
      val: function (id) {
        var el = modalBody.querySelector('#' + id);
        return el ? String(el.value || '').trim() : '';
      },
      set: function (id, v) {
        var el = modalBody.querySelector('#' + id);
        if (el) el.value = v;
      }
    };
    (opts.actions || []).forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn ' + (a.cls || 'btn-ghost');
      b.textContent = a.text;
      b.addEventListener('click', function () { if (a.onClick) a.onClick(ctx); });
      modalFoot.appendChild(b);
    });
    modalRoot.hidden = false;
    requestAnimationFrame(function () { modalRoot.classList.add('is-open'); });
    var first = modalBody.querySelector('input, textarea');
    if (first) setTimeout(function () { first.focus(); }, 60);
    return ctx;
  }

  function closeModal() {
    if (modalRoot.hidden) return;
    modalRoot.classList.remove('is-open');
    setTimeout(function () { modalRoot.hidden = true; modalBody.innerHTML = ''; }, 240);
  }

  function confirmModal(opts) {
    return new Promise(function (resolve) {
      var done = false;
      function finish(v) { if (done) return; done = true; closeModal(); resolve(v); }
      openModal({
        title: opts.title || '请确认',
        body: '<p style="font-size:14px;line-height:1.75;color:var(--ink-2)">' + esc(opts.message || '') + '</p>',
        actions: [
          { text: '取消', onClick: function () { finish(false); } },
          { text: opts.okText || '确定', cls: opts.danger ? 'btn-danger' : 'btn-primary', onClick: function () { finish(true); } }
        ]
      });
      $('#modalBackdrop').onclick = function () { finish(false); };
      $('#modalClose').onclick = function () { finish(false); };
    });
  }

  function openDrawer(title, html) {
    drawerTitle.textContent = title || '详情';
    drawerBody.innerHTML = html || '';
    drawerBody.scrollTop = 0;
    drawerRoot.hidden = false;
    requestAnimationFrame(function () { drawerRoot.classList.add('is-open'); });
  }

  function closeDrawer() {
    if (drawerRoot.hidden) return;
    drawerRoot.classList.remove('is-open');
    setTimeout(function () { drawerRoot.hidden = true; drawerBody.innerHTML = ''; }, 260);
  }

  /* ------------------------------------------------------------------ */
  /* 主题                                                                */
  /* ------------------------------------------------------------------ */

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var btn = $('#themeToggle');
    if (btn) btn.innerHTML = theme === 'dark' ? ICONS.sun : ICONS.moon;
    try { localStorage.setItem(LS_THEME, theme); } catch (e) { /* 隐私模式忽略 */ }
  }

  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem(LS_THEME); } catch (e) { saved = null; }
    if (!saved) {
      var mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
      saved = (mq && mq.matches) ? 'dark' : 'light';
    }
    applyTheme(saved === 'dark' ? 'dark' : 'light');
  }

  /* ------------------------------------------------------------------ */
  /* 元信息                                                              */
  /* ------------------------------------------------------------------ */

  function loadMeta() {
    return api('/api/meta').then(function (data) {
      state.meta = data || {};
      var m = state.meta;
      var sub = [m.domain, m.version ? ('v' + m.version) : ''].filter(Boolean).join(' · ');
      var el = $('#brandSub');
      if (el) el.textContent = sub || '材料科学';
      renderLlmChip();
      return m;
    }).catch(function (err) {
      var el = $('#brandSub');
      if (el) el.textContent = '后端未连接';
      renderLlmChip();
      throw err;
    });
  }

  function llmEnabled() {
    return !!(state.meta && state.meta.capabilities && state.meta.capabilities.llm && state.meta.capabilities.llm.enabled);
  }

  function renderLlmChip() {
    var chip = $('#llmChip');
    if (!chip) return;
    if (!state.meta) { chip.hidden = true; return; }
    var cap = (state.meta.capabilities || {});
    var llm = cap.llm || {};
    chip.hidden = false;
    if (llm.enabled) {
      chip.className = 'llm-chip badge ok';
      chip.innerHTML = '<span class="cap-dot ok" style="margin-top:0"></span>LLM 已接入 · ' + esc(llm.model || '默认模型');
    } else {
      chip.className = 'llm-chip badge warn';
      chip.innerHTML = '<span class="cap-dot warn" style="margin-top:0"></span>LLM 未接入 · 抽取式作答';
    }
  }

  /* ------------------------------------------------------------------ */
  /* 视图：总览                                                          */
  /* ------------------------------------------------------------------ */

  function renderCapabilityRows() {
    var cap = (state.meta && state.meta.capabilities) || {};
    var cfg = (state.meta && state.meta.config) || {};
    var llm = cap.llm || {};
    var emb = cap.embedding || {};
    var ocr = cap.ocr || {};

    var rows = [];

    // LLM
    if (llm.enabled) {
      rows.push(row('ok', '大语言模型生成',
        '已接入 ' + (llm.provider || '自定义') + ' · ' + (llm.model || '—'),
        '回答由大模型基于检索证据归纳生成。'));
    } else {
      rows.push(row('warn', '大语言模型生成', 'LLM 未接入 · 抽取式作答',
        '未配置 Key，当前为抽取式作答，可在 .env 里填 MSRAG_LLM_API_KEY 后重启。'));
    }

    // Embedding
    var embProvider = emb.provider || 'unknown';
    var embOk = embProvider !== 'hash';
    rows.push(row(embOk ? 'ok' : 'warn', '向量化（Embedding）',
      (emb.model || '—') + ' · ' + (emb.dim ? emb.dim + ' 维' : '维度未知') + ' · 提供者 ' + embProvider,
      embOk ? '稠密向量用于语义近邻召回。'
            : '当前为哈希降级向量，语义召回效果有限，建议配置真实 Embedding 服务。'));

    // BM25
    rows.push(row(cap.bm25 ? 'ok' : 'off', '混合检索（BM25 + 向量）',
      cap.bm25 ? '已开启' : '未开启',
      cap.bm25 ? '稀疏关键词与稠密语义双路召回后融合排序。' : '仅使用向量召回，关键词匹配能力较弱。'));

    // OCR
    rows.push(row(ocr.installed ? 'ok' : 'off', '版面解析 / OCR',
      ocr.installed ? ('可用 · ' + (ocr.pipeline || '—')) : ('不可用' + (ocr.pipeline ? '（' + ocr.pipeline + '）' : '')),
      ocr.installed ? '扫描件与表格页可走版面识别管线。' : '扫描版 PDF 只能抽取文本层，识别效果受限。'));

    function row(kind, name, value, desc) {
      return '<div class="cap-row">' +
        '<span class="cap-dot ' + kind + '"></span>' +
        '<div class="cap-main">' +
          '<div class="cap-name">' + esc(name) + '<span class="badge ' + (kind === 'ok' ? 'ok' : kind === 'warn' ? 'warn' : '') + '">' + esc(value) + '</span></div>' +
          '<div class="cap-desc">' + esc(desc) + '</div>' +
        '</div></div>';
    }

    var tip;
    if (llm.enabled) {
      tip = '<div class="cap-tip is-ok">检索增强链路完整：向量 + 关键词召回后交由 ' +
        esc(llm.model || '大模型') + ' 归纳作答，所有结论均附证据出处。</div>';
    } else {
      tip = '<div class="cap-tip">未配置 LLM Key，问答将走<strong>抽取式降级</strong>：直接基于命中的原文片段生成证据摘要。' +
        '在 .env 中填写 MSRAG_LLM_API_KEY 并重启服务即可切换为生成式作答。</div>';
    }

    var note = $('#capNote');
    if (note) {
      var bits = [];
      if (cfg.chunk_size) bits.push('切分 ' + cfg.chunk_size);
      if (cfg.chunk_overlap) bits.push('重叠 ' + cfg.chunk_overlap);
      if (cfg.top_k) bits.push('top_k ' + cfg.top_k);
      note.textContent = bits.join(' · ');
    }

    return '<div class="cap-list">' + rows.join('') + '</div>' + tip;
  }

  function renderDashboard() {
    var stats = (state.meta && state.meta.stats) || {};
    var cards = [
      {
        cls: '',
        label: '文献数',
        value: num(stats.documents),
        sub: '已就绪 ' + num(stats.documents_ready) + ' / ' + num(stats.documents)
      },
      {
        cls: 'is-green',
        label: '向量段落数',
        value: num(stats.chunks),
        sub: '已向量化 ' + num(stats.chunks_embedded)
      },
      {
        cls: 'is-amber',
        label: '页面 / Token 规模',
        value: num(stats.pages) + ' <span style="font-size:14px;color:var(--ink-3);font-weight:500">页</span>',
        sub: num(stats.tokens) + ' tokens · ' + num(stats.sections) + ' 个章节'
      },
      {
        cls: '',
        label: '会话数',
        value: num(stats.conversations),
        sub: '累计 ' + num(stats.messages) + ' 条消息'
      }
    ];

    $('#dashStats').innerHTML = cards.map(function (c) {
      return '<div class="stat-card ' + c.cls + '">' +
        '<div class="stat-label">' + esc(c.label) + '</div>' +
        '<div class="stat-value">' + c.value + '</div>' +
        '<div class="stat-sub">' + esc(c.sub) + '</div>' +
        '</div>';
    }).join('');

    $('#dashCap').innerHTML = renderCapabilityRows();

    // 最近上传
    api('/api/documents?limit=5').then(function (data) {
      var items = (data && data.items) || [];
      var box = $('#dashRecent');
      if (!box) return;
      if (!items.length) {
        box.innerHTML = '<div class="empty-state" style="padding:26px 10px">' + emptyArt() +
          '<div class="empty-title">还没有文献</div>' +
          '<div class="empty-desc">上传第一篇论文或粘贴一段实验记录，知识库就有了起点。</div>' +
          '<a class="btn btn-primary" href="#/library">去文献库上传</a></div>';
        return;
      }
      box.innerHTML = items.map(function (d) {
        return '<div class="recent-item" data-doc="' + esc(d.id) + '">' +
          '<span style="color:var(--copper);flex:none">' + ICONS.file + '</span>' +
          '<div class="recent-main">' +
            '<div class="recent-title">' + esc(d.title || d.file_name || '未命名文献') + '</div>' +
            '<div class="recent-meta">' +
              '<span>' + esc(d.source || '未标注来源') + '</span>' +
              '<span>' + num(d.chunk_count) + ' 段</span>' +
              '<span>' + esc(fmtDate(d.created_at)) + '</span>' +
            '</div>' +
          '</div>' + statusBadge(d.status) + '</div>';
      }).join('');
      $$('.recent-item', box).forEach(function (el) {
        el.addEventListener('click', function () { openDocDetail(el.getAttribute('data-doc')); });
      });
    }).catch(function (err) {
      var box = $('#dashRecent');
      if (box) box.innerHTML = '<p class="muted small">' + esc(err.message) + '</p>';
    });
  }

  /* ------------------------------------------------------------------ */
  /* 视图：文献库                                                        */
  /* ------------------------------------------------------------------ */

  function loadDocs(silent) {
    var qs = '?limit=100&offset=0';
    if (state.libQuery) qs += '&q=' + encodeURIComponent(state.libQuery);
    if (state.libStatus) qs += '&status=' + encodeURIComponent(state.libStatus);
    return api('/api/documents' + qs).then(function (data) {
      state.docs = (data && data.items) || [];
      state.docTotal = (data && data.total) || state.docs.length;
      renderDocGrid();
      updatePolling();
      if (silent) refreshDocDetailIfOpen();
    });
  }

  function updatePolling() {
    var need = state.docs.some(function (d) { return isProcessing(d.status); });
    if (need && !state.pollTimer) {
      state.pollTimer = setInterval(function () {
        if (state.route === 'library') loadDocs(true);
        else if (state.route === 'dashboard') loadMeta().then(renderDashboard).catch(function () {});
        refreshDocDetailIfOpen();
      }, 1500);
    } else if (!need && state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }

  function renderDocGrid() {
    var grid = $('#libGrid');
    var empty = $('#libEmpty');
    var count = $('#libCount');
    if (count) count.textContent = '共 ' + num(state.docTotal) + ' 篇';

    if (!state.docs.length) {
      grid.innerHTML = '';
      empty.hidden = false;
      empty.innerHTML = '<div class="empty-state">' + emptyArt() +
        '<div class="empty-title">' + (state.libQuery || state.libStatus ? '没有匹配的文献' : '知识库还是空的') + '</div>' +
        '<div class="empty-desc">' + (state.libQuery || state.libStatus
          ? '换个关键词，或清空筛选条件再试一次。'
          : '把 PDF、DOCX 拖进来，或者粘贴一段正文 —— 系统会自动解析、切分并建立索引。') + '</div>' +
        (state.libQuery || state.libStatus
          ? '<button class="btn btn-ghost" id="libClearFilter" type="button">清空筛选</button>'
          : '<button class="btn btn-primary" id="libGoUpload" type="button">上传第一篇文献</button>') +
        '</div>';
      var clearBtn = $('#libClearFilter');
      if (clearBtn) clearBtn.addEventListener('click', function () {
        state.libQuery = ''; state.libStatus = '';
        $('#libSearch').value = ''; $('#libStatus').value = '';
        loadDocs();
      });
      var upBtn = $('#libGoUpload');
      if (upBtn) upBtn.addEventListener('click', function () { $('#fileInput').click(); });
      return;
    }

    empty.hidden = true;
    grid.innerHTML = state.docs.map(docCardHtml).join('');

    $$('.doc-card', grid).forEach(function (card) {
      var id = card.getAttribute('data-doc');
      card.addEventListener('click', function (e) {
        if (e.target.closest('[data-act]')) return;
        openDocDetail(id);
      });
    });
    $$('[data-act]', grid).forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = btn.closest('.doc-card').getAttribute('data-doc');
        var act = btn.getAttribute('data-act');
        if (act === 'view') openDocDetail(id);
        else if (act === 'reingest') reingestDoc(id);
        else if (act === 'delete') deleteDoc(id);
      });
    });
  }

  function docCardHtml(d) {
    var proc = isProcessing(d.status);
    var failed = d.status === 'failed';
    var tags = Array.isArray(d.tags) ? d.tags : [];
    var meta = [];
    if (d.file_ext) meta.push('<span class="badge ext">' + esc(String(d.file_ext).replace(/^\./, '')) + '</span>');
    if (d.page_count) meta.push('<span class="badge">' + num(d.page_count) + ' 页</span>');
    if (d.chunk_count) meta.push('<span class="badge">' + num(d.chunk_count) + ' 段</span>');

    return '<article class="doc-card' + (failed ? ' is-failed' : '') + '" data-doc="' + esc(d.id) + '">' +
      '<div class="doc-title">' + esc(d.title || d.file_name || '未命名文献') + '</div>' +
      (d.abstract ? '<div class="doc-abstract">' + esc(d.abstract) + '</div>' : '') +
      '<div class="doc-meta-row">' + meta.join('') + (tags.length ? tags.slice(0, 3).map(function (t) {
        return '<span class="badge info">' + esc(t) + '</span>';
      }).join('') : '') + '</div>' +
      '<div class="doc-stats">' +
        '<span>来源 <b>' + esc(d.source || '—') + '</b></span>' +
        '<span>token <b>' + num(d.token_count) + '</b></span>' +
        (d.file_size ? '<span>大小 <b>' + esc(fmtBytes(d.file_size)) + '</b></span>' : '') +
      '</div>' +
      (failed && d.error_message ? '<div class="err-line">' + ICONS.alert + ' ' + esc(d.error_message) + '</div>' : '') +
      (proc ? '<div class="sk" style="height:4px;border-radius:99px"></div>' : '') +
      '<div class="doc-foot">' +
        '<span class="doc-time">' + esc(fmtDate(d.created_at)) + '</span>' +
        '<span class="doc-actions">' +
          statusBadge(d.status) +
          '<button class="btn btn-ghost btn-sm" data-act="view" type="button">查看</button>' +
          '<button class="btn btn-ghost btn-sm" data-act="reingest" type="button" title="重新解析并重建索引">重索引</button>' +
          '<button class="btn btn-ghost btn-sm" data-act="delete" type="button" title="删除">' + ICONS.trash + '</button>' +
        '</span>' +
      '</div>' +
    '</article>';
  }

  function reingestDoc(id) {
    confirmModal({
      title: '重新索引',
      message: '将重新解析该文献并重建其向量索引，期间该文献会暂时处于处理中状态。是否继续？',
      okText: '重新索引'
    }).then(function (ok) {
      if (!ok) return;
      api('/api/documents/' + encodeURIComponent(id) + '/reingest', { method: 'POST', body: {} })
        .then(function () {
          toast('已提交重新索引任务', 'ok');
          loadDocs();
        })
        .catch(function (err) { toast(err.message, 'err', 3600); });
    });
  }

  function deleteDoc(id) {
    var doc = null;
    state.docs.forEach(function (d) { if (d.id === id) doc = d; });
    confirmModal({
      title: '删除文献',
      message: '确定要删除《' + ((doc && (doc.title || doc.file_name)) || id) + '》吗？其全部段落与索引都会被移除，且不可恢复。',
      okText: '删除',
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      api('/api/documents/' + encodeURIComponent(id), { method: 'DELETE' })
        .then(function () {
          toast('文献已删除', 'ok');
          if (state.docDetail && state.docDetail.id === id) closeDrawer();
          loadDocs();
        })
        .catch(function (err) { toast(err.message, 'err', 3600); });
    });
  }

  /* ---- 文献详情抽屉 ---- */

  function openDocDetail(id) {
    if (!id) return;
    state.docDetail = { id: id, query: '' };
    openDrawer('文献详情', '<div class="sk" style="height:16px;width:60%;margin-bottom:10px"></div>' +
      '<div class="sk" style="height:12px;width:90%;margin-bottom:8px"></div>' +
      '<div class="sk" style="height:12px;width:75%"></div>');
    api('/api/documents/' + encodeURIComponent(id)).then(function (data) {
      if (!state.docDetail || state.docDetail.id !== id) return;
      renderDocDetail(data, state.docDetail.query);
    }).catch(function (err) {
      openDrawer('文献详情', '<p class="err-line">' + esc(err.message) + '</p>');
    });
  }

  function refreshDocDetailIfOpen() {
    if (!state.docDetail || drawerRoot.hidden) return;
    api('/api/documents/' + encodeURIComponent(state.docDetail.id)).then(function (data) {
      if (!state.docDetail) return;
      renderDocDetail(data, state.docDetail.query);
    }).catch(function () { /* 轮询期间静默失败 */ });
  }

  function renderDocDetail(data, query) {
    var doc = (data && data.document) || {};
    var sections = (data && data.sections) || [];
    drawerTitle.textContent = doc.title || doc.file_name || '文献详情';

    var tags = Array.isArray(doc.tags) ? doc.tags : [];
    var kv = [
      ['来源', doc.source || '—'],
      ['文件', (doc.file_name || '—') + (doc.file_size ? '（' + fmtBytes(doc.file_size) + '）' : '')],
      ['状态', statusBadge(doc.status) + (doc.stage ? ' <span class="muted small">' + esc(doc.stage) + '</span>' : '')],
      ['页数', doc.page_count ? num(doc.page_count) : '—'],
      ['段落', num(doc.chunk_count)],
      ['Token', num(doc.token_count)],
      ['解析器', doc.parser || '—'],
      ['向量化', doc.embed_provider || '—'],
      ['标签', tags.length ? tags.map(function (t) { return '<span class="badge info">' + esc(t) + '</span>'; }).join(' ') : '—'],
      ['创建时间', fmtDate(doc.created_at)]
    ];

    var html = '';
    if (doc.status === 'failed' && doc.error_message) {
      html += '<div class="err-line" style="margin-bottom:14px">' + ICONS.alert + ' ' + esc(doc.error_message) + '</div>';
    }
    if (isProcessing(doc.status)) {
      html += '<div class="cap-tip" style="margin-bottom:14px">正在' +
        esc((STATUS_MAP[doc.status] || {}).text || '处理') + '，页面会自动刷新进度…</div>';
    }
    if (doc.abstract) {
      html += '<div class="quote-box" style="margin-bottom:16px">' + esc(doc.abstract) + '</div>';
    }
    html += '<dl class="kv">' + kv.map(function (p) {
      return '<dt>' + esc(p[0]) + '</dt><dd>' + p[1] + '</dd>';
    }).join('') + '</dl>';

    html += '<div style="display:flex;gap:8px;margin:16px 0 4px;flex-wrap:wrap">' +
      '<button class="btn btn-ghost btn-sm" id="ddReingest" type="button">' + ICONS.refresh + ' 重新索引</button>' +
      '<button class="btn btn-danger btn-sm" id="ddDelete" type="button">' + ICONS.trash + ' 删除</button>' +
      '</div>';

    // 章节树
    html += '<div class="sec-block" style="margin-top:20px">' +
      '<div class="sec-h3">' + ICONS.layers + ' 章节结构 <span class="badge">' + num(sections.length) + '</span></div>';
    if (!sections.length) {
      html += '<p class="muted small">该文献暂无章节结构（纯文本切分）。</p>';
    } else {
      html += '<div class="tree">' + sections.map(function (s) {
        var path = Array.isArray(s.section_path) ? s.section_path.join(' / ') : (s.section_path || '');
        var indent = Math.max(0, Number(s.level || 1) - 1) * 12;
        return '<div class="tree-node" style="padding-left:' + (9 + indent) + 'px" title="' + esc(path || s.section_title || '') + '">' +
          '<span class="tree-lv">L' + esc(s.level || 1) + '</span>' +
          '<span class="tree-title">' + esc(s.section_title || s.section_id || '未命名章节') + '</span>' +
          (s.page_start ? '<span class="tree-page">' + esc(pageRange(s.page_start, s.page_end)) + '</span>' : '') +
          '</div>';
      }).join('') + '</div>';
    }
    html += '</div>';

    // 版面配图：ppsV3 裁出的图表/表格截图
    var artifacts = (doc.meta && doc.meta.artifacts) || {};
    var docImages = normImages(artifacts.images);
    if (docImages.length) {
      html += '<div class="sec-block" style="margin-top:20px">' +
        '<div class="sec-h3">' + ICONS.image + ' 版面配图 <span class="badge">' + num(docImages.length) + '</span></div>' +
        '<p class="muted small" style="margin:0 0 10px">由 ppsV3 版面解析从原文裁出的图表与表格，点击可查看原图。</p>' +
        imagesHtml(docImages) +
        '</div>';
    }

    // 段落
    html += '<div class="sec-block">' +
      '<div class="sec-h3">' + ICONS.file + ' 段落列表</div>' +
      '<div class="search-box" style="max-width:none;margin-bottom:10px">' +
        '<span style="position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--ink-3)">' + ICONS.search + '</span>' +
        '<input class="input" id="chunkSearch" style="padding-left:34px" placeholder="在本文献内搜索段落…" value="' + esc(query || '') + '">' +
      '</div>' +
      '<div id="chunkList"><div class="sk" style="height:40px"></div></div>' +
      '</div>';

    drawerBody.innerHTML = html;

    $('#ddReingest', drawerBody).addEventListener('click', function () {
      reingestDoc(doc.id);
    });
    $('#ddDelete', drawerBody).addEventListener('click', function () {
      deleteDoc(doc.id);
    });

    var cs = $('#chunkSearch', drawerBody);
    cs.addEventListener('input', debounce(function () {
      state.docDetail.query = cs.value;
      loadChunks(doc.id, cs.value);
    }, 300));

    loadChunks(doc.id, query || '');
  }

  function loadChunks(docId, q) {
    var qs = '?limit=100';
    if (q) qs += '&q=' + encodeURIComponent(q);
    api('/api/documents/' + encodeURIComponent(docId) + '/chunks' + qs).then(function (data) {
      var box = $('#chunkList', drawerBody);
      if (!box) return;
      var items = (data && data.items) || [];
      if (!items.length) {
        box.innerHTML = '<p class="muted small">' + (q ? '没有命中该关键词的段落。' : '暂无段落。') + '</p>';
        return;
      }
      box.innerHTML = '<div class="chunk-list">' + items.map(function (c) {
        var path = Array.isArray(c.section_path) ? c.section_path.join(' / ') : (c.section_path || '');
        var parts = splitImages(c.content);
        var imgs = parts.imgs.length ? parts.imgs : normImages(c.images);
        return '<div class="chunk-card" data-chunk="' + esc(c.chunk_id) + '">' +
          '<div class="chunk-top">' +
            (c.section_title ? '<span class="badge info">' + esc(c.section_title) + '</span>' : '') +
            (c.page_start ? '<span>' + esc(pageRange(c.page_start, c.page_end)) + '</span>' : '') +
            '<span>' + num(c.token_count) + ' token</span>' +
            (c.embedding_status ? '<span class="badge">' + esc(c.embedding_status) + '</span>' : '') +
            (imgs.length ? '<span class="badge">' + num(imgs.length) + ' 图</span>' : '') +
          '</div>' +
          (path ? '<div class="chunk-path">' + esc(path) + '</div>' : '') +
          '<div class="chunk-text">' + esc(parts.text) + '</div>' +
          imagesHtml(imgs) +
          '</div>';
      }).join('') + '</div>';

      $$('.chunk-card', box).forEach(function (el) {
        el.addEventListener('click', function () {
          openEvidence(el.getAttribute('data-chunk'));
        });
      });
    }).catch(function (err) {
      var box = $('#chunkList', drawerBody);
      if (box) box.innerHTML = '<p class="err-line">' + esc(err.message) + '</p>';
    });
  }

  /* ---- 证据溯源抽屉 ---- */

  var evidenceCache = {};

  function openEvidence(chunkId, quote, cached) {
    if (!chunkId) { toast('该引用缺少段落标识', 'err'); return; }
    function paint(data) {
      var chunk = (data && data.chunk) || {};
      var document_ = (data && data.document) || {};
      var ctx = (data && data.context) || {};
      var parent = ctx.parent_section || {};
      var neighbors = Array.isArray(ctx.neighbors) ? ctx.neighbors : [];

      var idx = -1;
      neighbors.forEach(function (n, i) { if (n && n.chunk_id === chunk.chunk_id) idx = i; });
      var prev = idx > 0 ? neighbors[idx - 1] : null;
      var next = (idx >= 0 && idx < neighbors.length - 1) ? neighbors[idx + 1] : null;

      var path = Array.isArray(chunk.section_path) ? chunk.section_path : [];
      var pathHtml = path.length ? path.map(function (p) { return esc(p); }).join(' <span style="color:var(--ink-3)">/</span> ') : '—';

      var html = '';
      html += '<div class="doc-meta-row" style="margin-bottom:12px">' +
        '<span class="badge info">' + esc(document_.title || chunk.document_title || '未知文献') + '</span>' +
        (chunk.section_title ? '<span class="badge">' + esc(chunk.section_title) + '</span>' : '') +
        (chunk.page_start ? '<span class="badge">' + esc(pageRange(chunk.page_start, chunk.page_end)) + '</span>' : '') +
        (scoreText(chunk.score) ? '<span class="badge">相关度 ' + esc(scoreText(chunk.score)) + '</span>' : '') +
        '</div>';

      var cparts = splitImages(chunk.content);
      var cimgs = cparts.imgs.length ? cparts.imgs : normImages(chunk.images);
      html += '<div class="sec-h3">原文片段</div>' +
        '<div class="quote-box" id="evContent">' + highlightIn(cparts.text, quote) + '</div>' +
        imagesHtml(cimgs);

      html += '<div style="display:flex;gap:8px;margin:12px 0 20px">' +
        '<button class="btn btn-ghost btn-sm" id="evCopy" type="button">' + ICONS.copy + ' 复制原文</button>' +
        (chunk.token_count ? '<span class="badge">' + num(chunk.token_count) + ' token</span>' : '') +
        (chunk.parent_key ? '<span class="badge">' + esc(chunk.parent_key) + '</span>' : '') +
        '</div>';

      html += '<div class="sec-block"><div class="sec-h3">章节上下文</div>' +
        '<dl class="kv">' +
        '<dt>章节标题</dt><dd>' + esc(parent.section_title || chunk.section_title || '—') + '</dd>' +
        '<dt>章节路径</dt><dd>' + pathHtml + '</dd>' +
        '<dt>层级</dt><dd>' + esc(parent.level || '—') + '</dd>' +
        '<dt>页码范围</dt><dd>' + esc(pageRange(parent.page_start !== undefined ? parent.page_start : chunk.page_start,
                                              parent.page_end !== undefined ? parent.page_end : chunk.page_end) || '—') + '</dd>' +
        (parent.preview ? '<dt>章节摘要</dt><dd>' + esc(parent.preview) + '</dd>' : '') +
        '</dl></div>';

      html += '<div class="sec-block"><div class="sec-h3">相邻段落 <span class="badge">' + num(neighbors.length) + '</span></div>';
      if (!neighbors.length) {
        html += '<p class="muted small">没有相邻段落信息。</p>';
      } else {
        html += '<div class="chunk-list">' + neighbors.map(function (n) {
          var isCur = n.chunk_id === chunk.chunk_id;
          return '<div class="chunk-card" data-nb="' + esc(n.chunk_id) + '" style="' +
            (isCur ? 'border-color:var(--copper);background:var(--copper-soft)' : '') + '">' +
            '<div class="chunk-top">' +
              (isCur ? '<span class="badge info">当前</span>' : '') +
              (n.section_title ? '<span class="badge">' + esc(n.section_title) + '</span>' : '') +
              (n.page_start ? '<span>' + esc(pageRange(n.page_start, n.page_end)) + '</span>' : '') +
            '</div>' +
            '<div class="chunk-text">' + esc(n.content || '') + '</div>' +
            '</div>';
        }).join('') + '</div>';
      }
      html += '</div>';

      html += '<div class="nav-neighbors" style="margin-top:16px">' +
        '<button class="btn btn-ghost btn-sm" id="evPrev" type="button" ' + (prev ? '' : 'disabled') + '>← 上一块</button>' +
        '<button class="btn btn-ghost btn-sm" id="evNext" type="button" ' + (next ? '' : 'disabled') + '>下一块 →</button>' +
        '</div>';

      openDrawer('证据溯源', html);

      var copyBtn = $('#evCopy', drawerBody);
      if (copyBtn) copyBtn.addEventListener('click', function () {
        copyText(chunk.content || '').then(function (ok) {
          copyBtn.innerHTML = ok ? (ICONS.copyOk + ' 已复制') : (ICONS.copy + ' 复制原文');
          setTimeout(function () { copyBtn.innerHTML = ICONS.copy + ' 复制原文'; }, 1600);
        });
      });
      if (prev) $('#evPrev', drawerBody).addEventListener('click', function () {
        openEvidence(prev.chunk_id, '', { chunk: prev, document: document_, context: ctx });
      });
      if (next) $('#evNext', drawerBody).addEventListener('click', function () {
        openEvidence(next.chunk_id, '', { chunk: next, document: document_, context: ctx });
      });
      $$('.chunk-card[data-nb]', drawerBody).forEach(function (el) {
        el.addEventListener('click', function () {
          var cid = el.getAttribute('data-nb');
          var target = null;
          neighbors.forEach(function (n) { if (n.chunk_id === cid) target = n; });
          if (target && target.chunk_id !== chunk.chunk_id) {
            openEvidence(cid, '', { chunk: target, document: document_, context: ctx });
          }
        });
      });
    }

    if (cached) { paint(cached); return; }
    if (evidenceCache[chunkId]) { paint(evidenceCache[chunkId]); return; }

    openDrawer('证据溯源', '<div class="sk" style="height:14px;width:70%;margin-bottom:10px"></div>' +
      '<div class="sk" style="height:80px;margin-bottom:10px"></div>' +
      '<div class="sk" style="height:14px;width:50%"></div>');

    api('/api/chunks/' + encodeURIComponent(chunkId)).then(function (data) {
      evidenceCache[chunkId] = data;
      paint(data);
    }).catch(function (err) {
      openDrawer('证据溯源', '<p class="err-line">' + esc(err.message) + '</p>');
    });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }).catch(function () {
        return fallbackCopy(text);
      });
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  /* ---- 上传 ---- */

  function handleFiles(files) {
    var list = Array.prototype.slice.call(files || []);
    if (!list.length) return;
    list.forEach(uploadOne);
  }

  function uploadOne(file) {
    var queue = $('#uploadQueue');
    var key = 'up_' + Math.random().toString(36).slice(2, 9);
    var wrap = document.createElement('div');
    wrap.className = 'up-item';
    wrap.innerHTML =
      '<div class="up-top"><span style="color:var(--copper);flex:none">' + ICONS.file + '</span>' +
      '<span class="up-name">' + esc(file.name) + '</span>' +
      '<span class="up-status muted small">0%</span></div>' +
      '<div class="up-bar"><i style="width:0%"></i></div>';
    queue.appendChild(wrap);
    var bar = wrap.querySelector('.up-bar > i');
    var st = wrap.querySelector('.up-status');

    var fd = new FormData();
    fd.append('file', file);

    var xhr = new XMLHttpRequest();
    xhr.open('POST', API + '/api/documents/upload');
    xhr.upload.onprogress = function (e) {
      if (!e.lengthComputable) return;
      var pct = Math.round(e.loaded / e.total * 100);
      bar.style.width = pct + '%';
      st.textContent = pct + '%';
    };
    xhr.onload = function () {
      var payload = null;
      try { payload = JSON.parse(xhr.responseText); } catch (e) { payload = null; }
      if (xhr.status >= 200 && xhr.status < 300 && payload && payload.success !== false) {
        bar.style.width = '100%';
        st.textContent = '已上传';
        var d = (payload.data && payload.data.document) || null;
        toast('《' + ((d && (d.title || d.file_name)) || file.name) + '》已加入处理队列', 'ok');
        loadDocs();
        setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 2600);
      } else {
        var msg = (payload && payload.error && payload.error.message) || ('上传失败（HTTP ' + xhr.status + '）');
        st.textContent = '失败';
        wrap.insertAdjacentHTML('beforeend', '<div class="up-err">' + esc(msg) + '</div>');
        toast(msg, 'err', 3600);
      }
    };
    xhr.onerror = function () {
      st.textContent = '失败';
      wrap.insertAdjacentHTML('beforeend', '<div class="up-err">网络错误，上传未完成。</div>');
      toast('网络错误，上传未完成', 'err');
    };
    xhr.send(fd);
  }

  function openTextModal() {
    openModal({
      title: '粘贴文本建库',
      body:
        '<div class="field"><label class="field-label" for="mtTitle">标题 *</label>' +
        '<input class="input" id="mtTitle" placeholder="例如：Al-Cu-Li 合金时效析出行为综述"></div>' +
        '<div class="field"><label class="field-label" for="mtSource">来源</label>' +
        '<input class="input" id="mtSource" placeholder="期刊 / 课题组 / 链接"></div>' +
        '<div class="field"><label class="field-label" for="mtTags">标签</label>' +
        '<input class="input" id="mtTags" placeholder="铝合金, 析出相（逗号分隔）"></div>' +
        '<div class="field"><label class="field-label" for="mtContent">正文 *</label>' +
        '<textarea class="textarea" id="mtContent" rows="10" placeholder="把论文正文、实验记录或笔记粘贴到这里…"></textarea>' +
        '<div class="field-note" id="mtCount">0 字</div></div>',
      actions: [
        { text: '取消', onClick: function (c) { c.close(); } },
        {
          text: '开始建库', cls: 'btn-primary',
          onClick: function (c) {
            var title = c.val('mtTitle');
            var content = c.val('mtContent');
            if (!title) { toast('请填写标题', 'err'); return; }
            if (!content) { toast('请粘贴正文内容', 'err'); return; }
            c.close();
            api('/api/documents/text', {
              method: 'POST',
              body: { title: title, content: content, source: c.val('mtSource'), tags: c.val('mtTags') }
            }).then(function () {
              toast('文本已入库，正在解析建索引', 'ok');
              loadDocs();
            }).catch(function (err) { toast(err.message, 'err', 3600); });
          }
        }
      ]
    });
    var ta = $('#mtContent', modalBody);
    var cnt = $('#mtCount', modalBody);
    if (ta && cnt) ta.addEventListener('input', function () {
      cnt.textContent = ta.value.length + ' 字';
    });
  }

  /* ------------------------------------------------------------------ */
  /* 视图：智能问答                                                      */
  /* ------------------------------------------------------------------ */

  function renderConvList() {
    var box = $('#convList');
    if (!box) return;
    if (!state.convs.length) {
      box.innerHTML = '<p class="muted small" style="padding:12px 10px">还没有会话，点击「新建」开始提问。</p>';
      return;
    }
    box.innerHTML = state.convs.map(function (c) {
      return '<div class="conv-item' + (c.id === state.currentConvId ? ' is-active' : '') + '" data-conv="' + esc(c.id) + '">' +
        '<div class="conv-item-title">' + esc(c.title || '未命名会话') + '</div>' +
        '<div class="conv-item-meta"><span>' + num(c.message_count) + ' 条消息</span><span>' + esc(fmtDate(c.updated_at || c.created_at)) + '</span></div>' +
        '<div class="conv-item-actions">' +
          '<button class="btn btn-ghost btn-sm" data-cact="rename" type="button">' + ICONS.edit + ' 重命名</button>' +
          '<button class="btn btn-ghost btn-sm" data-cact="del" type="button">' + ICONS.trash + '</button>' +
        '</div>' +
        '</div>';
    }).join('');

    $$('.conv-item', box).forEach(function (el) {
      el.addEventListener('click', function (e) {
        var act = e.target.closest('[data-cact]');
        var id = el.getAttribute('data-conv');
        if (act) {
          e.stopPropagation();
          if (act.getAttribute('data-cact') === 'rename') renameConv(id);
          else deleteConv(id);
          return;
        }
        selectConv(id);
      });
    });
  }

  function loadConversations() {
    return api('/api/conversations').then(function (data) {
      state.convs = (data && data.items) || [];
      renderConvList();
    });
  }

  function selectConv(id) {
    state.currentConvId = id;
    renderConvList();
    $('#convPane').classList.remove('is-open');
    api('/api/conversations/' + encodeURIComponent(id)).then(function (data) {
      var conv = (data && data.conversation) || {};
      var messages = (data && data.messages) || [];
      $('#chatTitle').textContent = conv.title || '未命名会话';
      $('#chatSub').textContent = num(messages.length) + ' 条消息';
      renderChatActions();
      renderMessages(messages);
    }).catch(function (err) {
      toast(err.message, 'err');
    });
  }

  function renderChatActions() {
    var box = $('#chatActions');
    if (!box) return;
    box.innerHTML = state.currentConvId
      ? '<button class="btn btn-ghost btn-sm" id="convRename" type="button">重命名</button>' +
        '<button class="btn btn-ghost btn-sm" id="convDel" type="button">删除</button>'
      : '';
    if (state.currentConvId) {
      $('#convRename').addEventListener('click', function () { renameConv(state.currentConvId); });
      $('#convDel').addEventListener('click', function () { deleteConv(state.currentConvId); });
    }
  }

  function createConversation(title) {
    return api('/api/conversations', { method: 'POST', body: { title: title || '新的会话' } })
      .then(function (data) {
        var conv = (data && data.conversation) || data || {};
        state.currentConvId = conv.id;
        $('#chatTitle').textContent = conv.title || '新的会话';
        $('#chatSub').textContent = '0 条消息';
        renderChatActions();
        $('#chatMessages').innerHTML = '';
        $('#chatEmpty').hidden = true;
        return loadConversations().then(function () { return conv.id; });
      });
  }

  function renameConv(id) {
    var cur = null;
    state.convs.forEach(function (c) { if (c.id === id) cur = c; });
    openModal({
      title: '重命名会话',
      body: '<div class="field"><label class="field-label" for="cvTitle">会话标题</label>' +
        '<input class="input" id="cvTitle" value="' + esc((cur && cur.title) || '') + '"></div>',
      actions: [
        { text: '取消', onClick: function (c) { c.close(); } },
        {
          text: '保存', cls: 'btn-primary',
          onClick: function (c) {
            var t = c.val('cvTitle');
            if (!t) { toast('标题不能为空', 'err'); return; }
            c.close();
            api('/api/conversations/' + encodeURIComponent(id), { method: 'PATCH', body: { title: t } })
              .then(function () {
                toast('已重命名', 'ok');
                if (state.currentConvId === id) $('#chatTitle').textContent = t;
                loadConversations();
              })
              .catch(function (err) { toast(err.message, 'err'); });
          }
        }
      ]
    });
  }

  function deleteConv(id) {
    confirmModal({
      title: '删除会话',
      message: '该会话及其全部消息都会被删除，不可恢复。',
      okText: '删除',
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      api('/api/conversations/' + encodeURIComponent(id), { method: 'DELETE' })
        .then(function () {
          toast('会话已删除', 'ok');
          if (state.currentConvId === id) {
            state.currentConvId = null;
            $('#chatTitle').textContent = '未选择会话';
            $('#chatSub').textContent = '';
            $('#chatMessages').innerHTML = '';
            renderChatActions();
            showChatEmpty();
          }
          loadConversations();
        })
        .catch(function (err) { toast(err.message, 'err'); });
    });
  }

  function showChatEmpty() {
    var box = $('#chatEmpty');
    box.hidden = false;
    box.innerHTML = '<div class="empty-state">' + emptyArt() +
      '<div class="empty-title">' + (state.convs.length ? '选一个会话，或直接问一个新问题' : '从一个问题开始') + '</div>' +
      '<div class="empty-desc">所有回答都会附上可追溯的原文证据，点击引用即可查看出处与上下文。</div>' +
      '<div class="examples">' + EXAMPLES.map(function (q) {
        return '<button class="example-btn" type="button" data-q="' + esc(q) + '">' + ICONS.arrow + '<span>' + esc(q) + '</span></button>';
      }).join('') + '</div>' +
      '</div>';
    $$('.example-btn', box).forEach(function (b) {
      b.addEventListener('click', function () {
        $('#chatInput').value = b.getAttribute('data-q');
        sendQuestion(b.getAttribute('data-q'));
      });
    });
  }

  function messageHtml(m) {
    var isUser = m.role === 'user';
    var metaBits = [];
    if (!isUser) {
      if (m.model) metaBits.push(esc(m.model));
      else if (m.meta && m.meta.generation_mode === 'extractive') metaBits.push('抽取式降级');
      if (m.latency_ms) metaBits.push(num(m.latency_ms) + ' ms');
      if (Array.isArray(m.citations) && m.citations.length) metaBits.push(num(m.citations.length) + ' 条引用');
    }
    var cites = '';
    if (!isUser && Array.isArray(m.citations) && m.citations.length) {
      cites = '<div class="cites"><div class="cites-title">引用来源</div><div class="cite-list">' +
        m.citations.map(function (c, i) { return citeChipHtml(c, i + 1); }).join('') + '</div></div>';
    }
    return '<div class="msg ' + (isUser ? 'user' : 'assistant') + '" data-msg="' + esc(m.id || '') + '">' +
      '<div class="avatar">' + (isUser ? ICONS.user : ICONS.bot) + '</div>' +
      '<div class="msg-body">' +
        '<div class="bubble"><div class="md">' + renderMarkdown(m.content) + '</div>' + cites + '</div>' +
        (metaBits.length ? '<div class="msg-meta">' + metaBits.join('<span>·</span>') + '</div>' : '') +
      '</div></div>';
  }

  function citeChipHtml(c, i) {
    var sub = [];
    if (c.section_title) sub.push(esc(c.section_title));
    var pr = pageRange(c.page_start, c.page_end);
    if (pr) sub.push(esc(pr));
    if (scoreText(c.score)) sub.push('<span class="cite-score">相关度 ' + esc(scoreText(c.score)) + '</span>');
    var imgs = normImages(c.images);
    if (imgs.length) sub.push(esc(imgs.length) + ' 图');
    var chip = '<button class="cite-chip" type="button" data-cite="' + esc(c.chunk_id || '') +
      '" data-quote="' + esc(c.quote || '') + '">' +
      '<span class="cite-idx">' + esc(i) + '</span>' +
      '<span class="cite-main">' +
        '<span class="cite-doc">' + esc(c.document_title || '未知文献') + '</span>' +
        '<span class="cite-sub">' + (sub.length ? sub.join('<span>·</span>') : '点击查看原文') + '</span>' +
      '</span></button>';
    // 配图放在 button 外：button 内塞 figure 既不合语义，也会干扰点击热区
    return imgs.length ? '<div class="cite-with-media">' + chip + imagesHtml(imgs) + '</div>' : chip;
  }

  function bindCiteChips(root) {
    $$('.cite-chip', root).forEach(function (chip) {
      chip.addEventListener('click', function () {
        openEvidence(chip.getAttribute('data-cite'), chip.getAttribute('data-quote'));
      });
    });
  }

  function renderMessages(messages) {
    var box = $('#chatMessages');
    var empty = $('#chatEmpty');
    if (!messages.length) {
      box.innerHTML = '';
      showChatEmpty();
      return;
    }
    empty.hidden = true;
    empty.innerHTML = '';
    box.innerHTML = messages.map(messageHtml).join('');
    bindCiteChips(box);
    scrollChatBottom(true);
  }

  function scrollChatBottom(instant) {
    var sc = $('#chatScroll');
    if (!sc) return;
    if (instant) sc.scrollTop = sc.scrollHeight;
    else sc.scrollTo({ top: sc.scrollHeight, behavior: 'smooth' });
  }

  /* ---- 流式问答 ---- */

  function sendQuestion(question) {
    question = String(question || '').trim();
    if (!question) return;
    if (state.streaming) { toast('正在生成回答，请稍候', 'info'); return; }

    var ensureConv = state.currentConvId
      ? Promise.resolve(state.currentConvId)
      : createConversation(question.length > 24 ? question.slice(0, 24) + '…' : question);

    ensureConv.then(function (convId) {
      var box = $('#chatMessages');
      $('#chatEmpty').hidden = true;
      $('#chatInput').value = '';
      autoGrow($('#chatInput'));

      // 用户消息（乐观渲染）
      box.insertAdjacentHTML('beforeend', messageHtml({
        id: 'tmp_user', role: 'user', content: question, created_at: new Date().toISOString()
      }));
      scrollChatBottom();

      // 助手占位
      var wrap = document.createElement('div');
      wrap.className = 'msg assistant streaming';
      wrap.innerHTML =
        '<div class="avatar">' + ICONS.bot + '</div>' +
        '<div class="msg-body">' +
          '<div class="bubble">' +
            '<div class="stage" id="stStage"><svg class="spin" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 3a9 9 0 1 0 9 9"/></svg><span id="stText">正在检索…</span></div>' +
            '<div class="evid" id="stEvid" hidden></div>' +
            '<div class="md" id="stAnswer"></div>' +
            '<div id="stCites"></div>' +
          '</div>' +
          '<div class="msg-meta" id="stMeta"></div>' +
        '</div>';
      box.appendChild(wrap);
      scrollChatBottom();

      var elStage = $('#stStage', wrap);
      var elStageText = $('#stText', wrap);
      var elEvid = $('#stEvid', wrap);
      var elAnswer = $('#stAnswer', wrap);
      var elCites = $('#stCites', wrap);
      var elMeta = $('#stMeta', wrap);

      state.streaming = true;
      $('#sendBtn').disabled = true;
      $('#stopBtn').hidden = false;
      var controller = new AbortController();
      state.abort = controller;

      var buffer = '';
      var renderTimer = null;
      function flush() {
        renderTimer = null;
        elAnswer.innerHTML = renderMarkdown(buffer) + '<span class="caret"></span>';
        scrollChatBottom();
      }
      function push(text) {
        buffer += text;
        if (!renderTimer) renderTimer = setTimeout(flush, 45);
      }

      var citations = [];
      var finalMeta = {};

      streamSSE('/api/conversations/' + encodeURIComponent(convId) + '/messages/stream', {
        question: question,
        top_k: state.topK,
        document_ids: state.selectedDocs.slice(),
        temperature: null,
        max_tokens: null
      }, function (name, payload) {
        if (name === 'meta') {
          finalMeta.model = payload.model || '';
          finalMeta.mode = payload.generation_mode || '';
          elStageText.textContent = finalMeta.mode === 'extractive'
            ? '正在抽取式作答…'
            : ('已连接 ' + (payload.model || '模型') + '，正在检索…');
        } else if (name === 'retrieval') {
          var chunks = Array.isArray(payload.chunks) ? payload.chunks : [];
          elStageText.textContent = chunks.length
            ? '已命中 ' + chunks.length + ' 段证据，正在生成…'
            : '未命中相关证据，正在生成…';
          if (chunks.length) {
            elEvid.hidden = false;
            elEvid.innerHTML =
              '<div class="evid-head" id="stEvidHead"><span class="evid-caret">' + ICONS.chevron + '</span>' +
              '<span>检索证据 · ' + chunks.length + ' 段（top_k ' + state.topK + '）</span></div>' +
              '<div class="evid-body">' + chunks.map(function (c, i) {
                var pr = pageRange(c.page_start, c.page_end);
                return '<div class="evid-item" data-cite="' + esc(c.chunk_id || '') + '">' +
                  '<div class="evid-item-top">' +
                    '<span class="cite-idx">' + (i + 1) + '</span>' +
                    '<span class="cite-doc">' + esc(c.document_title || '未知文献') + '</span>' +
                    (c.section_title ? '<span class="badge">' + esc(c.section_title) + '</span>' : '') +
                    (pr ? '<span>' + esc(pr) + '</span>' : '') +
                    (scoreText(c.score) ? '<span class="cite-score">' + esc(scoreText(c.score)) + '</span>' : '') +
                  '</div>' +
                  '<div class="evid-item-text">' + esc(c.content || '') + '</div>' +
                  '</div>';
              }).join('') + '</div>';
            elEvid.classList.add('open');
            var head = $('#stEvidHead', elEvid);
            head.addEventListener('click', function () { elEvid.classList.toggle('open'); });
            $$('.evid-item', elEvid).forEach(function (item) {
              item.addEventListener('click', function () {
                openEvidence(item.getAttribute('data-cite'));
              });
            });
          }
        } else if (name === 'delta') {
          push(payload && payload.text !== undefined ? String(payload.text) : '');
        } else if (name === 'done') {
          var msg = (payload && payload.message) || {};
          citations = Array.isArray(payload.citations) ? payload.citations
            : (Array.isArray(msg.citations) ? msg.citations : []);
          finalMeta.latency = payload.latency_ms || msg.latency_ms || null;
          finalMeta.model = msg.model || finalMeta.model || '';
          finalMeta.mode = payload.generation_mode || finalMeta.mode || '';
        } else if (name === 'error') {
          buffer += (buffer ? '\n\n' : '') + '> 生成失败：' + ((payload && payload.message) || '未知错误');
        }
      }, controller.signal).then(function () {
        finish();
      }).catch(function (err) {
        if (err && err.name === 'AbortError') {
          buffer += (buffer ? '\n\n' : '') + '_（已停止生成）_';
        } else {
          buffer += (buffer ? '\n\n' : '') + '> 出错了：' + (err && err.message ? err.message : '未知错误');
          toast((err && err.message) || '请求失败', 'err', 3600);
        }
        finish();
      });

      function finish() {
        if (renderTimer) { clearTimeout(renderTimer); renderTimer = null; }
        elAnswer.innerHTML = renderMarkdown(buffer);
        elStage.hidden = true;
        var bits = [];
        if (finalMeta.mode === 'extractive' || !finalMeta.model) bits.push(finalMeta.mode === 'extractive' ? '抽取式作答' : (finalMeta.model || ''));
        else bits.push(esc(finalMeta.model));
        if (finalMeta.latency) bits.push(num(finalMeta.latency) + ' ms');
        if (citations.length) bits.push(num(citations.length) + ' 条引用');
        elMeta.innerHTML = bits.filter(Boolean).join('<span>·</span>');
        if (citations.length) {
          elCites.innerHTML = '<div class="cites"><div class="cites-title">引用来源</div><div class="cite-list">' +
            citations.map(function (c, i) { return citeChipHtml(c, i + 1); }).join('') + '</div></div>';
          bindCiteChips(elCites);
        }
        state.streaming = false;
        state.abort = null;
        $('#sendBtn').disabled = false;
        $('#stopBtn').hidden = true;
        scrollChatBottom();
        loadConversations().catch(function () {});
      }

      $('#stopBtn').onclick = function () {
        try { controller.abort(); } catch (e) { /* 已结束 */ }
      };
    }).catch(function (err) {
      toast((err && err.message) || '发送失败', 'err', 3600);
      state.streaming = false;
      $('#sendBtn').disabled = false;
      $('#stopBtn').hidden = true;
    });
  }

  /* ---- 检索设置 ---- */

  function loadDocPicker() {
    return api('/api/documents?limit=200&status=ready').then(function (data) {
      state.allDocs = (data && data.items) || [];
      renderDocPicker();
    }).catch(function () { state.allDocs = []; renderDocPicker(); });
  }

  function renderDocPicker() {
    var box = $('#docPicker');
    if (!box) return;
    if (!state.allDocs.length) {
      box.innerHTML = '<span class="muted small">暂无可用文献，将检索整个知识库。</span>';
      return;
    }
    box.innerHTML = state.allDocs.map(function (d) {
      var on = state.selectedDocs.indexOf(d.id) !== -1;
      return '<button class="dp-item' + (on ? ' is-on' : '') + '" type="button" data-dp="' + esc(d.id) + '">' +
        (on ? '✓ ' : '') + '<span>' + esc(d.title || d.file_name || '未命名') + '</span></button>';
    }).join('');
    $$('.dp-item', box).forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-dp');
        var i = state.selectedDocs.indexOf(id);
        if (i === -1) state.selectedDocs.push(id); else state.selectedDocs.splice(i, 1);
        renderDocPicker();
      });
    });
  }

  function autoGrow(ta) {
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 168) + 'px';
  }

  /* ------------------------------------------------------------------ */
  /* 设置                                                                */
  /* ------------------------------------------------------------------ */

  var settingsState = { groups: [], ppsv3: {}, effective: {} };

  function truthy(v) {
    var s = String(v == null ? '' : v).trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'yes' || s === 'on';
  }

  function setBusy(btn, busy, busyText, idleText) {
    if (!btn) return;
    btn.disabled = !!busy;
    btn.textContent = busy ? busyText : idleText;
  }

  function loadSettings() {
    return api('/api/settings').then(function (data) {
      settingsState.groups = data.groups || [];
      settingsState.ppsv3 = data.ppsv3 || {};
      settingsState.effective = data.effective || {};
      renderSettings();
    });
  }

  function renderSettings() {
    var box = $('#settingsGroups');
    if (!box) return;
    box.innerHTML = settingsState.groups.map(renderSettingsGroup).join('');
    bindSettingsEvents(box);
    renderSettingsChip();
    renderPpsv3Status(null);
  }

  function renderSettingsGroup(group) {
    var fields = group.fields.map(function (f) {
      var control;
      if (f.type === 'bool') {
        control = '<label class="switch">' +
          '<input type="checkbox" data-key="' + esc(f.key) + '"' + (truthy(f.value) ? ' checked' : '') + '>' +
          '<span class="switch-track"><span class="switch-dot"></span></span></label>';
      } else {
        var type = f.secret ? 'password' : (f.type === 'number' ? 'number' : 'text');
        control = '<input class="input" type="' + type + '" data-key="' + esc(f.key) +
          '" value="' + esc(f.value) + '" placeholder="' + esc(f.placeholder || '') +
          '" autocomplete="off" spellcheck="false">';
      }
      // 密钥只在字段已配置时给"已配置"徽章，值本身永远是掩码
      var badge = f.configured
        ? '<span class="set-ok">已配置</span>'
        : (f.secret ? '<span class="set-warn">未配置</span>' : '');
      return '<div class="set-field">' +
        '<div class="set-label-row"><span class="set-label">' + esc(f.label) + '</span>' + badge + '</div>' +
        control + '</div>';
    }).join('');

    var actions = '<div class="set-actions">' +
      '<button class="btn btn-primary btn-sm" data-act="save" type="button">保存并生效</button>' +
      (group.key === 'llm' ? '<button class="btn btn-ghost btn-sm" data-act="test" type="button">测试连接</button>' : '') +
      '</div>';

    return '<section class="panel" data-group="' + esc(group.key) + '">' +
      '<div class="panel-head"><h2 class="panel-title">' + esc(group.title) + '</h2></div>' +
      '<div class="panel-body">' +
        '<p class="hint">' + esc(group.description) + '</p>' +
        '<div class="set-fields">' + fields + '</div>' + actions +
      '</div></section>';
  }

  function bindSettingsEvents(box) {
    $$('[data-act="save"]', box).forEach(function (btn) {
      btn.addEventListener('click', function () {
        saveSettingsGroup(btn.closest('[data-group]'));
      });
    });
    $$('[data-act="test"]', box).forEach(function (btn) {
      btn.addEventListener('click', function () { testLlmConnection(btn); });
    });
  }

  function collectGroupValues(panel) {
    var out = {};
    if (!panel) return out;
    $$('[data-key]', panel).forEach(function (el) {
      out[el.getAttribute('data-key')] = el.type === 'checkbox'
        ? el.checked
        : String(el.value || '').trim();
    });
    return out;
  }

  function saveSettingsGroup(panel) {
    if (!panel) return;
    var payload = collectGroupValues(panel);
    var btn = panel.querySelector('[data-act="save"]');
    setBusy(btn, true, '保存中…', '保存并生效');

    api('/api/settings', { method: 'PUT', body: payload })
      .then(function (data) {
        var n = (data.updated || []).length;
        toast(n ? '已保存 ' + n + ' 项，立即生效' : '没有需要保存的变更', 'ok');
        (data.warnings || []).forEach(function (w) { toast(w, 'warn', 5000); });
        if (data.applied && data.applied.needs_reindex) {
          toast('嵌入方式已改变，建议重新入库文献以重建索引', 'warn', 6000);
        }
        // 顶栏能力徽章要跟着变；meta 置空让下次进总览重新拉取
        renderLlmChip();
        state.meta = null;
        return loadSettings();
      })
      .catch(function (err) { toast('保存失败：' + err.message, 'err', 5000); })
      .then(function () { setBusy(btn, false, '保存中…', '保存并生效'); });
  }

  function testLlmConnection(btn) {
    var panel = document.querySelector('[data-group="llm"]');
    if (!panel) return;
    var payload = collectGroupValues(panel);
    setBusy(btn, true, '测试中…', '测试连接');

    api('/api/settings/test', { method: 'POST', body: payload })
      .then(function (r) {
        if (r.ok) toast('连接成功（' + r.latency_ms + ' ms）' + (r.message ? '：' + r.message : ''), 'ok', 5000);
        else toast('连接失败：' + (r.error || '未知错误'), 'err', 7000);
      })
      .catch(function (err) { toast('测试失败：' + err.message, 'err', 5000); })
      .then(function () { setBusy(btn, false, '测试中…', '测试连接'); });
  }

  function renderSettingsChip() {
    var chip = $('#settingsChip');
    if (!chip) return;
    var eff = settingsState.effective || {};
    chip.textContent = eff.llm_enabled
      ? '大模型已接入 · ' + (eff.llm_model || '')
      : '未配置 Key · 抽取式作答';
    chip.hidden = false;
  }

  function renderPpsv3Status(info) {
    var box = $('#ppsv3Status');
    if (!box) return;
    var p = settingsState.ppsv3 || {};
    var installed = info ? !!info.installed : !!p.python;

    var rows = [
      ['解析脚本', p.script || '-'],
      ['脚本存在', p.script_exists ? '是' : '否'],
      ['已识别解释器', (info && info.python) || p.python || '未识别']
    ];
    if (info) {
      rows.push(['paddleocr', info.installed ? (info.version || '已安装') : '不可用']);
      var dev = info.device || '-';
      if (info.gpu) {
        dev += info.gpu.available
          ? '（CUDA 可用 · ' + num(info.gpu.device_count) + ' 块显卡 · paddle ' +
            esc(info.gpu.paddle_version || '') + '）'
          : '（' + esc(info.gpu.reason || 'CUDA 不可用') + '）';
      }
      rows.push(['推理设备', dev]);
    }

    box.innerHTML = '<div class="kv set-kv">' +
      rows.map(function (r) {
        return '<span class="muted">' + esc(r[0]) + '</span><span>' + esc(String(r[1])) + '</span>';
      }).join('') + '</div>' +
      '<div>' + (installed
        ? '<span class="set-ok">环境就绪</span>'
        : '<span class="set-warn">未找到可用环境，PDF 将使用内置解析器</span>') + '</div>';
  }

  function detectPpsv3() {
    var btn = $('#ppsv3DetectBtn');
    setBusy(btn, true, '检测中…', '重新检测');
    var payload = {};
    var panel = document.querySelector('[data-group="ppsv3"]');
    if (panel) {
      var vals = collectGroupValues(panel);
      // 带上表单里的设备/精度：用户可能刚改了还没保存，检测要反映当前填写值
      if (vals.MSRAG_PPSV3_PYTHON) payload.python = vals.MSRAG_PPSV3_PYTHON;
      if (vals.MSRAG_PPSV3_DEVICE) payload.device = vals.MSRAG_PPSV3_DEVICE;
      if (typeof vals.MSRAG_PPSV3_ACCURATE === 'boolean') {
        payload.accurate = vals.MSRAG_PPSV3_ACCURATE;
      }
    }
    api('/api/settings/ppsv3/detect', { method: 'POST', body: payload })
      .then(function (info) {
        settingsState.ppsv3 = info.cached || settingsState.ppsv3;
        renderPpsv3Status(info);
        toast(info.installed
          ? '已找到 ppsV3 环境：' + (info.python || '')
          : '未找到可用环境（需 Python 3.9~3.11 + paddleocr）',
          info.installed ? 'ok' : 'warn', 6000);
      })
      .catch(function (err) { toast('检测失败：' + err.message, 'err', 5000); })
      .then(function () { setBusy(btn, false, '检测中…', '重新检测'); });
  }

  /* ------------------------------------------------------------------ */
  /* 路由                                                                */
  /* ------------------------------------------------------------------ */

  var KNOWN_ROUTES = ['dashboard', 'library', 'assistant', 'settings'];

  function routeFromHash() {
    var h = String(location.hash || '').replace(/^#\/?/, '').split('?')[0];
    if (KNOWN_ROUTES.indexOf(h) !== -1) return h;
    return 'dashboard';
  }

  function applyRoute(force) {
    var route = routeFromHash();
    var changed = route !== state.route;
    state.route = route;

    $$('.nav-item').forEach(function (a) {
      a.classList.toggle('is-active', a.getAttribute('data-route') === route);
    });

    KNOWN_ROUTES.forEach(function (r) {
      var el = $('#view-' + r);
      if (el) el.hidden = (r !== route);
    });

    if (route === 'dashboard') {
      if (state.meta) renderDashboard();
      else loadMeta().then(renderDashboard).catch(function (err) { toast(err.message, 'err', 4000); });
    } else if (route === 'library') {
      loadDocs().catch(function (err) { toast(err.message, 'err', 4000); });
    } else if (route === 'assistant') {
      loadConversations().catch(function (err) { toast(err.message, 'err', 4000); });
      if (!state.allDocs.length) loadDocPicker();
      else renderDocPicker();
      if (!state.currentConvId && !$('#chatMessages').children.length) showChatEmpty();
      consumePrefill();
    } else if (route === 'settings') {
      loadSettings().catch(function (err) { toast(err.message, 'err', 4000); });
    }
    if (changed || force) scrollChatBottom(true);
  }

  function consumePrefill() {
    var q = '';
    try { q = localStorage.getItem(LS_PREFILL) || ''; } catch (e) { q = ''; }
    if (!q) return;
    try { localStorage.removeItem(LS_PREFILL); } catch (e) { /* ignore */ }
    var ta = $('#chatInput');
    if (ta) {
      ta.value = q;
      autoGrow(ta);
      setTimeout(function () { ta.focus(); }, 120);
    }
  }

  /* ------------------------------------------------------------------ */
  /* 初始化                                                              */
  /* ------------------------------------------------------------------ */

  function bindGlobal() {
    // 主题
    $('#themeToggle').addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next);
    });

    // 抽屉关闭
    $('#drawerClose').addEventListener('click', closeDrawer);
    $('#drawerBackdrop').addEventListener('click', closeDrawer);
    $('#modalClose').addEventListener('click', closeModal);
    $('#modalBackdrop').addEventListener('click', closeModal);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!modalRoot.hidden) closeModal();
        else if (!drawerRoot.hidden) closeDrawer();
        else $('#convPane').classList.remove('is-open');
      }
    });

    // 设置：ppsV3 环境检测
    if ($('#ppsv3DetectBtn')) {
      $('#ppsv3DetectBtn').addEventListener('click', detectPpsv3);
    }

    // 总览：快速提问
    $('#quickAskForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = $('#quickAskInput').value.trim();
      if (!v) { toast('请输入你想问的问题', 'info'); return; }
      try { localStorage.setItem(LS_PREFILL, v); } catch (err) { /* ignore */ }
      location.hash = '#/assistant';
      applyRoute();
    });

    // 文献库：上传
    var dz = $('#dropzone');
    var fi = $('#fileInput');
    dz.addEventListener('click', function () { fi.click(); });
    dz.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); }
    });
    fi.addEventListener('change', function () {
      handleFiles(fi.files);
      fi.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('is-over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('is-over'); });
    });
    dz.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files) handleFiles(e.dataTransfer.files);
    });
    // 阻止整页被浏览器接管拖放
    ['dragover', 'drop'].forEach(function (ev) {
      window.addEventListener(ev, function (e) { e.preventDefault(); });
    });

    $('#pasteBtn').addEventListener('click', openTextModal);

    var search = $('#libSearch');
    search.addEventListener('input', debounce(function () {
      state.libQuery = search.value.trim();
      loadDocs();
    }, 300));
    $('#libStatus').addEventListener('change', function () {
      state.libStatus = $('#libStatus').value;
      loadDocs();
    });
    $('#libRefresh').addEventListener('click', function () {
      loadDocs().then(function () { toast('已刷新', 'ok', 1400); });
    });

    // 问答
    $('#convNew').addEventListener('click', function () {
      createConversation('新的会话').then(function () {
        $('#chatMessages').innerHTML = '';
        showChatEmpty();
        var ta = $('#chatInput');
        if (ta) ta.focus();
      }).catch(function (err) { toast(err.message, 'err'); });
    });
    $('#convToggle').addEventListener('click', function () {
      $('#convPane').classList.toggle('is-open');
    });

    var ta = $('#chatInput');
    ta.addEventListener('input', function () { autoGrow(ta); });
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        sendQuestion(ta.value);
      }
    });
    $('#sendBtn').addEventListener('click', function () { sendQuestion($('#chatInput').value); });
    $('#stopBtn').addEventListener('click', function () {
      if (state.abort) { try { state.abort.abort(); } catch (e) { /* ignore */ } }
    });

    $('#settingsToggle').addEventListener('click', function () {
      var s = $('#composerSettings');
      s.hidden = !s.hidden;
    });
    var range = $('#topKRange');
    var numIn = $('#topKInput');
    range.addEventListener('input', function () {
      numIn.value = range.value;
      state.topK = Number(range.value) || 6;
      try { localStorage.setItem(LS_TOPK, String(state.topK)); } catch (e) { /* ignore */ }
    });
    numIn.addEventListener('change', function () {
      var v = Math.max(1, Math.min(20, Number(numIn.value) || 6));
      numIn.value = String(v);
      range.value = String(v);
      state.topK = v;
      try { localStorage.setItem(LS_TOPK, String(v)); } catch (e) { /* ignore */ }
    });

    window.addEventListener('hashchange', function () { applyRoute(); });
  }

  function init() {
    modalRoot = $('#modalRoot');
    modalTitle = $('#modalTitle');
    modalBody = $('#modalBody');
    modalFoot = $('#modalFoot');
    drawerRoot = $('#drawerRoot');
    drawerTitle = $('#drawerTitle');
    drawerBody = $('#drawerBody');

    initTheme();

    var topK = 6;
    try {
      var saved = parseInt(localStorage.getItem(LS_TOPK), 10);
      if (saved && saved >= 1 && saved <= 20) topK = saved;
    } catch (e) { /* ignore */ }
    state.topK = topK;
    $('#topKRange').value = String(topK);
    $('#topKInput').value = String(topK);

    $('#settingsToggle').innerHTML = ICONS.sliders;
    $('#convToggle').innerHTML = ICONS.menu;

    var quickTags = $('#quickTags');
    if (quickTags) {
      quickTags.innerHTML = EXAMPLES.slice(0, 3).map(function (q) {
        return '<button class="qtag" type="button" data-q="' + esc(q) + '">' + esc(q) + '</button>';
      }).join('');
      $$('.qtag', quickTags).forEach(function (b) {
        b.addEventListener('click', function () {
          $('#quickAskInput').value = b.getAttribute('data-q');
          $('#quickAskForm').dispatchEvent(new Event('submit', { cancelable: true }));
        });
      });
    }

    bindGlobal();

    loadMeta().catch(function (err) {
      toast('无法连接后端：' + err.message, 'err', 4000);
    }).then(function () {
      renderLlmChip();
      applyRoute();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

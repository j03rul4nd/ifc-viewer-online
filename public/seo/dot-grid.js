/* ───────────────────────────────────────────────────────────────────────────
   dot-grid.js — progressive-enhancement bundle for the static SEO pages.

   The crawlable landing pages are plain static HTML (no React, no bundler) so
   they stay fast and fully indexable. This single script — loaded by every SEO
   page — layers on the polish *without* touching crawled content. Everything
   degrades gracefully: with JS off (or blocked, or reduced-motion) the page is
   fully visible and usable; nothing here is required to read the page.

   Bundles:
     1. DotField   — interactive dot-field hero backdrop (vanilla port of the
                     React Bits "DotField") on <canvas data-dot-grid>.
     2. Reveal     — scroll-reveal (React Bits "AnimatedContent" feel). Hidden
                     state is injected by JS, so no-JS visitors/crawlers always
                     see all content. Hero is never hidden (it carries the LCP).
     3. Spotlight  — cursor-follow radial highlight on .step cards (React Bits
                     "SpotlightCard"). Pointer-fine devices only.
     4. GUID tool  — an in-browser IFC GlobalId toolkit, wired only if the page
                     contains #guidBatchInput. Batch-validates pasted GlobalIds,
                     finds duplicates across the set (the exact error this page
                     is about), and generates spec-compliant GUIDs — all client
                     side, mirroring the product's RULE_INVALID_GUID_FORMAT,
                     RULE_DUPLICATE_GUID and generateIfcGuid auto-fix.
   ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var mql = window.matchMedia ? window.matchMedia.bind(window) : null;
  var prefersReduced = mql && mql('(prefers-reduced-motion: reduce)').matches;
  var coarse = mql && mql('(pointer: coarse)').matches;

  var GUID_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
  var GUID_RE = /^[0-9A-Za-z_$]{22}$/;

  // ── Injected styles (so pages need only the one <script> tag) ────────────────
  function injectStyles() {
    var css =
      /* reveal */
      '[data-sr]{opacity:0;transform:translateY(16px);' +
      'transition:opacity .55s cubic-bezier(.4,0,.2,1),transform .55s cubic-bezier(.4,0,.2,1);will-change:opacity,transform}' +
      '[data-sr].sr-in{opacity:1;transform:none}' +
      /* spotlight on .step cards */
      '.step{position:relative;overflow:hidden}' +
      '.step::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:0;' +
      'transition:opacity .3s ease;background:radial-gradient(240px circle at var(--mx,50%) var(--my,50%),rgba(94,106,210,0.16),transparent 62%)}' +
      '.step:hover::after{opacity:1}' +
      /* GUID toolkit */
      '.guid-tool{margin-top:22px;display:grid;gap:22px;max-width:620px}' +
      '.guid-label{display:block;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:9px}' +
      '.guid-tool textarea,.guid-gen input{width:100%;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.12);' +
      'border-radius:10px;padding:12px 14px;font-family:"Geist Mono","Cascadia Code","Fira Code",monospace;font-size:13.5px;' +
      'color:#E8E8F0;letter-spacing:0.02em;outline:none;transition:border-color .15s,box-shadow .15s}' +
      '.guid-tool textarea{resize:vertical;min-height:96px;line-height:1.6}' +
      '.guid-tool textarea::placeholder,.guid-gen input::placeholder{color:rgba(255,255,255,0.26)}' +
      '.guid-tool textarea:focus,.guid-gen input:focus{border-color:rgba(94,106,210,0.6);box-shadow:0 0 0 3px rgba(94,106,210,0.15)}' +
      '.guid-summary{margin-top:11px;font-size:13px;line-height:1.5;font-family:"Geist Mono","Cascadia Code",monospace;min-height:1.1em}' +
      '.guid-summary .g-ok{color:#7ED3A0}.guid-summary .g-warn{color:#F5C16B}.guid-summary .g-bad{color:#FF8082}.guid-summary .g-dim{color:rgba(255,255,255,0.4)}' +
      '.guid-detail{margin-top:8px;display:flex;flex-direction:column;gap:5px}' +
      '.guid-detail .g-line{font-size:12px;font-family:"Geist Mono","Cascadia Code",monospace;color:rgba(255,255,255,0.55);' +
      'display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}' +
      '.guid-detail .g-tag{flex-shrink:0;font-size:10px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;padding:2px 7px;border-radius:5px}' +
      '.guid-detail .g-tag.warn{background:rgba(245,166,35,0.14);color:#F5C16B;border:1px solid rgba(245,166,35,0.3)}' +
      '.guid-detail .g-tag.bad{background:rgba(255,77,79,0.13);color:#FF8082;border:1px solid rgba(255,77,79,0.3)}' +
      '.guid-detail .g-tag.dup{background:rgba(94,106,210,0.15);color:#9AA4EE;border:1px solid rgba(94,106,210,0.32)}' +
      '.guid-detail .g-val{color:rgba(255,255,255,0.78);word-break:break-all}' +
      '.guid-gen{display:flex;gap:10px;flex-wrap:wrap;align-items:stretch}' +
      '.guid-gen input{flex:1 1 240px;min-width:0}' +
      '.guid-gen button{flex-shrink:0;cursor:pointer;border-radius:10px;padding:0 18px;font-size:13px;font-weight:600;' +
      'font-family:inherit;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);color:#E8E8F0;transition:background .15s,border-color .15s,color .15s}' +
      '.guid-gen button:hover{background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.22)}' +
      '.guid-gen button#guidGenBtn{background:#5E6AD2;border-color:#5E6AD2;color:#fff}' +
      '.guid-gen button#guidGenBtn:hover{background:#4F5ABF;border-color:#4F5ABF}' +
      '.guid-gen button:disabled{opacity:0.45;cursor:default}' +
      /* IFC file inspector */
      '.ifc-inspect{margin-top:22px;max-width:620px}' +
      '.ifc-drop{display:flex;flex-direction:column;align-items:center;gap:7px;text-align:center;padding:30px 20px;' +
      'border:1.5px dashed rgba(255,255,255,0.16);border-radius:12px;background:rgba(255,255,255,0.02);cursor:pointer;transition:border-color .15s,background .15s}' +
      '.ifc-drop:hover,.ifc-drop.drag{border-color:rgba(94,106,210,0.55);background:rgba(94,106,210,0.05)}' +
      '.ifc-drop svg{color:#8B96E9;opacity:0.85}' +
      '.ifc-drop-text{font-size:14px;color:rgba(255,255,255,0.72)}' +
      '.ifc-drop-link{color:#8B96E9;text-decoration:underline}' +
      '.ifc-drop-note{font-size:11px;color:rgba(255,255,255,0.3)}' +
      '.ifc-report{margin-top:16px;border:1px solid rgba(255,255,255,0.08);border-radius:12px;overflow:hidden}' +
      '.ifc-row{display:flex;justify-content:space-between;gap:16px;padding:11px 16px;border-bottom:1px solid rgba(255,255,255,0.05)}' +
      '.ifc-row:last-child{border-bottom:none}' +
      '.ifc-row .k{color:rgba(255,255,255,0.42);font-size:12px;flex-shrink:0}' +
      '.ifc-row .v{color:#E8E8F0;font-size:13px;font-family:"Geist Mono","Cascadia Code",monospace;text-align:right;word-break:break-word}' +
      '.ifc-badge{display:inline-block;padding:2px 9px;border-radius:6px;background:rgba(94,106,210,0.15);color:#9AA4EE;border:1px solid rgba(94,106,210,0.32);font-weight:600;font-size:12px;font-family:"Geist Mono","Cascadia Code",monospace}' +
      '.ifc-err{color:#FF8082;font-size:13px;padding:14px 16px}' +
      '.ifc-actions{padding:14px 16px;display:flex;gap:14px;flex-wrap:wrap;align-items:center;background:rgba(255,255,255,0.02);border-top:1px solid rgba(255,255,255,0.05)}' +
      '.ifc-actions a{font-size:13px;font-weight:600;color:#8B96E9}' +
      '.ifc-actions a:hover{color:#fff}' +
      /* comparison filter chips */
      '.cmp-filter{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 20px}' +
      '.cmp-chip{cursor:pointer;font-family:inherit;font-size:12.5px;font-weight:500;padding:6px 14px;border-radius:100px;' +
      'border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.03);color:rgba(255,255,255,0.6);transition:color .15s,border-color .15s,background .15s}' +
      '.cmp-chip:hover{color:#fff;border-color:rgba(255,255,255,0.25)}' +
      '.cmp-chip.is-active{background:rgba(94,106,210,0.15);border-color:rgba(94,106,210,0.5);color:#9AA4EE}' +
      '.compare-table tbody tr{transition:background .15s}' +
      '.compare-table tbody tr:hover{background:rgba(94,106,210,0.06)}' +
      '@media (prefers-reduced-motion: reduce){[data-sr]{opacity:1;transform:none;transition:none}.step::after{transition:none}}';
    var s = document.createElement('style');
    s.setAttribute('data-seo-enhance', '');
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ── 1. DotField backdrop ─────────────────────────────────────────────────────
  function initCanvas(canvas) {
    var ctx = canvas.getContext && canvas.getContext('2d', { alpha: true });
    var parent = canvas.parentElement;
    if (!ctx || !parent) return;

    var color = (canvas.getAttribute('data-color') || '94,106,210').trim();
    var spacing = parseInt(canvas.getAttribute('data-spacing') || '28', 10);
    var dotRadius = parseFloat(canvas.getAttribute('data-radius') || '1.4');
    var interactive = !coarse && !prefersReduced;

    var CURSOR_RADIUS = 170, BULGE = 32, BASE_ALPHA = 0.16, GLOW_ALPHA = 0.5;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0, dots = [], t = 0, raf = 0, onscreen = true;
    var mouse = { x: -9999, y: -9999, active: false };

    function build() {
      var rect = parent.getBoundingClientRect();
      W = Math.max(1, Math.round(rect.width));
      H = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var cols = Math.max(1, Math.floor(W / spacing));
      var rows = Math.max(1, Math.floor(H / spacing));
      var padX = (W - (cols - 1) * spacing) / 2;
      var padY = (H - (rows - 1) * spacing) / 2;
      dots = [];
      for (var r = 0; r < rows; r++)
        for (var c = 0; c < cols; c++) {
          var ax = padX + c * spacing, ay = padY + r * spacing;
          dots.push({ ax: ax, ay: ay, x: ax, y: ay });
        }
    }

    function draw(animate) {
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i], tx = d.ax, ty = d.ay, alpha = BASE_ALPHA;
        if (animate) {
          ty += Math.sin(d.ax * 0.018 + t) * 1.1;
          tx += Math.cos(d.ay * 0.018 + t * 0.7) * 0.7;
        }
        if (interactive && mouse.active) {
          var dx = mouse.x - d.ax, dy = mouse.y - d.ay, distSq = dx * dx + dy * dy;
          if (distSq < CURSOR_RADIUS * CURSOR_RADIUS) {
            var dist = Math.sqrt(distSq) || 1, f = 1 - dist / CURSOR_RADIUS, push = f * f * BULGE;
            tx -= (dx / dist) * push;
            ty -= (dy / dist) * push;
            alpha = BASE_ALPHA + f * GLOW_ALPHA;
          }
        }
        d.x += (tx - d.x) * 0.18;
        d.y += (ty - d.y) * 0.18;
        ctx.beginPath();
        ctx.arc(d.x, d.y, dotRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + color + ',' + alpha.toFixed(3) + ')';
        ctx.fill();
      }
    }

    function tick() { t += 0.012; draw(true); raf = requestAnimationFrame(tick); }
    function start() { if (!raf && !prefersReduced && onscreen && !document.hidden) raf = requestAnimationFrame(tick); }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

    build();
    if (prefersReduced) draw(false); else start();

    if (interactive) {
      window.addEventListener('pointermove', function (e) {
        var rect = canvas.getBoundingClientRect();
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
        mouse.active = mouse.x >= 0 && mouse.x <= W && mouse.y >= 0 && mouse.y <= H;
      }, { passive: true });
      window.addEventListener('blur', function () { mouse.active = false; });
    }

    var rt;
    var onResize = function () { clearTimeout(rt); rt = setTimeout(function () { build(); if (prefersReduced) draw(false); }, 120); };
    if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(parent);
    else window.addEventListener('resize', onResize);

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        onscreen = entries[0].isIntersecting;
        if (prefersReduced) return;
        if (onscreen) start(); else stop();
      }, { threshold: 0 }).observe(canvas);
    }
    document.addEventListener('visibilitychange', function () {
      if (prefersReduced) return;
      if (document.hidden) stop(); else start();
    });
  }

  // ── 2. Scroll-reveal ─────────────────────────────────────────────────────────
  function initReveal() {
    var targets = document.querySelectorAll('main > section:not(.hero)');
    if (!targets.length) return;
    if (prefersReduced || !('IntersectionObserver' in window)) return; // leave visible

    var io = new IntersectionObserver(function (entries, obs) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          entries[i].target.classList.add('sr-in');
          obs.unobserve(entries[i].target);
        }
      }
    }, { threshold: 0.08, rootMargin: '0px 0px -8% 0px' });

    for (var i = 0; i < targets.length; i++) {
      targets[i].setAttribute('data-sr', '');
      io.observe(targets[i]);
    }

    window.addEventListener('load', function () {
      setTimeout(function () {
        for (var j = 0; j < targets.length; j++) {
          var el = targets[j];
          if (!el.classList.contains('sr-in') && el.getBoundingClientRect().top < window.innerHeight) {
            el.classList.add('sr-in');
          }
        }
      }, 1200);
    });
  }

  // ── 3. Spotlight on .step cards ──────────────────────────────────────────────
  function initSpotlight() {
    if (coarse || prefersReduced) return;
    var cards = document.querySelectorAll('.step');
    for (var i = 0; i < cards.length; i++) {
      (function (card) {
        card.addEventListener('pointermove', function (e) {
          var r = card.getBoundingClientRect();
          card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
          card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
        });
      })(cards[i]);
    }
  }

  // ── 4. In-browser IFC GlobalId toolkit ───────────────────────────────────────
  function generateIfcGuid() {
    var b = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(b);
    var C = GUID_CHARSET;
    // First byte → 2 chars; the leading char holds only the top 2 bits (0–3).
    var out = C[b[0] >> 6] + C[b[0] & 0x3F];
    for (var i = 1; i < 16; i += 3) {
      var n = (b[i] << 16) | (b[i + 1] << 8) | b[i + 2];
      out += C[(n >> 18) & 0x3F] + C[(n >> 12) & 0x3F] + C[(n >> 6) & 0x3F] + C[n & 0x3F];
    }
    return out;
  }

  function classify(v) {
    if (v.length !== 22 || !GUID_RE.test(v)) return 'bad';
    if (GUID_CHARSET.indexOf(v[0]) > 3) return 'warn';
    return 'ok';
  }

  function esc(s) {
    return s.replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function runBatch(text, summaryEl, detailEl) {
    var lines = (text || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    if (!lines.length) {
      summaryEl.innerHTML = '<span class="g-dim">Paste one or more GlobalIds above (one per line).</span>';
      detailEl.innerHTML = '';
      return;
    }

    var seen = {}, ok = 0, warn = 0, bad = 0;
    var problems = []; // {tag, val, note}
    for (var i = 0; i < lines.length; i++) {
      var v = lines[i];
      var cls = classify(v);
      if (cls === 'ok') ok++;
      else if (cls === 'warn') { warn++; problems.push({ tag: 'warn', val: v, note: 'non-canonical (leading char > 128-bit range)' }); }
      else { bad++; problems.push({ tag: 'bad', val: v, note: v.length !== 22 ? (v.length + ' chars, needs 22') : 'character outside IFC base64 set' }); }
      seen[v] = (seen[v] || 0) + 1;
    }

    var dupGroups = [];
    for (var k in seen) if (Object.prototype.hasOwnProperty.call(seen, k) && seen[k] > 1) dupGroups.push({ val: k, n: seen[k] });
    dupGroups.sort(function (a, b) { return b.n - a.n; });

    var parts = [lines.length + ' ID' + (lines.length === 1 ? '' : 's')];
    if (ok) parts.push('<span class="g-ok">' + ok + ' valid</span>');
    if (warn) parts.push('<span class="g-warn">' + warn + ' non-canonical</span>');
    if (bad) parts.push('<span class="g-bad">' + bad + ' invalid</span>');
    if (dupGroups.length) parts.push('<span class="g-bad">' + dupGroups.length + ' duplicated</span>');
    if (!warn && !bad && !dupGroups.length) parts.push('<span class="g-ok">no problems found ✓</span>');
    summaryEl.innerHTML = parts.join(' <span class="g-dim">·</span> ');

    var rows = [];
    for (var d = 0; d < dupGroups.length && rows.length < 8; d++) {
      rows.push('<div class="g-line"><span class="g-tag dup">×' + dupGroups[d].n + ' duplicate</span><span class="g-val">' + esc(dupGroups[d].val) + '</span></div>');
    }
    for (var p = 0; p < problems.length && rows.length < 8; p++) {
      rows.push('<div class="g-line"><span class="g-tag ' + problems[p].tag + '">' + (problems[p].tag === 'warn' ? 'warn' : 'invalid') + '</span><span class="g-val">' + esc(problems[p].val) + '</span><span class="g-dim">— ' + problems[p].note + '</span></div>');
    }
    var extra = (dupGroups.length + problems.length) - rows.length;
    if (extra > 0) rows.push('<div class="g-line"><span class="g-dim">+' + extra + ' more…</span></div>');
    detailEl.innerHTML = rows.join('');
  }

  function initGuidTool() {
    var input = document.getElementById('guidBatchInput');
    if (!input) return;
    var summary = document.getElementById('guidBatchSummary');
    var detail = document.getElementById('guidBatchDetail');
    var genOut = document.getElementById('guidGenOutput');
    var genBtn = document.getElementById('guidGenBtn');
    var copyBtn = document.getElementById('guidCopyBtn');

    var update = function () { runBatch(input.value, summary, detail); };
    input.addEventListener('input', update);
    update();

    if (genBtn && genOut) {
      genBtn.addEventListener('click', function () { genOut.value = generateIfcGuid(); if (copyBtn) copyBtn.disabled = false; });
    }
    if (copyBtn && genOut) {
      copyBtn.disabled = true;
      copyBtn.addEventListener('click', function () {
        if (!genOut.value) return;
        var done = function () {
          var prev = copyBtn.textContent;
          copyBtn.textContent = 'Copied ✓';
          setTimeout(function () { copyBtn.textContent = prev; }, 1400);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(genOut.value).then(done, function () { genOut.select(); done(); });
        } else {
          genOut.select();
          try { document.execCommand('copy'); } catch (e) { /* ignore */ }
          done();
        }
      });
    }
  }

  // ── 5. In-browser IFC header inspector ───────────────────────────────────────
  // Splits a STEP argument list at top level (respecting quotes + nested parens),
  // returning the quoted/literal values with quotes stripped.
  function splitTopLevel(s) {
    var out = [], depth = 0, cur = '', inStr = false;
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (inStr) {
        if (ch === "'") { if (s[i + 1] === "'") { cur += "'"; i++; } else { inStr = false; } }
        else cur += ch;
        continue;
      }
      if (ch === "'") { inStr = true; continue; }
      if (ch === '(') { depth++; continue; }
      if (ch === ')') { depth--; continue; }
      if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
      if (depth === 0) cur += ch;
    }
    out.push(cur.trim());
    return out;
  }

  function parseIfcHeader(text) {
    if (!/ISO-10303-21/i.test(text.slice(0, 400))) {
      return { ok: false };
    }
    var head = text.slice(0, 262144); // header lives at the very top
    var clean = function (v) { return (!v || v === '$' || v === '*') ? null : v; };
    var schema = (head.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i) || [])[1] || null;
    var view = (head.match(/FILE_DESCRIPTION\s*\(\s*\(\s*'([^']*)'/i) || [])[1] || '';
    var ts = null, exporter = null;
    var fn = head.match(/FILE_NAME\s*\(([\s\S]*?)\)\s*;/i);
    if (fn) {
      try {
        var f = splitTopLevel(fn[1]);
        ts = clean(f[1]);
        // FILE_NAME field 5 (preprocessor_version) carries the exporter/tool name
        // for every major authoring app (Revit, ArchiCAD, Tekla…); field 6
        // (originating_system) is usually just a build stamp, so we skip it.
        exporter = clean(f[4]);
      } catch (e) { /* leave nulls */ }
    }
    return { ok: true, schema: schema, view: view, timestamp: ts, exporter: exporter };
  }

  function fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
    return (bytes / 1073741824).toFixed(2) + ' GB';
  }

  function initIfcInspector() {
    var input = document.getElementById('ifcFileInput');
    var drop = document.getElementById('ifcDrop');
    var report = document.getElementById('ifcReport');
    var root = document.getElementById('ifcInspect');
    if (!input || !report || !root) return;

    var ES = (document.documentElement.lang || '').toLowerCase().indexOf('es') === 0;
    var L = ES ? {
      schema: 'Esquema IFC', view: 'Definición de vista (MVD)', exporter: 'Exportado por',
      preproc: 'Versión del exportador', created: 'Creado', file: 'Archivo', size: 'Tamaño',
      none: '—', notIfc: 'No parece un archivo IFC/STEP (falta la cabecera ISO-10303-21).',
      readErr: 'No se pudo leer el archivo.', cta: 'Ejecuta el Health Score completo →', reading: 'Leyendo cabecera…'
    } : {
      schema: 'IFC schema', view: 'View definition (MVD)', exporter: 'Exported by',
      preproc: 'Exporter version', created: 'Created', file: 'File', size: 'Size',
      none: '—', notIfc: "This doesn't look like an IFC/STEP file (missing the ISO-10303-21 header).",
      readErr: 'Could not read the file.', cta: 'Run the full Health Score →', reading: 'Reading header…'
    };
    var appHref = root.getAttribute('data-app') || '../';

    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

    function show(html) { report.innerHTML = html; report.hidden = false; }
    function row(k, v) { return '<div class="ifc-row"><span class="k">' + k + '</span><span class="v">' + v + '</span></div>'; }

    function render(meta, file) {
      if (!meta.ok) { show('<p class="ifc-err">' + esc(L.notIfc) + '</p>'); return; }
      var rows = '';
      rows += row(L.schema, meta.schema ? '<span class="ifc-badge">' + esc(meta.schema) + '</span>' : esc(L.none));
      rows += row(L.view, meta.view ? esc(meta.view) : esc(L.none));
      rows += row(L.exporter, meta.exporter ? esc(meta.exporter) : esc(L.none));
      if (meta.timestamp) rows += row(L.created, esc(meta.timestamp));
      rows += row(L.file, esc(file.name));
      rows += row(L.size, fmtSize(file.size));
      rows += '<div class="ifc-actions"><a href="' + appHref + '">' + esc(L.cta) + '</a></div>';
      show(rows);
    }

    function handleFile(file) {
      if (!file) return;
      show('<p class="ifc-row"><span class="k">' + esc(L.reading) + '</span></p>');
      var slice = file.slice(0, 262144);
      var reader = new FileReader();
      reader.onload = function () { render(parseIfcHeader(String(reader.result || '')), file); };
      reader.onerror = function () { show('<p class="ifc-err">' + esc(L.readErr) + '</p>'); };
      reader.readAsText(slice);
    }

    input.addEventListener('change', function () { if (input.files && input.files[0]) handleFile(input.files[0]); });

    if (drop) {
      ['dragenter', 'dragover'].forEach(function (ev) {
        drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('drag'); });
      });
      ['dragleave', 'dragend', 'drop'].forEach(function (ev) {
        drop.addEventListener(ev, function () { drop.classList.remove('drag'); });
      });
      drop.addEventListener('drop', function (e) {
        e.preventDefault();
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
      });
    }
  }

  // ── 6. Comparison-table filter (solibri-alternative) ─────────────────────────
  function initCompareFilter() {
    var bar = document.getElementById('compareFilter');
    var table = document.querySelector('.compare-table');
    if (!bar || !table) return;
    var rows = [].slice.call(table.querySelectorAll('tbody tr'));
    if (!rows.length) return;

    function catOf(label) {
      var s = (label || '').toLowerCase();
      if (/price|free|cost|tier|paid/.test(s)) return 'price';
      if (/upload|server|privacy|local|offline/.test(s)) return 'privacy';
      if (/install|mac|windows|linux|platform|browser|size/.test(s)) return 'platform';
      return 'features';
    }
    rows.forEach(function (r) {
      var f = r.querySelector('.col-feature');
      r.setAttribute('data-cat', f ? catOf(f.textContent) : 'features');
    });

    var chips = [].slice.call(bar.querySelectorAll('[data-cat]'));
    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        var cat = chip.getAttribute('data-cat');
        chips.forEach(function (x) {
          var on = x === chip;
          x.classList.toggle('is-active', on);
          x.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        rows.forEach(function (r) {
          r.style.display = (cat === 'all' || r.getAttribute('data-cat') === cat) ? '' : 'none';
        });
      });
    });
  }

  // ── Boot ─────────────────────────────────────────────────────────────────────
  function init() {
    injectStyles();
    var nodes = document.querySelectorAll('canvas[data-dot-grid]');
    for (var i = 0; i < nodes.length; i++) initCanvas(nodes[i]);
    initReveal();
    initSpotlight();
    initGuidTool();
    initIfcInspector();
    initCompareFilter();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

/*
 * live-embed.js — click-to-load facade for the real in-browser IFC validator.
 *
 * Drops a lightweight poster button on the page; on click it swaps in an
 * <iframe> pointing at the actual app in embed mode, so the visitor runs the
 * genuine WebAssembly validator (Health Score, panel, 3D) without us paying the
 * full app's LCP/JS cost on initial load.
 *
 * Usage:
 *   <div data-live-embed
 *        data-app="../"
 *        data-model="https://…/Sample.ifc"
 *        data-validate data-panel
 *        data-cta="Run live validation on a sample IFC"
 *        data-sub="Loads the real validator in your browser — nothing uploaded"
 *        style="--le-h:560px"></div>
 *   <script defer src="../seo/live-embed.js"></script>
 */
(function () {
  'use strict';

  var CSS =
    '[data-live-embed]{position:relative;display:block;width:100%;height:var(--le-h,520px);' +
    'border-radius:14px;overflow:hidden;border:1px solid rgba(94,106,210,.35);background:#0d0d10}' +
    '.le-facade{position:absolute;inset:0;width:100%;height:100%;display:flex;flex-direction:column;' +
    'align-items:center;justify-content:center;gap:11px;cursor:pointer;border:0;color:#e8e8f0;' +
    'font-family:inherit;text-align:center;padding:24px;transition:background .15s;' +
    'background:radial-gradient(58% 60% at 50% 38%,rgba(94,106,210,.16),transparent 70%),#0d0d10}' +
    '.le-facade:hover{background:radial-gradient(58% 60% at 50% 38%,rgba(94,106,210,.26),transparent 70%),#0d0d10}' +
    '.le-play{display:flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;' +
    'background:#5E6AD2;color:#fff;font-size:19px;padding-left:3px;box-shadow:0 6px 24px rgba(94,106,210,.35)}' +
    '.le-title{font-size:15px;font-weight:600;letter-spacing:-.01em}' +
    '.le-sub{font-size:12px;color:rgba(255,255,255,.45);max-width:380px;line-height:1.5}' +
    '.le-frame{width:100%;height:100%;border:0;display:block}';

  function injectCss() {
    if (document.getElementById('le-css')) return;
    var s = document.createElement('style');
    s.id = 'le-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function buildSrc(el) {
    var app = el.getAttribute('data-app') || '../';
    var u = new URL(app, location.href);
    var model = el.getAttribute('data-model');
    if (model) u.searchParams.set('model', model);
    u.searchParams.set('embed', '1');
    if (el.hasAttribute('data-validate')) u.searchParams.set('validate', '1');
    if (el.hasAttribute('data-panel')) u.searchParams.set('panel', '1');
    var ui = el.getAttribute('data-ui');
    if (ui) u.searchParams.set('ui', ui);
    var lang = el.getAttribute('data-lang');
    if (lang) u.searchParams.set('lang', lang);
    return u.toString();
  }

  function activate(el) {
    if (el.classList.contains('is-live')) return;
    var frame = document.createElement('iframe');
    frame.src = buildSrc(el);
    frame.title = el.getAttribute('data-title') || 'Live IFC validation';
    frame.className = 'le-frame';
    frame.setAttribute('allow', 'fullscreen');
    frame.setAttribute('loading', 'eager');
    el.innerHTML = '';
    el.classList.add('is-live');
    el.appendChild(frame);
  }

  function initOne(el) {
    var cta = el.getAttribute('data-cta') || 'Run live validation on a sample IFC';
    var sub = el.getAttribute('data-sub') || 'Loads the real validator in your browser — nothing is uploaded';
    var facade = document.createElement('button');
    facade.type = 'button';
    facade.className = 'le-facade';
    facade.setAttribute('aria-label', cta);
    var play = document.createElement('span');
    play.className = 'le-play';
    play.textContent = '▶';
    var title = document.createElement('span');
    title.className = 'le-title';
    title.textContent = cta;
    var subEl = document.createElement('span');
    subEl.className = 'le-sub';
    subEl.textContent = sub;
    facade.appendChild(play);
    facade.appendChild(title);
    facade.appendChild(subEl);
    facade.addEventListener('click', function () { activate(el); });
    el.appendChild(facade);
  }

  function init() {
    injectCss();
    var els = document.querySelectorAll('[data-live-embed]');
    for (var i = 0; i < els.length; i++) initOne(els[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

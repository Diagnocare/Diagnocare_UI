'use strict';

/**
 * The visual layer that makes a recording read as a person using the app.
 *
 * Playwright's video capture does not include a mouse pointer, and a synthetic click
 * leaves no visible trace — so without this, a recording is a series of unexplained
 * state changes. This injects, before any page script runs:
 *
 *   • a pointer that tracks real mousemove events (so it can never drift out of sync
 *     with where Playwright is actually clicking),
 *   • a click pulse,
 *   • a spotlight that dims the page around one element,
 *   • a bilingual caption bar (English above, Hindi below), and
 *   • a full-screen title card for section transitions.
 *
 * The Devanagari face is passed in as base64 and embedded as an @font-face, rather than
 * relying on a system font: this container has no Devanagari font installed, and the
 * browser's own fallback is not something to leave the typography of a deliverable to.
 */

const fs = require('node:fs');
const path = require('node:path');

/** Runs inside the page. Everything it needs arrives in `opts`. */
function installTutorialOverlay(opts) {
  if (window.__tutorialOverlayInstalled) return;
  window.__tutorialOverlayInstalled = true;

  const ZINDEX = 2147483000;
  const LATIN = 'Inter,"Segoe UI",system-ui,sans-serif';
  const DEVA = '"TutorialDeva","Noto Sans Devanagari",sans-serif';

  let root = null, pointer = null, capEn = null, capHi = null, capBox = null;
  let spotlight = null, card = null;

  function injectFont() {
    if (!opts || !opts.fontB64 || document.getElementById('__tutorial_font')) return;
    const style = document.createElement('style');
    style.id = '__tutorial_font';
    style.textContent =
      `@font-face{font-family:"TutorialDeva";font-weight:400;font-style:normal;font-display:block;` +
      `src:url(data:font/woff2;base64,${opts.fontB64}) format("woff2");}`;
    (document.head || document.documentElement).appendChild(style);
  }

  function build() {
    injectFont();
    if (root && document.body && document.documentElement.contains(root)) return;
    if (!document.body) return;

    root = document.createElement('div');
    root.id = '__tutorial_overlay';
    root.setAttribute('aria-hidden', 'true');
    root.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:${ZINDEX};font-family:${LATIN}`;

    // ── Spotlight: four dim panels around a hole, so the target stays fully crisp.
    spotlight = document.createElement('div');
    spotlight.style.cssText = 'position:absolute;inset:0;opacity:0;transition:opacity .45s ease';
    for (let i = 0; i < 4; i++) {
      const panel = document.createElement('div');
      panel.style.cssText = 'position:absolute;background:rgba(8,13,24,.60);transition:all .45s cubic-bezier(.4,0,.2,1)';
      spotlight.appendChild(panel);
    }
    const ring = document.createElement('div');
    ring.dataset.ring = '1';
    ring.style.cssText = 'position:absolute;border:2px solid #38bdf8;border-radius:10px;'
      + 'box-shadow:0 0 0 4px rgba(56,189,248,.22),0 10px 34px rgba(2,8,23,.40);'
      + 'transition:all .45s cubic-bezier(.4,0,.2,1)';
    spotlight.appendChild(ring);
    root.appendChild(spotlight);

    // ── Bilingual caption bar.
    capBox = document.createElement('div');
    capBox.style.cssText = [
      'position:absolute', 'left:50%', 'bottom:40px', 'transform:translateX(-50%) translateY(14px)',
      'width:min(1480px,92vw)', 'box-sizing:border-box', 'padding:15px 34px 17px', 'border-radius:14px',
      'background:rgba(8,13,24,.90)', 'backdrop-filter:blur(10px)',
      'border:1px solid rgba(148,163,184,.26)', 'text-align:center',
      'box-shadow:0 18px 50px rgba(2,8,23,.50)',
      'opacity:0', 'transition:opacity .32s ease,transform .32s ease',
    ].join(';');

    capEn = document.createElement('div');
    capEn.style.cssText = `font-family:${LATIN};font-size:26px;line-height:1.42;color:#f1f5f9;font-weight:450`;
    capHi = document.createElement('div');
    capHi.style.cssText = `font-family:${DEVA};font-size:25px;line-height:1.62;color:#7dd3fc;`
      + 'margin-top:8px;padding-top:8px;border-top:1px solid rgba(148,163,184,.20)';
    capBox.appendChild(capEn);
    capBox.appendChild(capHi);
    root.appendChild(capBox);

    // ── Pointer: arrow plus a drop shadow so it reads at 1080p.
    pointer = document.createElement('div');
    pointer.style.cssText = 'position:absolute;left:0;top:0;width:30px;height:30px;'
      + 'margin-left:-4px;margin-top:-3px;will-change:transform;transform:translate3d(-100px,-100px,0)';
    pointer.innerHTML =
      '<svg width="30" height="30" viewBox="0 0 30 30" style="position:absolute;filter:drop-shadow(0 3px 7px rgba(2,8,23,.55))">'
      + '<path d="M4 2 L4 22 L9.6 16.8 L13.2 25.4 L17 23.7 L13.4 15.3 L21 14.6 Z" '
      + 'fill="#ffffff" stroke="#0f172a" stroke-width="1.7" stroke-linejoin="round"/></svg>';
    root.appendChild(pointer);

    // ── Section title card.
    card = document.createElement('div');
    card.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;'
      + 'align-items:center;justify-content:center;gap:16px;'
      + 'background:linear-gradient(140deg,#071326 0%,#0e2744 52%,#071326 100%);'
      + 'color:#f8fafc;opacity:0;transition:opacity .6s ease';
    root.appendChild(card);

    document.documentElement.appendChild(root);
  }

  // Rebuild after Angular replaces the body on navigation.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build, { once: true });
  } else {
    build();
  }
  setInterval(build, 400);

  // The pointer follows the real pointer, so it cannot desync from the clicks.
  addEventListener('mousemove', e => {
    if (pointer) pointer.style.transform = `translate3d(${e.clientX}px,${e.clientY}px,0)`;
  }, true);

  window.__tutorialClickPulse = function (x, y) {
    build();
    if (!root) return;
    const pulse = document.createElement('div');
    pulse.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:26px;height:26px;`
      + 'margin:-13px 0 0 -13px;border-radius:50%;border:3px solid #38bdf8;background:rgba(56,189,248,.26)';
    root.appendChild(pulse);
    pulse.animate(
      [{ transform: 'scale(.3)', opacity: 1 }, { transform: 'scale(3.1)', opacity: 0 }],
      { duration: 620, easing: 'cubic-bezier(.22,.61,.36,1)' },
    ).onfinish = () => pulse.remove();
  };

  /** Shows one narration beat in both languages, or clears the bar when given nothing. */
  window.__tutorialCaption = function (en, hi) {
    build();
    if (!capBox) return;
    if (!en && !hi) {
      capBox.style.opacity = '0';
      capBox.style.transform = 'translateX(-50%) translateY(14px)';
      return;
    }
    capEn.textContent = en || '';
    capHi.textContent = hi || '';
    capEn.style.display = en ? 'block' : 'none';
    capHi.style.display = hi ? 'block' : 'none';
    capBox.style.opacity = '1';
    capBox.style.transform = 'translateX(-50%) translateY(0)';
  };

  window.__tutorialSpotlight = function (rect) {
    build();
    if (!spotlight) return;
    if (!rect) { spotlight.style.opacity = '0'; return; }

    const pad = 10;
    const x = Math.max(0, rect.x - pad), y = Math.max(0, rect.y - pad);
    const w = rect.width + pad * 2, h = rect.height + pad * 2;
    const W = innerWidth, H = innerHeight;
    const panels = [...spotlight.children].filter(el => !el.dataset.ring);

    const boxes = [
      [0, 0, W, y],
      [0, y + h, W, Math.max(0, H - y - h)],
      [0, y, x, h],
      [x + w, y, Math.max(0, W - x - w), h],
    ];
    panels.forEach((panel, i) => {
      const [bx, by, bw, bh] = boxes[i];
      panel.style.left = `${bx}px`; panel.style.top = `${by}px`;
      panel.style.width = `${bw}px`; panel.style.height = `${bh}px`;
    });

    const ring = spotlight.querySelector('[data-ring]');
    ring.style.left = `${x}px`; ring.style.top = `${y}px`;
    ring.style.width = `${w}px`; ring.style.height = `${h}px`;
    spotlight.style.opacity = '1';
  };

  window.__tutorialCard = function (o) {
    build();
    if (!card) return;
    if (!o) { card.style.opacity = '0'; return; }
    const esc = t => String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const L = `font-family:${LATIN}`, D = `font-family:${DEVA}`;
    card.innerHTML =
      (o.kicker ? `<div style="${L};font-size:19px;letter-spacing:.34em;text-transform:uppercase;color:#38bdf8;font-weight:600">${esc(o.kicker)}</div>` : '')
      + `<div style="${L};font-size:70px;font-weight:700;letter-spacing:-.02em;text-align:center;max-width:1500px;line-height:1.08">${esc(o.title)}</div>`
      + (o.titleHi ? `<div style="${D};font-size:44px;font-weight:400;color:#bae6fd;text-align:center;max-width:1500px;line-height:1.35">${esc(o.titleHi)}</div>` : '')
      + (o.subtitle ? `<div style="${L};font-size:28px;color:#94a3b8;text-align:center;max-width:1180px;line-height:1.45;margin-top:6px">${esc(o.subtitle)}</div>` : '')
      + (o.subtitleHi ? `<div style="${D};font-size:26px;color:#64748b;text-align:center;max-width:1180px;line-height:1.6">${esc(o.subtitleHi)}</div>` : '');
    card.style.opacity = '1';
  };
}

/** Reads the embedded Devanagari face once, at require time. */
function loadFontB64() {
  const file = path.join(__dirname, '..', 'assets', 'noto-deva-400.woff2');
  try {
    return fs.readFileSync(file).toString('base64');
  } catch {
    process.stderr.write(`overlay: no Devanagari font at ${file}; Hindi captions will use a fallback face\n`);
    return '';
  }
}

module.exports = { installTutorialOverlay, overlayOptions: () => ({ fontB64: loadFontB64() }) };

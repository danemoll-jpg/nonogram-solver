// Custom pop-up tooltips for icon-only toolbar buttons (toolbar cleanup — see TODO.md).
//
// A native `title` attribute is the simplest way to get a hover caption for free, and was
// considered first — but this project has a long, specific history of iOS Safari behaving
// unlike desktop browsers for exactly this kind of chrome (see TODO.md's whole scroll-bug
// saga), and native `title` tooltips are well known to be unreliable-to-absent on iOS Safari
// touch, which is this app's primary real-world platform. A small custom tooltip that
// explicitly handles both hover (desktop mouse) and press (touch, which has no hover concept
// at all) is barely more code and doesn't depend on iOS choosing to honor `title`.
//
// One shared floating bubble element, repositioned per button, rather than one element per
// button — there's only ever one tooltip visible at a time.

const SHOW_DELAY_MS = 300; // hover: avoid flashing a caption on every incidental mouse pass-over
const TOUCH_AUTOHIDE_MS = 1600; // press: long enough to read a short caption, short enough not to linger

let bubble = null;
let showTimer = null;
let hideTimer = null;

function ensureBubble() {
  if (bubble) return bubble;
  bubble = document.createElement('div');
  bubble.className = 'tooltip-bubble hidden';
  bubble.setAttribute('role', 'tooltip');
  document.body.appendChild(bubble);
  return bubble;
}

function positionBubble(el) {
  const b = ensureBubble();
  const rect = el.getBoundingClientRect();
  // Reveal before measuring — offsetWidth/offsetHeight read 0 while `.hidden` (display: none)
  // is still applied, so the bubble has to actually be in flow before its real size is known.
  b.classList.remove('hidden');
  const bw = b.offsetWidth;
  const bh = b.offsetHeight;
  const left = Math.min(
    Math.max(8, rect.left + rect.width / 2 - bw / 2),
    window.innerWidth - bw - 8
  );
  const top = Math.max(8, rect.top - bh - 8); // above the button by default
  b.style.left = `${left}px`;
  b.style.top = `${top}px`;
}

function showTooltip(el, text) {
  clearTimeout(hideTimer);
  const b = ensureBubble();
  b.textContent = text;
  positionBubble(el);
}

function hideTooltip() {
  clearTimeout(showTimer);
  if (bubble) bubble.classList.add('hidden');
}

/** Wires the shared custom tooltip onto `el`, reading its caption from `data-tooltip`. A no-op
 *  if the element has no `data-tooltip` — safe to call on any button. */
export function attachTooltip(el) {
  const text = el?.getAttribute?.('data-tooltip');
  if (!text) return;

  el.addEventListener('mouseenter', () => {
    showTimer = setTimeout(() => showTooltip(el, text), SHOW_DELAY_MS);
  });
  el.addEventListener('mouseleave', () => {
    clearTimeout(showTimer);
    hideTooltip();
  });
  // Keyboard-focus equivalent of hover, so the caption isn't mouse/touch-only.
  el.addEventListener('focus', () => showTooltip(el, text));
  el.addEventListener('blur', hideTooltip);

  // Touch has no hover state at all, so a tap itself is the only "the player is looking at
  // this button" signal available — show immediately, then auto-hide on a timer rather than
  // waiting for a mouseleave-equivalent event that touch never fires.
  el.addEventListener(
    'touchstart',
    () => {
      showTooltip(el, text);
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hideTooltip, TOUCH_AUTOHIDE_MS);
    },
    { passive: true }
  );
}

/** Wires every `[data-tooltip]` element under `root` (default: the whole document). Call once
 *  at startup, after the toolbar markup exists. */
export function initTooltips(root = document) {
  root.querySelectorAll('[data-tooltip]').forEach(attachTooltip);
}

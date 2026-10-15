// Always-visible, draggable scroll bars for the puzzle board (direct ask: "give me scroll bars
// on the puzzle for larger puzzles").
//
// Why custom instead of the browser's own: iOS Safari (this app's real device) only ever shows
// overlay scroll bars — invisible until a scroll is already underway, and not draggable — and it
// ignores ::-webkit-scrollbar styling, so there's no CSS way to make native ones stick around.
// On top of that, .board-root has touch-action: none (pinch-zoom/two-finger pan own every touch
// on the board, so a one-finger drag can paint cells), which means a native one-finger scroll
// can't happen there anyway. Real elements sitting OUTSIDE the scroll container (siblings, so
// the board's own pointer handlers never see these drags) are the only thing that works the
// same on touch and mouse. The native scroll bars are hidden in CSS so desktop doesn't show two.

const MIN_THUMB_PX = 36; // keeps the thumb a comfortable finger target even on a huge board

// scrollEl: the overflow container. hTrack/vTrack: each track element containing one
// `.board-scrollbar__thumb`. Returns update(), to call whenever content size changes (zoom,
// re-fit) — scroll position changes are picked up automatically.
export function attachBoardScrollbars(scrollEl, hTrack, vTrack) {
  const axes = [
    { track: hTrack, horizontal: true },
    { track: vTrack, horizontal: false },
  ].map((a) => ({ ...a, thumb: a.track.querySelector('.board-scrollbar__thumb') }));

  function metrics(axis) {
    const view = axis.horizontal ? scrollEl.clientWidth : scrollEl.clientHeight;
    const content = axis.horizontal ? scrollEl.scrollWidth : scrollEl.scrollHeight;
    const trackLen = axis.horizontal ? axis.track.clientWidth : axis.track.clientHeight;
    const thumbLen = Math.min(trackLen, Math.max(MIN_THUMB_PX, (trackLen * view) / content));
    return { view, content, maxScroll: content - view, trackLen, thumbLen, travel: trackLen - thumbLen };
  }

  function update() {
    for (const axis of axes) {
      const m = metrics(axis);
      // 1px slack: fractional layout sizes can leave scrollWidth a hair over clientWidth even
      // when everything visibly fits.
      const needed = m.maxScroll > 1;
      axis.track.hidden = !needed;
      if (!needed) continue;
      const pos = axis.horizontal ? scrollEl.scrollLeft : scrollEl.scrollTop;
      const offset = m.travel * (pos / m.maxScroll);
      axis.thumb.style[axis.horizontal ? 'width' : 'height'] = `${m.thumbLen}px`;
      axis.thumb.style.transform = axis.horizontal ? `translateX(${offset}px)` : `translateY(${offset}px)`;
    }
    // Both bars visible: shorten each so they don't overlap in the bottom-right corner.
    const both = !hTrack.hidden && !vTrack.hidden;
    hTrack.classList.toggle('board-scrollbar--with-corner', both);
    vTrack.classList.toggle('board-scrollbar--with-corner', both);
  }

  function setScroll(axis, value) {
    if (axis.horizontal) scrollEl.scrollLeft = value;
    else scrollEl.scrollTop = value;
  }

  for (const axis of axes) {
    let drag = null;
    axis.track.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const m = metrics(axis);
      if (m.travel <= 0) return;
      const client = axis.horizontal ? e.clientX : e.clientY;
      const thumbRect = axis.thumb.getBoundingClientRect();
      const thumbStart = axis.horizontal ? thumbRect.left : thumbRect.top;
      const thumbEnd = axis.horizontal ? thumbRect.right : thumbRect.bottom;
      // Pressing the bare track (not the thumb) jumps the thumb's center to that spot, then
      // keeps dragging from there — simpler and more predictable on touch than page-stepping.
      let grabOffset = client - thumbStart;
      if (client < thumbStart || client > thumbEnd) {
        grabOffset = m.thumbLen / 2;
        const trackRect = axis.track.getBoundingClientRect();
        const trackStart = axis.horizontal ? trackRect.left : trackRect.top;
        setScroll(axis, ((client - trackStart - grabOffset) / m.travel) * m.maxScroll);
      }
      drag = { pointerId: e.pointerId, grabOffset };
      axis.track.setPointerCapture(e.pointerId);
      axis.track.classList.add('board-scrollbar--active');
    });
    axis.track.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      const m = metrics(axis);
      const trackRect = axis.track.getBoundingClientRect();
      const trackStart = axis.horizontal ? trackRect.left : trackRect.top;
      const client = axis.horizontal ? e.clientX : e.clientY;
      setScroll(axis, ((client - trackStart - drag.grabOffset) / m.travel) * m.maxScroll);
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      drag = null;
      axis.track.classList.remove('board-scrollbar--active');
    };
    axis.track.addEventListener('pointerup', end);
    axis.track.addEventListener('pointercancel', end);
  }

  scrollEl.addEventListener('scroll', update, { passive: true });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(update).observe(scrollEl);
  update();
  return update;
}

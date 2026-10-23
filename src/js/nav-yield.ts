/**
 * The shared top pill gets out of a tool's workspace's way.
 *
 * The pill sticks to the top of every tool page (styles.css). A tool whose main
 * job happens inside an embedded viewer — Edit PDF, Sign PDF, Add Stamps, Form
 * Filler, Compare, and Markdown to PDF's editor — has that viewer's own toolbar
 * (or the editor's pane headers) along its top edge, and scrolling the page
 * down to it slid exactly that edge under the pill. Scrolling back up does not
 * rescue it either: the wheel over a viewer scrolls the PDF inside it, not the
 * page.
 *
 * So the workspace pushes the header. Each element marked `data-pkc-workspace`
 * acts as a solid block the pill cannot overlap: as its top edge rises into
 * the header band the pill rises with it, pixel for pixel, until it is gone;
 * once the workspace has scrolled away above the viewport, the pill slides back
 * over the next band's worth of scrolling. It is CSS sticky containment, which
 * a sticky header gets for free when its container ends — done by hand,
 * because the workspace is not the pill's container.
 *
 * The push is written as `--pkc-nav-push` on the pill itself, not on :root, so
 * a scroll frame restyles the pill and nothing else; styles.css turns it into
 * the pill's sticky `top` and the frosted band's `translate`.
 *
 * Side-effect module: imported once from main.ts, which every page loads.
 */

const WORKSPACE = '[data-pkc-workspace]';
// The pill this applies to: every page except PDF Multi Tool, whose body never
// scrolls and whose pill is not sticky (see `.pkc-nav-shell--fixed-viewport`).
const PILL = '.pkc-nav-shell:not(.pkc-nav-shell--fixed-viewport) .top-pills';
// --nav-scrim's value in the shared top-pills.css when this was written.
const FALLBACK_BAND = 112;

/** How far the header reaches: the end of the frosted band, not of the pills. */
function bandOf(pill: HTMLElement): number {
  const scrim = parseFloat(
    getComputedStyle(pill).getPropertyValue('--nav-scrim')
  );
  return scrim > 0 ? scrim : FALLBACK_BAND;
}

/** Pixels the workspaces push the header up, 0..band. */
export function pushFor(
  rects: Pick<DOMRect, 'top' | 'bottom' | 'height'>[],
  band: number
): number {
  let push = 0;
  for (const r of rects) {
    if (r.height <= 0) continue; // hidden until a file is open
    // Above the viewport: slide back in. Otherwise: as far as its top has
    // risen into the band (past the top of the viewport, the whole band).
    const p = r.bottom <= 0 ? band + r.bottom : band - r.top;
    push = Math.max(push, p);
  }
  return Math.min(Math.max(push, 0), band);
}

function start(pill: HTMLElement): void {
  const band = bandOf(pill);
  // Everything pinned in a tool starts here (styles.css). Written once, from the
  // live pill, so the CSS fallback cannot drift from the shared stylesheet.
  document.documentElement.style.setProperty('--pkc-nav-clear', `${band}px`);

  const workspaces = Array.from(
    document.querySelectorAll<HTMLElement>(WORKSPACE)
  );
  if (!workspaces.length) return;

  let frame = 0;
  let last = -1;
  const update = (): void => {
    frame = 0;
    const push = pushFor(
      workspaces.map((w) => w.getBoundingClientRect()),
      band
    );
    if (push === last) return;
    last = push;
    pill.style.setProperty('--pkc-nav-push', `${push}px`);
  };
  const schedule = (): void => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule);
  // A workspace appears (hidden → shown when a file opens) or moves without any
  // scrolling (a file list grows above it). Watching the body's size catches the
  // second; watching each workspace catches the first.
  const ro = new ResizeObserver(schedule);
  ro.observe(document.body);
  workspaces.forEach((w) => ro.observe(w));
  schedule();
}

function init(): void {
  const found = document.querySelector<HTMLElement>(PILL);
  if (found) return start(found);
  // The pill is injected later by the shared top-pills.js loader.
  const mount = document.getElementById('topPillsMount');
  if (!mount) return;
  const obs = new MutationObserver(() => {
    const pill = document.querySelector<HTMLElement>(PILL);
    if (!pill) return;
    obs.disconnect();
    start(pill);
  });
  obs.observe(mount, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

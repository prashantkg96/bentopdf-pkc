// PKC tool-usage analytics — privacy-preserving.
//
// Logs *which* tool is used and *when*, plus coarse, non-identifying file
// metadata (count, type/extension, size bucket). It NEVER sends the file name
// or any file content — so it does not weaken the site's core promise that
// files never leave the user's device. Everything is fire-and-forget and fully
// guarded, so a tracking failure can never break a tool.
//
// Events go to the existing `/api/track` endpoint on the pkc-in Worker (same
// origin) → `events` table in the `jharkhand-analytics` D1.

const TRACK_URL = '/api/track';

function getSessionId(): string {
  try {
    let sid = localStorage.getItem('_sid');
    if (!sid) {
      sid =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem('_sid', sid);
    }
    return sid;
  } catch {
    return '';
  }
}

// "/toolkits/pdf-tools/merge-pdf" -> "merge-pdf"; the index resolves to "index".
function toolSlug(): string {
  const m = location.pathname
    .replace(/\/+$/, '')
    .match(/\/toolkits\/pdf-tools\/([^/]+)/);
  return m ? m[1].replace(/\.html$/, '') : 'index';
}

function track(event: string, data: Record<string, unknown>): void {
  try {
    const body = JSON.stringify({
      event,
      data,
      session: getSessionId(),
      ts: Date.now(),
    });
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(
        TRACK_URL,
        new Blob([body], { type: 'application/json' })
      );
    } else {
      fetch(TRACK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    /* analytics must never throw into the UI */
  }
}

function sizeBucket(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return '<1MB';
  if (mb < 10) return '1-10MB';
  if (mb < 50) return '10-50MB';
  if (mb < 200) return '50-200MB';
  return '>200MB';
}

// Extension only — derived locally to classify the upload; the name is discarded.
function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i > -1
    ? name
        .slice(i + 1)
        .toLowerCase()
        .slice(0, 8)
    : '';
}

let lastUseAt = 0;
function reportFiles(tool: string, files: FileList | File[] | null): void {
  try {
    if (!files || !files.length) return;
    const now = Date.now();
    if (now - lastUseAt < 1500) return; // de-dupe change+drop / rapid re-fires
    lastUseAt = now;

    let total = 0;
    const exts: Record<string, true> = {};
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      total += f.size || 0;
      const e = extOf(f.name || ''); // name read locally, never transmitted
      if (e) exts[e] = true;
    }
    track('tool_use', {
      tool,
      count: files.length,
      ext: Object.keys(exts).slice(0, 8),
      size: sizeBucket(total),
    });
  } catch {
    /* ignore */
  }
}

function init(): void {
  try {
    if ((window as unknown as { __pkcToolTrack?: boolean }).__pkcToolTrack)
      return;
    (window as unknown as { __pkcToolTrack?: boolean }).__pkcToolTrack = true;

    const tool = toolSlug();
    if (tool === 'index') return; // the tool listing is not a tool itself

    // 1) tool opened
    track('tool_open', { tool });

    // 2) tool used — file selected (click) or dropped. Capture phase + no
    //    preventDefault/stopPropagation, so the tool's own handlers are unaffected.
    document.addEventListener(
      'change',
      (ev) => {
        const t = ev.target as HTMLInputElement | null;
        if (t && t.tagName === 'INPUT' && t.type === 'file' && t.files) {
          reportFiles(tool, t.files);
        }
      },
      true
    );
    document.addEventListener(
      'drop',
      (ev) => {
        const dt = (ev as DragEvent).dataTransfer;
        if (dt && dt.files && dt.files.length) reportFiles(tool, dt.files);
      },
      true
    );
  } catch {
    /* ignore */
  }
}

init();

export {};

import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';

// The page side of utils/tool-suggest.ts: on JPG to PDF, a PNG never reaches the
// page's own handlers, and a dialog points at PNG to PDF instead.

const png = (name = 'sunset.png') =>
  new File(['x'], name, { type: 'image/png' });
const jpg = () => new File(['x'], 'beach.jpg', { type: 'image/jpeg' });

type Listener = Mock<(e: Event) => void>;
let pageChange: Listener;
let pageDrop: Listener;
let pageDragLeave: Listener;

function pick(files: File[]) {
  const input = document.getElementById('file-input') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function drop(files: File[]) {
  const zone = document.getElementById('drop-zone')!;
  const e = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'dataTransfer', { value: { files } });
  zone.dispatchEvent(e);
  return e;
}

const dialog = () => document.getElementById('pkc-wrong-file');

beforeAll(async () => {
  window.history.replaceState({}, '', '/jpg-to-pdf.html');
  await import('@/js/wrong-file');
});

beforeEach(() => {
  document.body.innerHTML =
    '<div id="drop-zone"><input type="file" id="file-input" /></div>';
  pageChange = vi.fn<(e: Event) => void>();
  pageDrop = vi.fn<(e: Event) => void>();
  pageDragLeave = vi.fn<(e: Event) => void>();
  document.getElementById('file-input')!.addEventListener('change', pageChange);
  document.getElementById('drop-zone')!.addEventListener('drop', pageDrop);
  document
    .getElementById('drop-zone')!
    .addEventListener('dragleave', pageDragLeave);
});

describe('a wrong file on a tool page', () => {
  it('a picked PNG goes to the dialog, not the page', () => {
    pick([png()]);
    expect(pageChange).not.toHaveBeenCalled();
    expect(dialog()).not.toBeNull();
    expect(dialog()!.querySelector('h3')!.textContent).toBe(
      'Use PNG to PDF for this'
    );
    expect(dialog()!.querySelector('p')!.textContent).toBe(
      "JPG to PDF can't open sunset.png. PNG to PDF can."
    );
    expect(dialog()!.querySelector('[data-act="go"]')!.textContent).toBe(
      'Open PNG to PDF'
    );
  });

  it('"Not now" closes it', () => {
    pick([png()]);
    (dialog()!.querySelector('[data-act="stay"]') as HTMLButtonElement).click();
    expect(dialog()).toBeNull();
  });

  it('a dropped PNG is stopped too, and the drop zone told the drag left', () => {
    const e = drop([png()]);
    expect(e.defaultPrevented).toBe(true);
    expect(pageDrop).not.toHaveBeenCalled();
    expect(pageDragLeave).toHaveBeenCalled();
    expect(dialog()).not.toBeNull();
  });

  it('a JPG reaches the page as before', () => {
    pick([jpg()]);
    drop([jpg()]);
    expect(pageChange).toHaveBeenCalledTimes(1);
    expect(pageDrop).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();
  });

  it('a file name is shown as text, never as markup', () => {
    pick([png('<img src=x onerror="alert(1)">.png')]);
    expect(dialog()!.querySelector('img')).toBeNull();
    expect(dialog()!.querySelector('p')!.textContent).toContain('<img src=x');
  });

  it('several files are counted, not listed', () => {
    pick([png('a.png'), new File(['x'], 'b.webp', { type: 'image/webp' })]);
    expect(dialog()!.querySelector('p')!.textContent).toBe(
      "JPG to PDF can't open these 2 files. Images to PDF can."
    );
  });
});

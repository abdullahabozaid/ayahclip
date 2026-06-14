import type { QcfWord } from "@/types";

const loadedPages = new Set<number>();
const loadingPages = new Map<number, Promise<void>>();

export function qcfFontFamily(page: number): string {
  return `"p${page}-v2"`;
}

async function loadPageFont(page: number): Promise<void> {
  if (loadedPages.has(page)) return;
  if (loadingPages.has(page)) return loadingPages.get(page)!;

  const promise = (async () => {
    const resp = await fetch(`/api/qcf-font?page=${page}`);
    if (!resp.ok) throw new Error(`Failed to load QCF font p${page}`);
    const buf = await resp.arrayBuffer();
    const face = new FontFace(`p${page}-v2`, buf, {
      style: "normal",
      weight: "400",
    });
    await face.load();
    document.fonts.add(face);
    loadedPages.add(page);
    loadingPages.delete(page);
  })();

  loadingPages.set(page, promise);
  return promise;
}

export async function ensureQcfFontsReady(words: QcfWord[]): Promise<void> {
  const pages = new Set(words.map((w) => w.page_number));
  await Promise.all([...pages].map(loadPageFont));
}

export function isQcfPageLoaded(page: number): boolean {
  return loadedPages.has(page);
}

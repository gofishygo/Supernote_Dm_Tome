/**
 * Reference table: compiled from campaign/references.md at build time.
 * Books are matched to documents on the device by file-name substring;
 * entries carry the printed page, and each book's offset converts that to
 * the PDF's 0-based page index: index = page - 1 + offset.
 */
import {PluginNoteAPI} from 'sn-plugin-lib';
import refs from './references.generated.json';
import {fileName, listDocuments, openAt} from './refs';

export type Book = {key: string; match: string; offset: number};
export type Entry = {name: string; book: string; page: number; tags: string};

const data = refs as {generatedAt: string; books: Book[]; entries: Entry[]};
export const BOOKS: Book[] = data.books;
export const ENTRIES: Entry[] = data.entries;
export const REFS_GENERATED_AT: string = data.generatedAt;

type ApiResponse<T> = {success: boolean; result: T | null; error: {code: number; message: string} | null};

let resolved: Map<string, string | null> | null = null;

/** Map each book key to a document path on the device (null when not found). */
export async function resolveBooks(force = false): Promise<Map<string, string | null>> {
  if (resolved && !force) {
    return resolved;
  }
  const docs = await listDocuments();
  const map = new Map<string, string | null>();
  for (const b of BOOKS) {
    const needle = b.match.toLowerCase();
    const hit = docs.find(d => fileName(d).toLowerCase().includes(needle)) ?? null;
    map.set(b.key, hit);
  }
  resolved = map;
  return map;
}

export function bookOf(entry: Entry): Book | undefined {
  return BOOKS.find(b => b.key === entry.book);
}

export function pdfIndex(entry: Entry): number {
  const b = bookOf(entry);
  return Math.max(0, entry.page - 1 + (b?.offset ?? 0));
}

/** Case-insensitive search over name and tags; name hits first. */
export function search(query: string, limit = 12): Entry[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [];
  }
  const words = q.split(/\s+/);
  const score = (e: Entry) => {
    const name = e.name.toLowerCase();
    const tags = e.tags.toLowerCase();
    if (name === q) {
      return 0;
    }
    if (name.startsWith(q)) {
      return 1;
    }
    if (words.every(w => name.includes(w))) {
      return 2;
    }
    if (words.every(w => name.includes(w) || tags.includes(w))) {
      return 3;
    }
    return -1;
  };
  return ENTRIES.map(e => ({e, s: score(e)}))
    .filter(x => x.s >= 0)
    .sort((a, b) => a.s - b.s || a.e.name.localeCompare(b.e.name))
    .slice(0, limit)
    .map(x => x.e);
}

export async function openEntry(entry: Entry): Promise<string> {
  const map = await resolveBooks();
  const path = map.get(entry.book);
  if (!path) {
    throw new Error(`book ${entry.book} not found on the device (looking for a file name containing "${bookOf(entry)?.match ?? entry.book}")`);
  }
  await openAt(path, pdfIndex(entry));
  return `${entry.name} → ${fileName(path)} p.${entry.page}`;
}

/** Insert a tappable link to an entry on the current NOTE page. */
export async function insertEntryLink(entry: Entry, slot: number): Promise<number> {
  const map = await resolveBooks();
  const path = map.get(entry.book);
  if (!path) {
    throw new Error(`book ${entry.book} not found on the device`);
  }
  const top = 160 + slot * 90;
  const res = (await PluginNoteAPI.insertTextLink({
    destPath: path,
    destPage: pdfIndex(entry),
    linkType: 2,
    style: 0,
    rect: {left: 120, top, right: 1100, bottom: top + 70},
    fontSize: 36,
    showText: `${entry.name} (${entry.book} p.${entry.page})`,
    fullText: `${entry.name} — ${fileName(path)} p.${entry.page}`,
    isItalic: 0,
  })) as ApiResponse<number>;
  if (!res?.success) {
    throw new Error(`insertTextLink failed: ${res?.error?.code ?? '?'} ${res?.error?.message ?? ''}`);
  }
  return res.result ?? -1;
}

/** Offset to write into references.md: the PDF index of the page on screen minus (printed page - 1). */
export function offsetFor(pdfPageIndex: number, printedPage: number): number {
  return pdfPageIndex - (printedPage - 1);
}

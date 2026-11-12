/**
 * References: bookmarks into documents (PDF, EPUB) at a page.
 *
 * Storage: a keyword on the page being bookmarked, inside the document (or
 * note) itself. Device keywords have a short maximum length (error 1001), so
 * the file and page are implied by where the keyword sits and the keyword is
 * just:
 *   REF Owlbear
 * The older long form "REF name | path | page" is still parsed for any entries
 * written by 0.4.0–0.4.2.
 */
import {FileUtils, PluginCommAPI, PluginDocAPI, PluginFileAPI} from 'sn-plugin-lib';

export type Ref = {name: string; path: string; page: number; index: number; storedIn: string; storedPage: number};
type ApiResponse<T> = {success: boolean; result: T | null; error: {code: number; message: string} | null};
type KeyWord = {keyword: string; page: number; index: number};

export const INDEX_NOTE_NAME = 'DM Tome Index.note';
export const DOC_SUFFIXES = ['.pdf', '.epub', '.cbz', '.xps', '.fb2'];
const REF_LONG_RE = /^REF\s+(.+?)\s*\|\s*(.+?)\s*\|\s*(\d+)$/;
const REF_RE = /^REF\s+(.+)$/;
/** Measured on a Manta: 40-character keywords insert, 60 fail with 1001. */
export const KEYWORD_MAX = 40;

function unwrap<T>(raw: unknown, what: string): T {
  const res = raw as ApiResponse<T> | null | undefined;
  if (!res?.success || res.result === null || res.result === undefined) {
    throw new Error(`${what} failed: ${res?.error?.code ?? '?'} ${res?.error?.message ?? ''}`);
  }
  return res.result;
}

export async function storageRoot(): Promise<string> {
  return String(await FileUtils.getExportPath()).replace(/\/EXPORT$/, '');
}

export async function indexNotePath(): Promise<string> {
  return `${await storageRoot()}/Note/${INDEX_NOTE_NAME}`;
}

/** Normalise whatever listFiles returns into string paths. */
function toPathList(raw: unknown): string[] {
  if (raw === null || raw === undefined) {
    return [];
  }
  const arr: unknown[] = Array.isArray(raw) ? raw : typeof raw === 'object' ? Object.values(raw as object) : [raw];
  const out: string[] = [];
  for (const item of arr) {
    if (typeof item === 'string') {
      out.push(item);
    } else if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      const v = o.path ?? o.filePath ?? o.absolutePath ?? o.name ?? o.fileName;
      if (typeof v === 'string') {
        out.push(v);
      }
    }
  }
  return out;
}

async function walk(dir: string, suffixes: string[], depth: number): Promise<string[]> {
  let entries: string[];
  try {
    entries = toPathList(await FileUtils.listFiles(dir));
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const p of entries) {
    const lower = p.toLowerCase();
    if (suffixes.some(s => lower.endsWith(s))) {
      out.push(p);
    } else if (depth > 0 && !/\.[A-Za-z0-9]{1,5}$/.test(p)) {
      out.push(...(await walk(p, suffixes, depth - 1)));
    }
  }
  return out;
}

export async function listDocuments(): Promise<string[]> {
  const root = await storageRoot();
  const list = await walk(`${root}/Document`, DOC_SUFFIXES, 4);
  return list.sort((a, b) => a.localeCompare(b));
}

export function fileName(path: string): string {
  return path.split('/').pop() ?? path;
}

export function isDocument(path: string): boolean {
  const lower = path.toLowerCase();
  return DOC_SUFFIXES.some(s => lower.endsWith(s));
}

export function formatRef(name: string): string {
  const clean = name.replace(/[|\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
  return `REF ${clean}`.slice(0, KEYWORD_MAX);
}

export function parseRef(kw: KeyWord, storedIn: string): Ref | null {
  const text = kw.keyword.trim();
  const long = REF_LONG_RE.exec(text);
  if (long) {
    return {name: long[1], path: long[2], page: Number(long[3]), index: kw.index, storedIn, storedPage: kw.page};
  }
  const m = REF_RE.exec(text);
  return m ? {name: m[1], path: storedIn, page: kw.page, index: kw.index, storedIn, storedPage: kw.page} : null;
}

const isNotAllowed = (e: unknown) => /\b102\b/.test(String((e as Error)?.message ?? e));

/** Create the index note if it does not exist. Returns its path. */
export async function ensureIndexNote(): Promise<string> {
  const path = await indexNotePath();
  if (await FileUtils.exists(path)) {
    return path;
  }
  // Template names must come from the system list; a guessed name fails
  // with 802 "Background template file does not exist".
  const templates = ((await PluginCommAPI.getNoteSystemTemplates()) ?? []) as Array<{name: string}>;
  const template = templates[0]?.name;
  if (!template) {
    throw new Error('createNote: no system template available');
  }
  unwrap<boolean>(await PluginFileAPI.createNote({notePath: path, template, mode: 0, isPortrait: true}), 'createNote');
  return path;
}

/**
 * Bookmarks come from two places: the shared index note (writable only while
 * NOTE is hosting us, it seems) and REF keywords stored on documents
 * themselves (the fallback when DOC is hosting). `extraDoc` lets the caller
 * add the currently open document's own keywords.
 */
export async function loadRefs(extraDoc?: {path: string; pages: number}): Promise<{path: string; refs: Ref[]; notes: string[]}> {
  const path = await indexNotePath();
  const refs: Ref[] = [];
  const notes: string[] = [];
  try {
    if (await FileUtils.exists(path)) {
      const res = (await PluginFileAPI.getKeyWords(path, [0])) as ApiResponse<KeyWord[]>;
      if (res?.success) {
        refs.push(...(res.result ?? []).map(k => parseRef(k, path)).filter((r): r is Ref => r !== null));
      } else {
        notes.push(`index note: ${res?.error?.code ?? '?'} ${res?.error?.message ?? ''}`);
      }
    }
  } catch (e) {
    notes.push(`index note: ${String((e as Error)?.message ?? e)}`);
  }
  if (extraDoc) {
    try {
      const pages = Array.from({length: extraDoc.pages}, (_, i) => i);
      const res = (await PluginFileAPI.getKeyWords(extraDoc.path, pages)) as ApiResponse<KeyWord[]>;
      if (res?.success) {
        refs.push(...(res.result ?? []).map(k => parseRef(k, extraDoc.path)).filter((r): r is Ref => r !== null));
      } else {
        notes.push(`this document: ${res?.error?.code ?? '?'} ${res?.error?.message ?? ''}`);
      }
    } catch (e) {
      notes.push(`this document: ${String((e as Error)?.message ?? e)}`);
    }
  }
  return {path, refs: refs.sort((a, b) => a.name.localeCompare(b.name)), notes};
}

/** Save a bookmark as a keyword on the page itself. Works from NOTE and DOC. */
export async function addRef(name: string, docPath: string, page: number): Promise<string> {
  const keyword = formatRef(name);
  unwrap<boolean>(await PluginFileAPI.insertKeyWord(docPath, page, keyword), 'insertKeyWord');
  return `${keyword} on ${fileName(docPath)} p.${page + 1}`;
}

/**
 * Gather REF keywords from every document under Document. Page counts of
 * closed documents are not available from NOTE, so ask for a wide page range
 * and let the host return what exists. Errors are reported per file.
 */
export async function scanDocumentsForRefs(maxPages = 400): Promise<{refs: Ref[]; notes: string[]}> {
  const refs: Ref[] = [];
  const notes: string[] = [];
  const pages = Array.from({length: maxPages}, (_, i) => i);
  for (const doc of await listDocuments()) {
    try {
      const res = (await PluginFileAPI.getKeyWords(doc, pages)) as ApiResponse<KeyWord[]>;
      if (res?.success) {
        refs.push(...(res.result ?? []).map(k => parseRef(k, doc)).filter((r): r is Ref => r !== null));
      } else {
        notes.push(`${fileName(doc)}: ${res?.error?.code ?? '?'} ${res?.error?.message ?? ''}`);
      }
    } catch (e) {
      notes.push(`${fileName(doc)}: ${String((e as Error)?.message ?? e)}`);
    }
  }
  return {refs: refs.sort((a, b) => a.name.localeCompare(b.name)), notes};
}

export async function removeRef(ref: Ref): Promise<void> {
  unwrap<boolean>(await PluginFileAPI.deleteKeyWord(ref.storedIn, ref.storedPage, ref.index), 'deleteKeyWord');
}

export async function openAt(path: string, page: number): Promise<void> {
  unwrap<boolean>(await PluginFileAPI.openFile(path, page), 'openFile');
}

export async function pageText(page: number): Promise<string> {
  return unwrap<string>(await PluginDocAPI.getCurrentDocText(page), 'getCurrentDocText');
}

export async function currentDocTotalPages(): Promise<number> {
  return unwrap<number>(await PluginDocAPI.getCurrentTotalPages(), 'getCurrentTotalPages');
}

/** Insert a tappable link to a bookmark on the current NOTE page. */
export async function insertRefLink(ref: Ref, slot: number): Promise<number> {
  const {PluginNoteAPI} = await import('sn-plugin-lib');
  const top = 160 + slot * 90;
  const res = (await PluginNoteAPI.insertTextLink({
    destPath: ref.path,
    destPage: ref.page,
    linkType: 2,
    style: 0,
    rect: {left: 120, top, right: 1100, bottom: top + 70},
    fontSize: 36,
    showText: `${ref.name} (p.${ref.page + 1})`,
    fullText: `${ref.name} — ${fileName(ref.path)} p.${ref.page + 1}`,
    isItalic: 0,
  })) as ApiResponse<number>;
  if (!res?.success) {
    throw new Error(`insertTextLink failed: ${res?.error?.code ?? '?'} ${res?.error?.message ?? ''}`);
  }
  return res.result ?? -1;
}

export async function whereAmI(): Promise<{path: string; page: number; isDoc: boolean}> {
  const path = unwrap<string>(await PluginCommAPI.getCurrentFilePath(), 'getCurrentFilePath');
  const page = unwrap<number>(await PluginCommAPI.getCurrentPageNum(), 'getCurrentPageNum');
  return {path, page, isDoc: isDocument(path)};
}

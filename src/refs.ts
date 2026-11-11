/**
 * References: bookmarks into documents (PDF, EPUB) at a page.
 *
 * Storage: keywords on page 0 of a dedicated index note, so bookmarks are
 * shared across every campaign note and survive sync. Grammar:
 *   REF Owlbear | /storage/emulated/0/Document/DnD/MM.pdf | 248
 * (page is 0-based, as the SDK counts; shown to the user as page+1)
 */
import {FileUtils, PluginCommAPI, PluginDocAPI, PluginFileAPI} from 'sn-plugin-lib';

export type Ref = {name: string; path: string; page: number; index: number};
type ApiResponse<T> = {success: boolean; result: T | null; error: {code: number; message: string} | null};
type KeyWord = {keyword: string; page: number; index: number};

export const INDEX_NOTE_NAME = 'DM Tome Index.note';
export const DOC_SUFFIXES = ['.pdf', '.epub', '.cbz', '.xps', '.fb2'];
const REF_RE = /^REF\s+(.+?)\s*\|\s*(.+?)\s*\|\s*(\d+)$/;

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

export function formatRef(name: string, path: string, page: number): string {
  const clean = name.replace(/[|\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return `REF ${clean} | ${path} | ${page}`;
}

export function parseRef(kw: KeyWord): Ref | null {
  const m = REF_RE.exec(kw.keyword.trim());
  return m ? {name: m[1], path: m[2], page: Number(m[3]), index: kw.index} : null;
}

/** Create the index note if it does not exist. Returns its path. */
export async function ensureIndexNote(): Promise<string> {
  const path = await indexNotePath();
  if (await FileUtils.exists(path)) {
    return path;
  }
  unwrap<boolean>(
    await PluginFileAPI.createNote({notePath: path, template: 'style_blank', mode: 0, isPortrait: true}),
    'createNote',
  );
  return path;
}

export async function loadRefs(): Promise<{path: string; refs: Ref[]}> {
  const path = await indexNotePath();
  if (!(await FileUtils.exists(path))) {
    return {path, refs: []};
  }
  const res = (await PluginFileAPI.getKeyWords(path, [0])) as ApiResponse<KeyWord[]>;
  if (!res?.success) {
    throw new Error(`getKeyWords(index) failed: ${res?.error?.code ?? '?'} ${res?.error?.message ?? ''}`);
  }
  const refs = (res.result ?? []).map(parseRef).filter((r): r is Ref => r !== null);
  return {path, refs: refs.sort((a, b) => a.name.localeCompare(b.name))};
}

export async function addRef(name: string, docPath: string, page: number): Promise<string> {
  const index = await ensureIndexNote();
  const keyword = formatRef(name, docPath, page);
  unwrap<boolean>(await PluginFileAPI.insertKeyWord(index, 0, keyword), 'insertKeyWord');
  return keyword;
}

export async function removeRef(ref: Ref): Promise<void> {
  const index = await indexNotePath();
  unwrap<boolean>(await PluginFileAPI.deleteKeyWord(index, 0, ref.index), 'deleteKeyWord');
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

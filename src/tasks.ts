/**
 * Back Burner entries live inside the note as keywords, one per entry.
 *
 * Grammar, kept human-readable so it still makes sense in Supernote's own
 * keyword search:
 *   Strong start S12 | The inn is already burning     dated, one per session
 *   Scene S12 | Negotiation with the ferryman         dated
 *   Plot S13 | The letter names the mayor             dated
 *   Hero | Thorin owes the guild a favor              persistent, no due
 *   NPC | Mira the fence, hates the guard captain     persistent, no due
 *   S12 | Pay the ferryman                            legacy plain task
 *   ... [x]                                           done / retired
 * The session counter is its own keyword on page 0:  DM session 12
 */
import {PluginCommAPI, PluginDocAPI, PluginFileAPI, PluginNoteAPI} from 'sn-plugin-lib';

const DOC_SUFFIXES = ['.pdf', '.epub', '.cbz', '.xps', '.fb2'];
export const isDocPath = (path: string) => DOC_SUFFIXES.some(s => path.toLowerCase().endsWith(s));

/** Error 102 means the hosting app (NOTE or DOC) does not offer this API. */
export const isNotAllowed = (e: unknown) => /\b102\b/.test(String((e as Error)?.message ?? e));

export type EntryType = 'strong' | 'scene' | 'plot' | 'hero' | 'npc' | 'task';

export const TYPE_META: Record<EntryType, {word: string; label: string; plural: string; dated: boolean; order: number}> = {
  strong: {word: 'Strong start', label: 'Strong start', plural: 'Strong starts', dated: true, order: 0},
  scene: {word: 'Scene', label: 'Scene', plural: 'Scenes', dated: true, order: 1},
  plot: {word: 'Plot', label: 'Plot point', plural: 'Plot points', dated: true, order: 2},
  hero: {word: 'Hero', label: 'Hero', plural: 'Heroes', dated: false, order: 3},
  npc: {word: 'NPC', label: 'NPC', plural: 'NPCs', dated: false, order: 4},
  task: {word: '', label: 'Task', plural: 'Tasks', dated: true, order: 5},
};

export const CAPTURE_TYPES: EntryType[] = ['strong', 'scene', 'plot', 'hero', 'npc', 'task'];

export type Task = {
  type: EntryType;
  text: string;
  due: number | null;
  done: boolean;
  page: number; // 0-based page the keyword sits on
  index: number; // 1-based keyword index within the page
  raw: string;
};

type ApiResponse<T> = {success: boolean; result: T | null; error: {code: number; message: string} | null};
type KeyWord = {keyword: string; page: number; index: number};

const TASK_RE = /^(Strong start|Scene|Plot|Hero|NPC)?\s*(?:S(\d+|\?))?\s*\|\s*(.*?)\s*(\[x\])?$/i;
const SESSION_RE = /^DM session (\d+)$/i;

const WORD_TO_TYPE: Record<string, EntryType> = {
  'strong start': 'strong',
  scene: 'scene',
  plot: 'plot',
  hero: 'hero',
  npc: 'npc',
};

export function formatTask(type: EntryType, text: string, due: number | null, done = false): string {
  const clean = text.replace(/[|\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  const meta = TYPE_META[type];
  const head = meta.dated ? `${meta.word}${meta.word ? ' ' : ''}S${due ?? '?'}` : meta.word;
  return `${head} | ${clean}${done ? ' [x]' : ''}`;
}

export function parseTask(kw: KeyWord): Task | null {
  const m = TASK_RE.exec(kw.keyword.trim());
  if (!m) {
    return null;
  }
  const word = (m[1] ?? '').toLowerCase();
  const type: EntryType = word ? WORD_TO_TYPE[word] ?? 'task' : 'task';
  if (!word && m[2] === undefined) {
    // A bare "| text" keyword is not ours.
    return null;
  }
  const dated = TYPE_META[type].dated;
  return {
    type,
    text: m[3],
    due: dated && m[2] !== undefined && m[2] !== '?' ? Number(m[2]) : null,
    done: !!m[4],
    page: kw.page,
    index: kw.index,
    raw: kw.keyword,
  };
}

function unwrap<T>(raw: unknown, what: string): T {
  const res = raw as ApiResponse<T> | null | undefined;
  if (!res?.success || res.result === null || res.result === undefined) {
    throw new Error(`${what} failed: ${res?.error?.code ?? '?'} ${res?.error?.message ?? ''}`);
  }
  return res.result;
}

export async function currentFile(): Promise<string> {
  return unwrap<string>(await PluginCommAPI.getCurrentFilePath(), 'getCurrentFilePath');
}

export async function currentPage(): Promise<number> {
  return unwrap<number>(await PluginCommAPI.getCurrentPageNum(), 'getCurrentPageNum');
}

/** Flush the open note before file-level writes, as the docs advise. DOC has no note to save. */
async function flush(): Promise<void> {
  try {
    await PluginNoteAPI.saveCurrentNote();
  } catch {
    // not a NOTE, or nothing to save
  }
}

/** Page count of the open file, using the API the hosting app allows. */
export async function totalPages(path: string): Promise<number> {
  if (isDocPath(path)) {
    return unwrap<number>(await PluginDocAPI.getCurrentTotalPages(), 'getCurrentTotalPages');
  }
  return unwrap<number>(await PluginFileAPI.getNoteTotalPageNum(path), 'getNoteTotalPageNum');
}

async function allKeywords(path: string): Promise<KeyWord[]> {
  const total = await totalPages(path);
  const pages = Array.from({length: total}, (_, i) => i);
  const res = (await PluginFileAPI.getKeyWords(path, pages)) as ApiResponse<KeyWord[]>;
  if (!res?.success) {
    throw new Error(`getKeyWords failed: ${res?.error?.code ?? '?'} ${res?.error?.message ?? ''}`);
  }
  return res.result ?? [];
}

export type Board = {path: string; session: number; tasks: Task[]; keywordCount: number};

export async function loadBoard(): Promise<Board> {
  const path = await currentFile();
  const kws = await allKeywords(path);
  let session = 1;
  const tasks: Task[] = [];
  for (const kw of kws) {
    const sm = SESSION_RE.exec(kw.keyword.trim());
    if (sm) {
      session = Number(sm[1]);
      continue;
    }
    const t = parseTask(kw);
    if (t) {
      tasks.push(t);
    }
  }
  return {path, session, tasks, keywordCount: kws.length};
}

export async function addTask(path: string, page: number, type: EntryType, text: string, due: number | null): Promise<string> {
  const keyword = formatTask(type, text, due);
  await flush();
  unwrap<boolean>(await PluginFileAPI.insertKeyWord(path, page, keyword), 'insertKeyWord');
  return keyword;
}

/** Replace a task's keyword (delete + insert) with new fields. */
export async function rewriteTask(path: string, task: Task, patch: Partial<Pick<Task, 'due' | 'done' | 'text' | 'type'>>): Promise<void> {
  const next = {...task, ...patch};
  await flush();
  unwrap<boolean>(await PluginFileAPI.deleteKeyWord(path, task.page, task.index), 'deleteKeyWord');
  unwrap<boolean>(
    await PluginFileAPI.insertKeyWord(path, task.page, formatTask(next.type, next.text, next.due, next.done)),
    'insertKeyWord',
  );
}

export const setDone = (path: string, task: Task, done: boolean) => rewriteTask(path, task, {done});

export async function setSession(path: string, kws: {page: number; index: number} | null, session: number): Promise<void> {
  await flush();
  if (kws) {
    unwrap<boolean>(await PluginFileAPI.deleteKeyWord(path, kws.page, kws.index), 'deleteKeyWord');
  }
  unwrap<boolean>(await PluginFileAPI.insertKeyWord(path, 0, `DM session ${session}`), 'insertKeyWord');
}

/** Find the session keyword's location so setSession can replace it. */
export async function findSessionKeyword(path: string): Promise<{page: number; index: number} | null> {
  const kws = await allKeywords(path);
  const hit = kws.find(k => SESSION_RE.test(k.keyword.trim()));
  return hit ? {page: hit.page, index: hit.index} : null;
}

export type Bucket = 'strongNow' | 'overdue' | 'due' | 'always' | 'upcoming' | 'someday' | 'done';

export function bucket(task: Task, session: number): Bucket {
  if (task.done) {
    return 'done';
  }
  if (!TYPE_META[task.type].dated) {
    return 'always';
  }
  if (task.due === null) {
    return 'someday';
  }
  if (task.type === 'strong' && task.due === session) {
    return 'strongNow';
  }
  if (task.due < session) {
    return 'overdue';
  }
  if (task.due === session) {
    return 'due';
  }
  return 'upcoming';
}

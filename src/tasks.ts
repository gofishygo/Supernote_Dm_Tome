/**
 * Back Burner tasks live inside the note as keywords, one per task.
 *
 * Grammar (kept human-readable so it still makes sense in Supernote's own
 * keyword search):
 *   S12 | Pay the ferryman          due session 12
 *   S? | Red moon rises             no due session
 *   S10 | Hooded stranger [x]       done
 * The session counter is its own keyword on page 0:  DM session 12
 */
import {PluginCommAPI, PluginFileAPI, PluginNoteAPI} from 'sn-plugin-lib';

export type Task = {
  text: string;
  due: number | null;
  done: boolean;
  page: number; // 0-based page the keyword sits on
  index: number; // 1-based keyword index within the page
  raw: string;
};

type ApiResponse<T> = {success: boolean; result: T | null; error: {code: number; message: string} | null};
type KeyWord = {keyword: string; page: number; index: number};

const TASK_RE = /^S(\d+|\?)\s*\|\s*(.*?)\s*(\[x\])?$/i;
const SESSION_RE = /^DM session (\d+)$/i;

export function formatTask(text: string, due: number | null, done = false): string {
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, 80);
  return `S${due ?? '?'} | ${clean}${done ? ' [x]' : ''}`;
}

export function parseTask(kw: KeyWord): Task | null {
  const m = TASK_RE.exec(kw.keyword.trim());
  if (!m) {
    return null;
  }
  return {
    text: m[2],
    due: m[1] === '?' ? null : Number(m[1]),
    done: !!m[3],
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

async function allKeywords(path: string): Promise<KeyWord[]> {
  const total = unwrap<number>(await PluginFileAPI.getNoteTotalPageNum(path), 'getNoteTotalPageNum');
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

export async function addTask(path: string, page: number, text: string, due: number | null): Promise<string> {
  const keyword = formatTask(text, due);
  await flush();
  unwrap<boolean>(await PluginFileAPI.insertKeyWord(path, page, keyword), 'insertKeyWord');
  return keyword;
}

/** Replace a task's keyword (delete + insert) to mark it done or undone. */
export async function setDone(path: string, task: Task, done: boolean): Promise<void> {
  await flush();
  unwrap<boolean>(await PluginFileAPI.deleteKeyWord(path, task.page, task.index), 'deleteKeyWord');
  unwrap<boolean>(
    await PluginFileAPI.insertKeyWord(path, task.page, formatTask(task.text, task.due, done)),
    'insertKeyWord',
  );
}

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

export function bucket(task: Task, session: number): 'done' | 'overdue' | 'due' | 'upcoming' | 'someday' {
  if (task.done) {
    return 'done';
  }
  if (task.due === null) {
    return 'someday';
  }
  if (task.due < session) {
    return 'overdue';
  }
  if (task.due === session) {
    return 'due';
  }
  return 'upcoming';
}

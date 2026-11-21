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
 *   Location | The Drowned Chapel                     persistent, no due
 *   Lore | The red moon wakes the old kings           persistent, no due
 *   Quest S12 | Recover the bell of Saint Orm         dated
 *   Treasure | Ring of the drowned king (unclaimed)   persistent, no due
 *   Task S12 | Print the harbour map                  DM to-do, Back Burner only
 *   S12 | Pay the ferryman                            legacy plain task (= Task)
 *   ... [x]                                           done / retired
 * The session counter and the in-game day are their own keywords on page 0:
 *   DM session 12
 *   DM day 7            (days since arrival; day 1 is the arrival)
 * Calendar events are keywords too, on page 0:
 *   Day 12 | Battle w/ Baulder
 * Attached documents (PDFs whose Scene keywords join the board), on page 0:
 *   Doc | Death House            (a substring of the file name under Document)
 * A Scene/Quest/... keyword written on a PDF page (from DOC) carries that page
 * as its location, and the board opens the PDF there.
 */
import {PluginCommAPI, PluginDocAPI, PluginFileAPI, PluginNoteAPI} from 'sn-plugin-lib';

const DOC_SUFFIXES = ['.pdf', '.epub', '.cbz', '.xps', '.fb2'];
export const isDocPath = (path: string) => DOC_SUFFIXES.some(s => path.toLowerCase().endsWith(s));

/** Error 102 means the hosting app (NOTE or DOC) does not offer this API. */
export const isNotAllowed = (e: unknown) => /\b102\b/.test(String((e as Error)?.message ?? e));

export type EntryType =
  | 'strong'
  | 'scene'
  | 'plot'
  | 'quest'
  | 'hero'
  | 'npc'
  | 'location'
  | 'lore'
  | 'treasure'
  | 'task';

type Meta = {word: string; label: string; plural: string; dated: boolean; order: number; glyph: string};

/** `glyph` is a plain Unicode symbol so it renders in any system font on e-ink. */
export const TYPE_META: Record<EntryType, Meta> = {
  strong: {word: 'Strong start', label: 'Strong start', plural: 'Strong starts', dated: true, order: 0, glyph: '★'},
  scene: {word: 'Scene', label: 'Scene', plural: 'Scenes', dated: true, order: 1, glyph: '⚔'},
  plot: {word: 'Plot', label: 'Plot point', plural: 'Plot points', dated: true, order: 2, glyph: '❖'},
  quest: {word: 'Quest', label: 'Quest', plural: 'Quests', dated: true, order: 3, glyph: '⚑'},
  hero: {word: 'Hero', label: 'Hero', plural: 'Heroes', dated: false, order: 4, glyph: '⛑'},
  npc: {word: 'NPC', label: 'NPC', plural: 'NPCs', dated: false, order: 5, glyph: '☻'},
  location: {word: 'Location', label: 'Location', plural: 'Locations', dated: false, order: 6, glyph: '⌂'},
  lore: {word: 'Lore', label: 'Lore', plural: 'Lore', dated: false, order: 7, glyph: '✎'},
  treasure: {word: 'Treasure', label: 'Treasure', plural: 'Treasure', dated: false, order: 8, glyph: '◆'},
  task: {word: 'Task', label: 'Task', plural: 'Tasks', dated: true, order: 9, glyph: '☐'},
};

/** Order of buttons on the Capture screen. Task last: it is DM housekeeping, not session content. */
export const CAPTURE_TYPES: EntryType[] = ['strong', 'scene', 'plot', 'quest', 'hero', 'npc', 'location', 'lore', 'treasure', 'task'];

export type Task = {
  type: EntryType;
  text: string;
  due: number | null;
  done: boolean;
  file: string; // the note or document the keyword lives in
  page: number; // 0-based page the keyword sits on
  index: number; // 1-based keyword index within the page
  raw: string;
};

type ApiResponse<T> = {success: boolean; result: T | null; error: {code: number; message: string} | null};
type KeyWord = {keyword: string; page: number; index: number};

const TASK_RE = /^(Strong start|Scene|Plot|Quest|Hero|NPC|Location|Lore|Treasure|Task)?\s*(?:S(\d+|\?))?\s*\|\s*(.*?)\s*(\[x\])?$/i;
const SESSION_RE = /^DM session (\d+)$/i;
const DAY_RE = /^DM day (\d+)$/i;
const DAY_EVENT_RE = /^Day (\d+)\s*\|\s*(.+)$/i;
const DOC_RE = /^Doc\s*\|\s*(.+)$/i;
/** Pages to ask a closed document for; the host returns what exists. */
const DOC_SCAN_PAGES = 300;

/** Last session number seen by loadBoard, so screens hosted by DOC can still default sensibly. */
export let lastKnownSession = 1;

export type DayEvent = {day: number; text: string; page: number; index: number};

const WORD_TO_TYPE: Record<string, EntryType> = {
  'strong start': 'strong',
  scene: 'scene',
  plot: 'plot',
  hero: 'hero',
  npc: 'npc',
  location: 'location',
  lore: 'lore',
  quest: 'quest',
  treasure: 'treasure',
  task: 'task',
};

/** Measured on a Manta (Chauvet 3.31.45): 40-character keywords insert, 60 fail with 1001. */
export const KEYWORD_MAX = 40;

export function formatTask(type: EntryType, text: string, due: number | null, done = false): string {
  const clean = text.replace(/[|\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
  const meta = TYPE_META[type];
  const head = meta.dated ? `${meta.word}${meta.word ? ' ' : ''}S${due ?? '?'}` : meta.word;
  const tail = done ? ' [x]' : '';
  const room = KEYWORD_MAX - head.length - 3 - tail.length;
  return `${head} | ${clean.slice(0, Math.max(room, 4))}${tail}`;
}

export function parseTask(kw: KeyWord, file = ''): Task | null {
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
    file,
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

export type AttachedDoc = {name: string; path: string | null; page: number; index: number};
export type Board = {
  path: string;
  session: number;
  day: number;
  tasks: Task[];
  events: DayEvent[];
  docs: AttachedDoc[];
  notes: string[];
  keywordCount: number;
};

async function listDocumentPaths(): Promise<string[]> {
  // Lazy import keeps tasks.ts free of a cycle with refs.ts at module load.
  const {listDocuments} = await import('./refs');
  return listDocuments();
}

export async function loadBoard(): Promise<Board> {
  const path = await currentFile();
  const kws = await allKeywords(path);
  let session = 1;
  let day = 1;
  const tasks: Task[] = [];
  const events: DayEvent[] = [];
  const docs: AttachedDoc[] = [];
  const notes: string[] = [];
  for (const kw of kws) {
    const text = kw.keyword.trim();
    const em = DAY_EVENT_RE.exec(text);
    if (em) {
      events.push({day: Number(em[1]), text: em[2], page: kw.page, index: kw.index});
      continue;
    }
    const sm = SESSION_RE.exec(text);
    if (sm) {
      session = Number(sm[1]);
      continue;
    }
    const dm = DAY_RE.exec(text);
    if (dm) {
      day = Number(dm[1]);
      continue;
    }
    const docm = DOC_RE.exec(text);
    if (docm) {
      docs.push({name: docm[1].trim(), path: null, page: kw.page, index: kw.index});
      continue;
    }
    const t = parseTask(kw, path);
    if (t) {
      tasks.push(t);
    }
  }
  lastKnownSession = session;

  // Scenes written on attached documents (from DOC) join the board.
  if (docs.length > 0 && !isDocPath(path)) {
    let available: string[] = [];
    try {
      available = await listDocumentPaths();
    } catch (e) {
      notes.push(`could not list documents: ${String((e as Error)?.message ?? e)}`);
    }
    const pages = Array.from({length: DOC_SCAN_PAGES}, (_, i) => i);
    for (const d of docs) {
      const needle = d.name.toLowerCase();
      d.path = available.find(f => (f.split('/').pop() ?? '').toLowerCase().includes(needle)) ?? null;
      if (!d.path) {
        notes.push(`attached "${d.name}": no document under Document matches`);
        continue;
      }
      try {
        const res = (await PluginFileAPI.getKeyWords(d.path, pages)) as ApiResponse<KeyWord[]>;
        if (!res?.success) {
          notes.push(`${d.path.split('/').pop()}: ${res?.error?.code ?? '?'} ${res?.error?.message ?? ''}`);
          continue;
        }
        for (const kw of res.result ?? []) {
          const t = parseTask(kw, d.path);
          if (t) {
            tasks.push(t);
          }
        }
      } catch (e) {
        notes.push(`${d.path.split('/').pop()}: ${String((e as Error)?.message ?? e)}`);
      }
    }
  }
  events.sort((a, b) => a.day - b.day);
  return {path, session, day, tasks, events, docs, notes, keywordCount: kws.length};
}

export type WrapUpPlan = {toPush: Task[]; strongDone: Task[]; nextSession: number};

/** What "End session" will do, so the UI can show it before confirming. */
export function planWrapUp(board: Board): WrapUpPlan {
  const dueNow = board.tasks.filter(t => !t.done && TYPE_META[t.type].dated && t.due === board.session);
  return {
    strongDone: dueNow.filter(t => t.type === 'strong'),
    toPush: dueNow.filter(t => t.type !== 'strong'),
    nextSession: board.session + 1,
  };
}

/**
 * End the session: unfinished dated entries for this session move to the
 * next, the Strong start is marked done, the counter advances, and the
 * in-game day moves by `daysPassed`. Nothing is deleted. Entries living in
 * attached PDFs are rewritten where they are.
 */
export async function wrapUpSession(board: Board, daysPassed: number, onStep: (msg: string) => void): Promise<void> {
  const plan = planWrapUp(board);
  for (const t of plan.strongDone) {
    onStep(`strong start done: ${t.text}`);
    await rewriteTask(board.path, t, {done: true});
  }
  // Rewriting deletes and re-inserts keywords, which can renumber later
  // keywords on the same page. Process pushes from the highest index down so
  // the indices we hold stay valid.
  const pushes = [...plan.toPush].sort((a, b) => (a.file === b.file && a.page === b.page ? b.index - a.index : 0));
  for (const t of pushes) {
    onStep(`→ S${plan.nextSession}: ${t.text}`);
    await rewriteTask(board.path, t, {due: plan.nextSession});
  }
  onStep(`session ${board.session} → ${plan.nextSession}`);
  const loc = await findSessionKeyword(board.path);
  await setSession(board.path, loc, plan.nextSession);
  if (daysPassed > 0) {
    onStep(`day ${board.day} → ${board.day + daysPassed}`);
    await setDay(board.path, board.day + daysPassed);
  }
}

export async function attachDoc(notePath: string, fileName: string): Promise<string> {
  const stem = fileName.replace(/\.[^.]+$/, '');
  const keyword = `Doc | ${stem}`.slice(0, KEYWORD_MAX);
  await flush();
  unwrap<boolean>(await PluginFileAPI.insertKeyWord(notePath, 0, keyword), 'insertKeyWord');
  return keyword;
}

export async function detachDoc(notePath: string, doc: AttachedDoc): Promise<void> {
  await flush();
  unwrap<boolean>(await PluginFileAPI.deleteKeyWord(notePath, doc.page, doc.index), 'deleteKeyWord');
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
  const file = task.file || path;
  await flush();
  unwrap<boolean>(await PluginFileAPI.deleteKeyWord(file, task.page, task.index), 'deleteKeyWord');
  unwrap<boolean>(
    await PluginFileAPI.insertKeyWord(file, task.page, formatTask(next.type, next.text, next.due, next.done)),
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

export async function addDayEvent(path: string, day: number, text: string): Promise<string> {
  const head = `Day ${day} | `;
  const clean = text.replace(/[|\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, KEYWORD_MAX - head.length);
  const keyword = `${head}${clean}`;
  await flush();
  unwrap<boolean>(await PluginFileAPI.insertKeyWord(path, 0, keyword), 'insertKeyWord');
  return keyword;
}

export async function removeDayEvent(path: string, ev: DayEvent): Promise<void> {
  await flush();
  unwrap<boolean>(await PluginFileAPI.deleteKeyWord(path, ev.page, ev.index), 'deleteKeyWord');
}

/** Replace the in-game day keyword (delete the old one if present). */
export async function setDay(path: string, day: number): Promise<void> {
  await flush();
  const kws = await allKeywords(path);
  const hit = kws.find(k => DAY_RE.test(k.keyword.trim()));
  if (hit) {
    unwrap<boolean>(await PluginFileAPI.deleteKeyWord(path, hit.page, hit.index), 'deleteKeyWord');
  }
  unwrap<boolean>(await PluginFileAPI.insertKeyWord(path, 0, `DM day ${Math.max(1, day)}`), 'insertKeyWord');
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

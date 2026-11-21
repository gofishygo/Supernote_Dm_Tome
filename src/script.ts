/**
 * Typed script: Markdown written on the PC, compiled into the plugin at
 * build time (campaign/*.md → src/campaign.generated.json), and laid onto a
 * note page as text boxes. The plugin cannot read files on the device, so
 * bundling is the only pure-JS route; the cost is a rebuild per prep.
 */
import {PluginCommAPI, PluginFileAPI, PluginNoteAPI} from 'sn-plugin-lib';
import campaign from './campaign.generated.json';
import {currentFile, currentPage} from './tasks';

export type Block = {kind: 'text' | 'quote'; text: string};
export type Scene = {title: string; blocks: Block[]};
export type Session = {number: number; title: string; intro: Block[]; scenes: Scene[]};

export const SESSIONS: Session[] = (campaign as {sessions: Session[]}).sessions;
export const GENERATED_AT: string = (campaign as {generatedAt: string}).generatedAt;

type ApiResponse<T> = {success: boolean; result: T | null; error: {code: number; message: string} | null};

/** Layout constants in page pixels (Manta 1920×2560; scaled for other pages). */
const MARGIN = 120;
const TOP = 160;
const HEADING_PX = 48;
const BODY_PX = 34;
const LINE_GAP = 1.35;
const PARA_GAP = 28;
/** Supernote title style for scene headings: 1 black, 2 light grey, 3 dark grey, 4 shadow. */
const TITLE_STYLE = 2;

function estimateLines(text: string, fontPx: number, widthPx: number): number {
  const avgChar = fontPx * 0.52; // rough average glyph advance for a sans font
  const perLine = Math.max(10, Math.floor(widthPx / avgChar));
  return Math.max(1, Math.ceil(text.length / perLine));
}

async function pageSize(): Promise<{width: number; height: number}> {
  const res = (await PluginFileAPI.getPageSize(await currentFile(), await currentPage())) as ApiResponse<{width: number; height: number}>;
  if (!res?.success || !res.result) {
    throw new Error(`getPageSize failed: ${res?.error?.code ?? '?'} ${res?.error?.message ?? ''}`);
  }
  return res.result;
}

type Rect = {left: number; top: number; right: number; bottom: number};

/**
 * Turn the box just written into a Supernote title: lasso exactly its
 * rectangle, apply the title style, dismiss the lasso. There is no direct
 * "insert title" call; this is what a user would do by hand. Returns a note
 * for the step log; never throws, so a refusal leaves a plain bold heading.
 */
async function titleBox(rect: Rect): Promise<string> {
  try {
    const pad = 6;
    const lasso = (await PluginCommAPI.lassoElements({
      left: rect.left - pad,
      top: rect.top - pad,
      right: rect.right + pad,
      bottom: rect.bottom + pad,
    })) as ApiResponse<boolean>;
    if (!lasso?.success) {
      return `title skipped: lassoElements ${lasso?.error?.code ?? '?'} ${lasso?.error?.message ?? ''}`;
    }
    const set = (await PluginNoteAPI.setLassoTitle({style: TITLE_STYLE})) as ApiResponse<boolean>;
    const note = set?.success ? 'titled' : `title skipped: setLassoTitle ${set?.error?.code ?? '?'} ${set?.error?.message ?? ''}`;
    try {
      await PluginCommAPI.setLassoBoxState(2);
    } catch {
      // lasso may already be gone
    }
    return note;
  } catch (e) {
    return `title skipped: ${String((e as Error)?.message ?? e)}`;
  }
}

async function insertBox(text: string, top: number, fontPx: number, width: number, bold: boolean, italic: boolean): Promise<number> {
  const lines = estimateLines(text, fontPx, width);
  const height = Math.ceil(lines * fontPx * LINE_GAP) + 16;
  const res = (await PluginNoteAPI.insertText({
    textContentFull: text,
    textRect: {left: MARGIN, top, right: MARGIN + width, bottom: top + height},
    fontSize: fontPx,
    textAlign: 0,
    textBold: bold ? 1 : 0,
    textItalics: italic ? 1 : 0,
    textFrameWidthType: 0,
  })) as ApiResponse<boolean>;
  if (!res?.success) {
    throw new Error(`insertText failed: ${res?.error?.code ?? '?'} ${res?.error?.message ?? ''}`);
  }
  return top + height + PARA_GAP;
}

/**
 * Lay one scene onto the current note page starting at `startTop` px.
 * Returns the y position after the last box, so callers can chain scenes,
 * and the number of boxes written. Stops with an error if the page is full.
 */
export async function insertScene(
  scene: Scene,
  startTop = TOP,
  makeTitle = true,
): Promise<{nextTop: number; boxes: number; titleNote: string}> {
  const size = await pageSize();
  const scale = size.width / 1920;
  const width = size.width - 2 * MARGIN;
  let top = startTop;
  let boxes = 0;
  const limit = size.height - MARGIN;

  const place = async (text: string, fontPx: number, bold: boolean, italic: boolean): Promise<Rect> => {
    const px = Math.round(fontPx * scale);
    if (top + px * 2 > limit) {
      throw new Error(`page full after ${boxes} boxes; continue on the next page`);
    }
    const before = top;
    top = await insertBox(text, top, px, width, bold, italic);
    boxes++;
    return {left: MARGIN, top: before, right: MARGIN + width, bottom: top - PARA_GAP};
  };

  const headingRect = await place(scene.title, HEADING_PX, true, false);
  const titleNote = makeTitle ? await titleBox(headingRect) : 'plain heading';
  for (const b of scene.blocks) {
    await place(b.text, BODY_PX, false, b.kind === 'quote');
  }
  return {nextTop: top, boxes, titleNote};
}

function ok<T>(raw: unknown, what: string): T {
  const res = raw as ApiResponse<T> | null | undefined;
  if (!res?.success) {
    throw new Error(`${what} failed: ${res?.error?.code ?? '?'} ${res?.error?.message ?? ''}`);
  }
  return res.result as T;
}

/** The template name to use for new pages: the current page's, else the first system template. */
async function pageTemplateName(path: string, page: number): Promise<string> {
  try {
    const info = ok<{name: string}>(await PluginFileAPI.getNotePageTemplate(path, page), 'getNotePageTemplate');
    if (info?.name) {
      return info.name;
    }
  } catch {
    // fall through
  }
  const list = ((await PluginCommAPI.getNoteSystemTemplates()) ?? []) as Array<{name: string}>;
  if (!list[0]?.name) {
    throw new Error('no template name available for new pages');
  }
  return list[0].name;
}

export type PageJob = {label: string; scene: Scene | null; intro?: {title: string; blocks: Block[]}};

/**
 * Lay a session across fresh pages inserted after the current one: an intro
 * page if the session has one, then one scene per page. Reports each step
 * through `onStep` so a failure names the call that refused.
 */
export async function insertSessionAsPages(session: Session, onStep: (msg: string) => void): Promise<number> {
  const path = await currentFile();
  const here = await currentPage();
  const jobs: PageJob[] = [];
  if (session.intro.length > 0) {
    jobs.push({label: session.title, scene: {title: session.title, blocks: session.intro}});
  }
  for (const sc of session.scenes) {
    jobs.push({label: sc.title, scene: sc});
  }
  if (jobs.length === 0) {
    throw new Error('this session has no scenes');
  }

  onStep('saving the open note');
  try {
    await PluginNoteAPI.saveCurrentNote();
  } catch {
    // nothing to save
  }

  const template = await pageTemplateName(path, here);
  onStep(`inserting ${jobs.length} page(s) after page ${here + 1} with template "${template}"`);
  for (let i = 0; i < jobs.length; i++) {
    ok<boolean>(
      await PluginFileAPI.insertNotePage({notePath: path, page: here + 1 + i, template}),
      `insertNotePage(${here + 1 + i})`,
    );
  }

  onStep('reloading the note so the new pages are live');
  ok<boolean>(await PluginCommAPI.reloadFile(), 'reloadFile');

  for (let i = 0; i < jobs.length; i++) {
    const page = here + 1 + i;
    onStep(`page ${page + 1}: jumping`);
    ok<boolean>(await PluginCommAPI.jumpToPage(page), `jumpToPage(${page})`);
    const now = await currentPage();
    if (now !== page) {
      throw new Error(`after jumpToPage(${page}) the current page is ${now}; stopping so boxes do not land on the wrong page`);
    }
    onStep(`page ${page + 1}: writing "${jobs[i].label}"`);
    const r = await insertScene(jobs[i].scene!, TOP, i > 0 || session.intro.length === 0);
    onStep(`page ${page + 1}: ${r.boxes} boxes, ${r.titleNote}`);
  }
  onStep('saving');
  try {
    await PluginNoteAPI.saveCurrentNote();
  } catch {
    // ignore
  }
  await PluginCommAPI.jumpToPage(here + 1);
  return jobs.length;
}

export function sceneSummary(scene: Scene): string {
  const words = scene.blocks.map(b => b.text).join(' ').split(/\s+/).filter(Boolean).length;
  return `${scene.blocks.length} block${scene.blocks.length === 1 ? '' : 's'} · ${words} words`;
}

/**
 * Typed script: Markdown written on the PC, compiled into the plugin at
 * build time (campaign/*.md → src/campaign.generated.json), and laid onto a
 * note page as text boxes. The plugin cannot read files on the device, so
 * bundling is the only pure-JS route; the cost is a rebuild per prep.
 */
import {PluginFileAPI, PluginNoteAPI} from 'sn-plugin-lib';
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
export async function insertScene(scene: Scene, startTop = TOP): Promise<{nextTop: number; boxes: number}> {
  const size = await pageSize();
  const scale = size.width / 1920;
  const width = size.width - 2 * MARGIN;
  let top = startTop;
  let boxes = 0;
  const limit = size.height - MARGIN;

  const place = async (text: string, fontPx: number, bold: boolean, italic: boolean) => {
    const px = Math.round(fontPx * scale);
    if (top + px * 2 > limit) {
      throw new Error(`page full after ${boxes} boxes; continue on the next page`);
    }
    top = await insertBox(text, top, px, width, bold, italic);
    boxes++;
  };

  await place(scene.title, HEADING_PX, true, false);
  for (const b of scene.blocks) {
    await place(b.text, BODY_PX, false, b.kind === 'quote');
  }
  return {nextTop: top, boxes};
}

export function sceneSummary(scene: Scene): string {
  const words = scene.blocks.map(b => b.text).join(' ').split(/\s+/).filter(Boolean).length;
  return `${scene.blocks.length} block${scene.blocks.length === 1 ? '' : 's'} · ${words} words`;
}

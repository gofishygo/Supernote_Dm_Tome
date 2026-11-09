/**
 * SDK probes for version 0.1.
 *
 * Each probe exercises one SDK primitive that a DM Tome feature depends on and
 * returns a one-line, human-readable result. The point of this release is to
 * learn, on real hardware, which calls work on the Manta and what they return,
 * before building features on top of them.
 */
import {
  FileUtils,
  PluginCommAPI,
  PluginFileAPI,
  PluginManager,
  PluginNoteAPI,
} from 'sn-plugin-lib';

export type Probe = {
  key: string;
  label: string;
  /** Which feature this primitive unlocks. Shown in the UI as a hint. */
  unlocks: string;
  run: () => Promise<string>;
};

type ApiResponse<T> = {
  success: boolean;
  result: T | null;
  error: {code: number; message: string} | null;
};

const DEVICE_NAMES = ['A5', 'A6', 'A6X', 'A5X', 'Nomad', 'Manta'];

const PERM_FILE_READ = 'plugin.permission.FILE:READ';

/** Format an APIResponse as a short string. */
function fmt(raw: unknown): string {
  const res = raw as ApiResponse<unknown> | null | undefined;
  if (!res) {
    return 'no response (null)';
  }
  if (res.success) {
    return JSON.stringify(res.result);
  }
  return `FAILED ${res.error?.code ?? '?'}: ${res.error?.message ?? 'unknown'}`;
}

function unwrap<T>(raw: unknown, what: string): T {
  const res = raw as ApiResponse<T> | null | undefined;
  if (!res?.success || res.result === null || res.result === undefined) {
    throw new Error(`${what}: ${fmt(res)}`);
  }
  return res.result;
}

async function currentFile(): Promise<string> {
  return unwrap(
    (await PluginCommAPI.getCurrentFilePath()) as ApiResponse<string>,
    'getCurrentFilePath',
  );
}

async function currentPage(): Promise<number> {
  return unwrap(
    (await PluginCommAPI.getCurrentPageNum()) as ApiResponse<number>,
    'getCurrentPageNum',
  );
}

async function pageSize(): Promise<{width: number; height: number}> {
  await ensureFileRead();
  const path = await currentFile();
  const page = await currentPage();
  return unwrap(
    (await PluginFileAPI.getPageSize(path, page)) as ApiResponse<{
      width: number;
      height: number;
    }>,
    'getPageSize',
  );
}

/** Ask for file read permission if we do not already have it. */
async function ensureFileRead(): Promise<string> {
  const has = await PluginManager.hasPermission(PERM_FILE_READ);
  if (has && has > 0) {
    return `already granted (${has})`;
  }
  const choice = await PluginManager.requestPermission(
    PERM_FILE_READ,
    'DM Tome needs to list your PDFs to build reference links.',
  );
  return `user chose ${choice} (0 deny, 1 once, 2 always, -1 cancelled)`;
}

/** Probes that run automatically when the console opens. */
export const STATUS_PROBES: Probe[] = [
  {
    key: 'device',
    label: 'Device type',
    unlocks: 'page size defaults, coordinate math',
    run: async () => {
      const t = await PluginManager.getDeviceType();
      return `${t} (${DEVICE_NAMES[t] ?? 'unknown'})`;
    },
  },
  {
    key: 'file',
    label: 'Current file',
    unlocks: 'knowing which note or PDF is open',
    run: async () => fmt(await PluginCommAPI.getCurrentFilePath()),
  },
  {
    key: 'page',
    label: 'Current page (0-based)',
    unlocks: 'inserting on the right page',
    run: async () => fmt(await PluginCommAPI.getCurrentPageNum()),
  },
  {
    key: 'pagesize',
    label: 'Page size (px)',
    unlocks: 'text box layout, recognition input',
    run: async () => JSON.stringify(await pageSize()),
  },
  {
    key: 'display',
    label: 'Page display size',
    unlocks: 'layout when zoomed or split',
    run: async () => JSON.stringify(await PluginCommAPI.getPageDisplaySize()),
  },
  {
    key: 'handwrite',
    label: 'Can handwrite here',
    unlocks: 'NOTE vs DOC behaviour',
    run: async () => fmt(await PluginCommAPI.canHandwrite()),
  },
  {
    key: 'pen',
    label: 'Pen info',
    unlocks: 'matching generated strokes to your pen',
    run: async () => fmt(await PluginCommAPI.getPenInfo()),
  },
  {
    key: 'paths',
    label: 'Storage paths',
    unlocks: 'where PDFs, notes and exports live',
    run: async () => {
      const plugin = await PluginManager.getPluginDirPath();
      const external = await FileUtils.getExternalDirPath();
      const exportDir = await FileUtils.getExportPath();
      return `plugin=${plugin} | external=${JSON.stringify(
        external,
      )} | export=${exportDir}`;
    },
  },
];

/** Probes the user triggers by tapping. Some change the open note. */
export const ACTION_PROBES: Probe[] = [
  {
    key: 'insertText',
    label: 'Insert a text box on this page',
    unlocks: 'writing the scene script into the note',
    run: async () => {
      const res = await PluginNoteAPI.insertText({
        textContentFull: 'DM Tome was here. Roll for initiative.',
        textRect: {left: 120, top: 160, right: 1200, bottom: 260},
        fontSize: 40,
        textAlign: 0,
        textBold: 1,
      });
      return fmt(res);
    },
  },
  {
    key: 'permission',
    label: 'Request file-read permission',
    unlocks: 'listing PDFs for the reference index',
    run: ensureFileRead,
  },
  {
    key: 'pdfs',
    label: 'List PDFs on device',
    unlocks: 'the reference index',
    run: async () => {
      const perm = await ensureFileRead();
      const list = (await FileUtils.getFileList(['pdf'])) ?? [];
      const head = list.slice(0, 8).join(' ; ');
      return `perm ${perm} | ${list.length} PDFs. First: ${head}`;
    },
  },
  {
    key: 'notes',
    label: 'List .note files on device',
    unlocks: 'campaign and session note discovery',
    run: async () => {
      const perm = await ensureFileRead();
      const list = (await FileUtils.getFileList(['note'])) ?? [];
      const head = list.slice(0, 8).join(' ; ');
      return `perm ${perm} | ${list.length} notes. First: ${head}`;
    },
  },
  {
    key: 'jump',
    label: 'Jump to page 1 of this file',
    unlocks: 'navigating from the console',
    run: async () => fmt(await PluginCommAPI.jumpToPage(0)),
  },
  {
    key: 'openSelf',
    label: 'openFile(current file, page 0)',
    unlocks: 'opening a rulebook PDF at a page',
    run: async () => {
      const path = await currentFile();
      return JSON.stringify(await PluginFileAPI.openFile(path, 0));
    },
  },
  {
    key: 'keywords',
    label: 'Read keywords on this page',
    unlocks: 'storing task metadata inside the note',
    run: async () => {
      const perm = await ensureFileRead();
      const path = await currentFile();
      const page = await currentPage();
      return `perm ${perm} | ${fmt(await PluginFileAPI.getKeyWords(path, [page]))}`;
    },
  },
  {
    key: 'titles',
    label: 'Read titles in this note',
    unlocks: 'scene headings and navigation',
    run: async () => {
      await ensureFileRead();
      const path = await currentFile();
      const total = unwrap<number>(
        await PluginFileAPI.getNoteTotalPageNum(path),
        'getNoteTotalPageNum',
      );
      const pages = Array.from({length: total}, (_, i) => i);
      const res = (await PluginFileAPI.getTitles(path, pages)) as ApiResponse<
        unknown[]
      >;
      if (!res.success) {
        return fmt(res);
      }
      return `${res.result?.length ?? 0} titles across ${total} pages`;
    },
  },
];

/**
 * Lasso capture probe: recognize whatever the user circled.
 * Runs automatically when the UI was opened from the lasso button.
 */
export async function recognizeLasso(): Promise<string> {
  const counts = await PluginCommAPI.getLassoElementTypeCounts();
  const elements = unwrap<Object[]>(
    await PluginCommAPI.getLassoElements(),
    'getLassoElements',
  );
  const size = await pageSize();
  const text = await PluginCommAPI.recognizeElements(elements, size);
  return `counts=${fmt(counts)} | ${elements.length} elements | text: ${fmt(
    text,
  )}`;
}

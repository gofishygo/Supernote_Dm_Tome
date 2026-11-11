/**
 * Generic SDK probes. Each one exercises a single primitive and returns a
 * one-line result. Run them on the real device before building features:
 * there is no emulator for PluginHost, and firmware can lag the SDK.
 */
import {
  FileUtils,
  NativePluginManager,
  PluginCommAPI,
  PluginFileAPI,
  PluginManager,
  PluginNoteAPI,
} from 'sn-plugin-lib';
// Deep import: the SDK does not re-export its native API module, and the
// published .ts has no declaration. Used only to list native method names.
// @ts-expect-error no type declarations for this path
import NativePluginAPI from 'sn-plugin-lib/lib/module/module/NativePluginAPI';

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

/** Print everything a thrown error carries, since native rejections hide
 *  their detail in code/userInfo rather than message. */
function describe(e: unknown): string {
  const o = e as Record<string, unknown> | null;
  if (!o || typeof o !== 'object') {
    return String(e);
  }
  const keys = ['name', 'code', 'message', 'userInfo', 'nativeStackAndroid'];
  const parts = keys
    .filter(k => o[k] !== undefined)
    .map(k => `${k}=${typeof o[k] === 'string' ? o[k] : JSON.stringify(o[k])}`);
  return parts.length ? parts.join(' ') : String(e);
}

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

/**
 * Normalise whatever the native listFiles returns into string paths. The SDK
 * source resolves string[], but the firmware's copy may return objects or a
 * single string; assuming strings produced "undefined is not a function".
 */
function toPathList(raw: unknown): string[] {
  if (raw === null || raw === undefined) {
    return [];
  }
  const arr: unknown[] = Array.isArray(raw)
    ? raw
    : typeof raw === 'object'
    ? Object.values(raw as Record<string, unknown>)
    : [raw];
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

/** Walk a folder with FileUtils.listFiles, which takes a plain path. */
async function listRecursive(dir: string, suffix: string, depth: number): Promise<string[]> {
  const fu = FileUtils as unknown as Record<string, unknown>;
  if (typeof fu.listFiles !== 'function') {
    // Older firmware: no listFiles. getFileList(suffixes) scans the shared
    // folders itself; strip the leading dot from the suffix.
    const list = (await FileUtils.getFileList([suffix.replace(/^\./, '')])) ?? [];
    return [`(via getFileList)`, ...list];
  }
  let raw: unknown;
  try {
    raw = await FileUtils.listFiles(dir);
  } catch (e) {
    return [`[${dir}: ${describe(e)}]`];
  }
  const out: string[] = [];
  for (const p of toPathList(raw)) {
    if (p.toLowerCase().endsWith(suffix)) {
      out.push(p);
    } else if (depth > 0 && !/\.[A-Za-z0-9]{1,5}$/.test(p)) {
      out.push(...(await listRecursive(p, suffix, depth - 1)));
    }
  }
  return out;
}

/** Ask for file read permission if we do not already have it. */
/**
 * Documented flow (docs.supernote.com/en/plugin-base/permission): the
 * permission must be listed in PluginConfig.json "uses-permissions"; then
 * hasPermission() === 1 means granted, otherwise requestPermission() shows a
 * three-option dialog. "Allow this time only" expires when the plugin closes,
 * so this runs before every file call, not once at install.
 */
async function ensureFileRead(): Promise<string> {
  try {
    const has = await PluginManager.hasPermission(PERM_FILE_READ);
    if (has === 1) {
      return 'granted';
    }
    const choice = await PluginManager.requestPermission(
      PERM_FILE_READ,
      'This plugin needs to read your notes and documents.',
    );
    const words = {0: 'denied', 1: 'allowed once', 2: 'always allowed', '-1': 'cancelled'} as Record<string, string>;
    return `${words[String(choice)] ?? choice}`;
  } catch (e) {
    return `perm-api REJECTED ${describe(e)}`;
  }
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
    key: 'surface',
    label: 'Native methods on this firmware',
    unlocks: 'knowing which SDK calls exist before relying on them',
    run: async () => {
      const want: Record<string, string[]> = {
        FileUtils: ['exists', 'listFiles', 'getFileList', 'getExportPath', 'copyFile', 'makeDir', 'deleteFile', 'getFileMD5', 'openFilePath', 'getExternalDirPath', 'getImageList'],
        NativePluginManager: ['hasPermission', 'requestPermission', 'showPluginView', 'getOrientation', 'registerConfigButton'],
        NativePluginAPI: ['openFile', 'jumpToPage', 'canHandwrite', 'recognizeElements', 'getPenInfo', 'lassoElements', 'insertTextLink', 'insertKeyWord', 'getCurrentDocText', 'insertPageElements', 'deleteElements', 'getPageSize'],
      };
      const mods: Record<string, unknown> = {FileUtils, NativePluginManager, NativePluginAPI};
      const out: string[] = [];
      for (const [name, methods] of Object.entries(want)) {
        const m = mods[name] as Record<string, unknown>;
        const keys = Object.keys(m ?? {});
        const present = methods.filter(k => typeof m?.[k] === 'function');
        const missing = methods.filter(k => typeof m?.[k] !== 'function');
        out.push(`${name}: ${keys.length} keys; present=[${present.join(',')}] MISSING=[${missing.join(',')}]`);
      }
      return out.join(' || ');
    },
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
    key: 'pluginDir',
    label: 'Plugin directory',
    unlocks: 'where the plugin may write its own files',
    run: async () => String(await PluginManager.getPluginDirPath()),
  },
  {
    key: 'exportDir',
    label: 'Export directory',
    unlocks: 'root of device storage (parent of Note, Document, MyStyle)',
    run: async () => String(await FileUtils.getExportPath()),
  },
  // FileUtils.getExternalDirPath() and getFileList() call getCurrentActivity()
  // in the host's native module, which is null inside PluginHost and crashes
  // the runtime. Never call them. listFiles() takes a plain path and is safe.
  {
    key: 'hasPerm',
    label: 'hasPermission(FILE:READ) raw',
    unlocks: 'knowing whether the permission API exists on this firmware',
    run: async () => {
      try {
        return `status ${String(await PluginManager.hasPermission(PERM_FILE_READ))}`;
      } catch (e) {
        return `REJECTED ${describe(e)}`;
      }
    },
  },
  {
    key: 'reqPerm',
    label: 'requestPermission(FILE:READ) raw',
    unlocks: 'the permission dialog, or the reason it never appears',
    run: async () => {
      try {
        return `choice ${String(
          await PluginManager.requestPermission(
            PERM_FILE_READ,
            'This plugin needs to read your notes and documents.',
          ),
        )}`;
      } catch (e) {
        return `REJECTED ${describe(e)}`;
      }
    },
  },
];

/** Probes the user triggers by tapping. Some change the open note. */
export const ACTION_PROBES: Probe[] = [
  {
    key: 'insertText',
    label: 'Insert a text box on this page',
    unlocks: 'writing text into the note',
    run: async () => {
      const res = await PluginNoteAPI.insertText({
        textContentFull: 'Inserted by the probe kit.',
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
    key: 'listRaw',
    label: 'listFiles raw (Document folder)',
    unlocks: 'the real shape of directory listings on this firmware',
    run: async () => {
      const perm = await ensureFileRead();
      const exp = await FileUtils.getExportPath();
      const root = String(exp).replace(/\/EXPORT$/, '');
      const raw: unknown = await FileUtils.listFiles(`${root}/Document`);
      const kind = Array.isArray(raw) ? `array(${(raw as unknown[]).length})` : typeof raw;
      return `perm ${perm} | export=${JSON.stringify(exp)} | listFiles -> ${kind}: ${JSON.stringify(raw)?.slice(0, 500)}`;
    },
  },
  {
    key: 'pdfs',
    label: 'List PDFs on device',
    unlocks: 'finding documents to link or open',
    run: async () => {
      const perm = await ensureFileRead();
      const root = String(await FileUtils.getExportPath()).replace(/\/EXPORT$/, '');
      const list = await listRecursive(`${root}/Document`, '.pdf', 3);
      return `perm ${perm} | ${list.length} PDFs under ${root}/Document. First: ${list
        .slice(0, 6)
        .join(' ; ')}`;
    },
  },
  {
    key: 'notes',
    label: 'List .note files on device',
    unlocks: 'finding notes',
    run: async () => {
      const perm = await ensureFileRead();
      const root = String(await FileUtils.getExportPath()).replace(/\/EXPORT$/, '');
      const list = await listRecursive(`${root}/Note`, '.note', 3);
      return `perm ${perm} | ${list.length} notes under ${root}/Note. First: ${list
        .slice(0, 6)
        .join(' ; ')}`;
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
    unlocks: 'opening a document at a page',
    run: async () => {
      const path = await currentFile();
      return JSON.stringify(await PluginFileAPI.openFile(path, 0));
    },
  },
  {
    key: 'keywords',
    label: 'Read keywords on this page',
    unlocks: 'per-page string storage inside the note',
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
    unlocks: 'headings and navigation',
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

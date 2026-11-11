# Verified on device

Facts established by running probe builds on a Supernote Manta (A5X2),
firmware Chauvet 3.31.45, with `sn-plugin-lib` 0.2.3 and the
`@supernote-plugin/sn-plugin-template` 1.0.13 scaffold, November 2026. Each
line is something that was observed, not read. Where firmware may differ,
re-probe rather than assume.

## Runtime and view

- The plugin view is **1024 × 1365 dp** in portrait (`useWindowDimensions`).
  The panel is 1920 × 2560 px, so density is about 1.875. Lay out in dp.
- The host constrains the root view: a centred template view renders centred,
  and `flex: 1` layouts work. Sizing the root from the window is still a
  cheap safety net.
- `ErrorUtils.setGlobalHandler` works in the plugin runtime; a React error
  boundary works; `console.log` is invisible. Print to the screen.
- Release bundles use Metro inline requires: `App.tsx` and its imports are
  evaluated at first mount, not at startup. Load `App` inside the
  `registerComponent` factory with a try/catch that renders the exception.
- A clean hello-world bundle is ~520 modules / ~1.0 MB raw / ~260 KB zipped.
  Count with `grep -c '__d(' build/generated/*.bundle`. A doubled count means
  a duplicated dependency graph (nested `node_modules/node_modules` or a
  symlinked path) and produces a view that never mounts while buttons still
  work.

## Buttons and events

- Toolbar (type 1) and lasso (type 2) buttons register and appear with
  `showType: 1`. The template's default name "Side Button" is just a label.
- The button event delivered to `registerButtonListener` has more fields
  than `{id, name, icon}`: at least `bgColor` (string) and a press-type
  number. Read only the documented keys.
- `App` gets no props; store the last event in a module-level variable in
  `index.js` and read it in `App` to choose a screen.

## Permissions

- `requestPermission` without a manifest declaration rejects with
  `PluginException: This permission has not been declared.` (code 1500).
- With `"uses-permissions": ["plugin.permission.FILE:READ", ...]` in
  `PluginConfig.json`, the three-option dialog appears. "Always allow"
  persists across plugin opens; `hasPermission` then returns `1`.
- Before `FILE:READ` is granted, `getKeyWords`, `getTitles`, `getPageSize`
  fail with `1503 file read permission denied`, even for the open file.
- Settings → Apps → Plugins shows no per-plugin permission page on this
  firmware; the dialog is the only grant path. Changing the manifest means
  rebuild and reinstall.

## Calls that work

| Call | Result observed |
|---|---|
| `PluginManager.getDeviceType()` | `5` (Manta) |
| `PluginCommAPI.getCurrentFilePath()` / `getCurrentPageNum()` | path string / 0-based number |
| `PluginCommAPI.jumpToPage(0)` | `success: true` from inside the plugin view |
| `PluginCommAPI.canHandwrite()` | boolean |
| `PluginCommAPI.getPenInfo()` | `{type, color, width}` |
| `PluginFileAPI.getPageSize(path, page)` | `{width, height}` after `FILE:READ` |
| `PluginFileAPI.getKeyWords(path, pages)` / `getTitles(path, pages)` | arrays after `FILE:READ` |
| `PluginFileAPI.getNoteTotalPageNum(path)` | number |
| `PluginCommAPI.getLassoElements()` → `recognizeElements(elements, pageSize)` | the handwritten word as text, after `FILE:READ` |
| `PluginNoteAPI.insertText({...})` | text box appears on the page |
| `FileUtils.getExportPath()` | `<storage root>/EXPORT` |
| `FileUtils.listFiles(dir)` | present; walking `Document` and `Note` lists PDFs and notes once the result is normalised (see below) |

## Hosting-app scope (error 102)

With a PDF open in DOC: `getNoteTotalPageNum(pdfPath)` and
`createNote(...)` / `insertKeyWord(notePath, ...)` on a `.note` return
`102 This app is not allowed to use this API, please call a different API`.
The same calls succeed with a note open in NOTE. Use
`PluginDocAPI.getCurrentTotalPages()` for page counts in DOC. Whether DOC may
read a note's keywords, or NOTE a document's, is being probed.

## Keywords and templates

- `insertKeyWord` rejects long keywords with `1001 the keyword exceeds the
  maximum length limit`; ~25 characters works, ~100 does not. Inserting a
  keyword on a PDF page from DOC is allowed.
- `createNote` with a made-up template name fails with `802 Background
  template file does not exist`; use `getNoteSystemTemplates()[i].name`.

## Calls that crash or mislead

- `FileUtils.getExternalDirPath()` **kills the plugin runtime** with no JS
  error. The host module's Java calls `getCurrentActivity()`, which is null
  in PluginHost. `getFileList()` and `getImageList()` use the same call.
- `FileUtils.listFiles()` resolves something other than a plain `string[]`
  on this firmware, so code that calls string methods on each entry throws
  `TypeError: undefined is not a function`. Normalise: accept strings,
  objects with `path`/`filePath`/`name`, or a map. `FileUtils` is absent
  from the official API reference, so none of its shapes are promised.
- `getPageDisplaySize()` is deprecated after SDK 0.1.65. Use `getPageSize`.

## Native method inventory (3.31.45)

Enumerated with `Object.keys(module)` and `typeof module.x === 'function'`:

- `FileUtils` (15 keys): `exists`, `listFiles`, `getFileList`,
  `getExportPath`, `copyFile`, `makeDir`, `deleteFile`, `getFileMD5`,
  `openFilePath`, plus the crashing `getExternalDirPath` / `getImageList`.
- `NativePluginManager` (23 keys) includes `hasPermission`,
  `requestPermission`, `showPluginView`, `getOrientation`,
  `registerConfigButton`.
- `NativePluginAPI` (95 keys) includes `openFile`, `jumpToPage`,
  `canHandwrite`, `recognizeElements`, `getPenInfo`, `lassoElements`,
  `insertTextLink`, `insertKeyWord`, `getCurrentDocText`,
  `insertPageElements`, `deleteElements`, `getPageSize`.

## Device storage

Storage root is `getExportPath()` minus `/EXPORT`, typically
`/storage/emulated/0`. Shared folders: `Document` (PDF, EPUB), `Note`
(`.note`), `INBOX`, `MyStyle` (plugin packages go here), `EXPORT`,
`SCREENSHOT`. The plugin's own writable folder is
`/data/data/com.ratta.supernote.pluginhost/files/plugins/<pluginID>`.

## Install and upgrade

- Firmware without Settings → Apps → Plugins needs a system update first.
- Copy the `.snplg` into `MyStyle` over USB (MTP; no drive letter on
  Windows, so script it through `Shell.Application`), then Settings → Apps →
  Plugins → Add Plugin.
- Rebuilding with the same `pluginID` and a higher `versionCode` installs as
  an upgrade. Upload under a versioned file name so the picker shows which
  build is which.

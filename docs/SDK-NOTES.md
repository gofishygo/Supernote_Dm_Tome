# SDK notes: what we learned beyond the April 2026 docs

Verified against `sn-plugin-lib` **0.2.3** (published 2026-10-12) and the
`@supernote-plugin/sn-plugin-template` 1.0.13 scaffold, on 2026-11-08.

## Build facts

- `buildPlugin.sh` / `.ps1` run `react-native bundle --platform android
  --dev false`, copy assets, write `PluginConfig.json`, and zip. **Gradle runs
  only if Java or Kotlin sources exist** in the project or in a third-party
  node module. A pure-JS plugin needs Node only.
- The bundle is plain Metro JavaScript, not Hermes bytecode. The April notes
  said "Hermes bytecode"; that is wrong for this template.
- Output `.snplg` contents: `DmTome.bundle`, `drawable-mdpi/*.png`,
  `PluginConfig.json`. About 260 KB zipped for a hello-world.
- The template still pins `sn-plugin-lib ^0.1.19`. We bumped to `^0.2.3`.

## Methods present in 0.2.3 that the April docs did not list

| Method | Signature | Why it matters for DM Tome |
|---|---|---|
| `PluginFileAPI.openFile(filePath, page)` | `Promise<Object>` | Open a rulebook PDF at a page from the console. Core of the reference guide. |
| `PluginCommAPI.jumpToPage(page)` | `APIResponse<boolean>` | Navigate within the open file. |
| `PluginCommAPI.canHandwrite()` | `APIResponse<boolean>` | Detect NOTE vs read-only DOC views. |
| `PluginCommAPI.getPageDisplaySize()` | `Promise<Object>` | Layout when the page is zoomed or split. |
| `PluginCommAPI.insertPageElements(elements, page, layer)` | `APIResponse<boolean>` | Batch insert onto a specific page without the page being open. |
| `PluginDocAPI.generateCurrentDocImage(page, pngPath, size, type)` | | Thumbnail of a PDF page. |
| `PluginManager.hasPermission(name)` / `requestPermission(name, desc)` | `Promise<number>` | Permission system: `plugin.permission.FILE:READ`, `FILE:WRITE`, `FILE:DELETE`, `INTERNET`. 0 deny, 1 once, 2 always, -1 cancelled. |
| `PluginManager.showPluginView()` | | Open our own UI programmatically. |
| `PluginManager.registerPluginLifeListener` | | Named differently from the docs' `addPluginLifeListener`. |
| `PluginManager.registerMotionListener(type, listener)` | | Raw pointer events (`EventType.MOTION_EVENT`). |

Also present on the native side but without a documented wrapper yet:
`batchUpdatePageElements`, `deletePageElements`, `modifyPageElements`,
`fillRegionByPoint`, `flipLassoElements`, `generateLassoPreview`,
`generateLayerPreviewImage`, `getCacheElement`, `getPathEncryptionStatus`,
`lockPathAccess`, `unlockPathWithPassword`.

`EventType` enum: `PEN_UP`, `IMPORT_STICKER`, `MOTION_EVENT`, `PLUGIN_LIFE`.

## Hard constraints that shape the design

1. **No text file read or write.** `FileUtils` can `exists`, `makeDir`,
   `copyFile`, `renameToFile`, `deleteFile`, `deleteDir`, `listFiles`,
   `getFileList(suffixes)`, `getImageList`, `getFileMD5`, `getExportPath`,
   `getExternalDirPath`, `openFilePath`, `getStorageAvailableSpace`. Nothing
   returns file contents. So a Markdown script on disk cannot be read by a
   pure-JS plugin. Consequences in `DESIGN.md`.
2. **Text we can read**: text boxes in a note (`getElements` →
   `element.textBox.textContentFull`), keywords (`getKeyWords`), titles
   (`getTitles`), lasso text (`getLassoText`), DOC page text
   (`PluginDocAPI.getCurrentDocText(page)`), and recognized handwriting
   (`recognizeElements`). These are our storage and input channels.
3. **UI is full-screen or nothing** (`showType` 1 or 0). No sidebars.
4. **Links are first-class**: `insertTextLink` with `linkType 2` (DOC) and
   `destPage` makes a tappable link in a note that opens a PDF at a page.
   Links live on the main layer only.
5. **Keywords are a key-value store inside the note file.** `insertKeyWord`
   stores a string per page, `getKeyWords` reads them back, and they survive
   sync and plugin reinstalls. Ideal for small metadata like task due dates.
6. **Recognition input needs the page size**:
   `recognizeElements(elements, {width, height})`. Get it from
   `PluginFileAPI.getPageSize(path, page)`. Manta portrait is 1920 × 2560.
7. **Pages are 0-based** everywhere except keyword `index`, which is 1-based.

## Lesson from the blank-screen hunt (2026-11-09)

Versions 0.1.0 and 0.1.1 installed and showed their button but opened to
nothing, while the untouched template rendered. Bisecting with side-by-side
packages showed the manifest was fine and the SDK versions were equivalent.
The real cause was in the build machine: a stray `node_modules/node_modules`
folder. Node's lookup walks parent directories, so React Native's own files
resolved `react` from the nested copy while `index.js` used the top copy.
Metro bundled the whole graph twice (878 modules instead of 525), both copies
of `AppRegistry` registered with the bridge, and the host's request to run
`DmTome` reached the copy with nothing registered. No error is raised
anywhere in that chain. Rule: when a plugin's buttons work but its view does
not, compare bundle module counts against a fresh template before touching
the code.

## Confirmed on the Manta (0.1.2, 2026-11-09)

- The plugin view is **1024 × 1365 dp** (`useWindowDimensions`). With a
  1920 × 2560 px panel that is a density of about 1.875. Layout in dp; convert
  only when talking to page coordinates, which are in px.
- The host does constrain the root view's height: a centered template view
  rendered centered. `flex: 1` layouts are safe.
- The button event has more fields than the documented `{id, name, icon}`:
  at least `bgColor` (string, "0") and a press-type number were present.
  Treat the object as open-ended and read only the documented keys.
- `ErrorUtils.setGlobalHandler` works inside the plugin runtime and nothing
  fired during startup, so `init()` and `registerButton()` resolve cleanly
  on current firmware with SDK 0.2.3.

## Confirmed on the Manta (0.2.0, 2026-11-09)

- `PluginCommAPI.jumpToPage(0)` returns `success: true` from inside the
  plugin view.
- `PluginFileAPI.getKeyWords` and `getTitles` fail with **error 1503, "file
  read permission denied"** until `plugin.permission.FILE:READ` is granted.
  Expect the same for every path-based `PluginFileAPI` call. Request the
  permission lazily before the first such call.
- Running the eight status probes back to back crashed the plugin runtime
  with no JS error captured, so one of them fails natively. 0.2.1 runs them
  one per tap to name it.

## Confirmed on the Manta (0.2.1, 2026-11-09)

- **`FileUtils.getExternalDirPath()` crashes the plugin runtime.** The SDK
  package ships the host module's Java source: it calls
  `getCurrentActivity().getSystemService(...)`, and inside PluginHost there is
  no current activity, so it dereferences null. `getFileList()` and
  `getImageList()` use the same call. Avoid all three. `listFiles(path)`,
  `exists`, `getExportPath` and `getPluginDirPath` take plain paths and are
  safe.
- Device folder layout, from the same source: under external storage
  (`getExportPath()` minus `/EXPORT`) sit `Document`, `EXPORT`, `INBOX`,
  `MyStyle`, `Note`, `SCREENSHOT`. PDFs live under `Document`, notes under
  `Note`.
- `hasPermission` / `requestPermission` go through a host-side
  `HostCommonAPI`; if the host has not initialised it the call rejects with
  "HostCommonAPI not initialized". On this firmware the request failed; 0.2.2
  prints the raw rejection to learn which case it is.
- Plugin-private storage is under
  `/data/data/com.ratta.supernote.pluginhost/files/plugins/<pluginID>`
  (per the official docs); the native layer refuses paths under another
  plugin's folder.

## Permissions, solved (0.2.2 on Chauvet 3.31.45, 2026-11-11)

`requestPermission` rejected with `PluginException: This permission has not
been declared.` The official permissions page (docs.supernote.com/en/
plugin-base/permission) explains: permissions must be declared in
`PluginConfig.json` as `"uses-permissions": [...]`, which the packaging
script does not generate. Flow is declare → `hasPermission() === 1` →
otherwise `requestPermission()`. "Allow this time only" expires when the
plugin closes, so check on every open. `getLassoElements` needs `FILE:READ`,
so even lasso capture is gated. Error codes: 1500 undeclared, 1501 no write,
1502 unknown name, 1503 no read, 1217 encrypted path. The plugin-private
directory is `/data/data/com.ratta.supernote.pluginhost/files/plugins/<id>`
(the `testfile` package name in the SDK's PluginCheck is stale).

Also from the docs: `openFile` supports pdf, epub, cbz, xps, fb2, note and
takes `-1` for "last viewed page"; `getPageDisplaySize` is deprecated after
SDK 0.1.65 in favour of `getPageSize`.

## Confirmed on the Manta (0.2.3, Chauvet 3.31.45, 2026-11-11)

- With `uses-permissions` declared, `requestPermission` shows the
  three-option dialog; after "Always allow", `getPageSize`, `getKeyWords`,
  `getTitles` and the export-path call all succeed.
- `FileUtils` is absent from the official API reference, so it was suspect
  when the folder listings threw `TypeError: undefined is not a function`.
  The 0.2.4 inventory cleared it: `listFiles`, `getFileList`, `exists`,
  `getExportPath`, `copyFile`, `makeDir`, `deleteFile`, `getFileMD5`,
  `openFilePath` are all present. The TypeError came from our own code
  assuming `listFiles` resolves string paths; 0.2.5 prints the raw shape.

## Native method inventory, Chauvet 3.31.45 (0.2.4)

Present and therefore usable: `NativePluginManager.hasPermission`,
`requestPermission`, `showPluginView`, `getOrientation`,
`registerConfigButton`; `NativePluginAPI.openFile`, `jumpToPage`,
`canHandwrite`, `recognizeElements`, `getPenInfo`, `lassoElements`,
`insertTextLink`, `insertKeyWord`, `getCurrentDocText`, `insertPageElements`,
`deleteElements`, `getPageSize` (95 native methods in total).

## Probe phase closed (0.2.5, 2026-11-11)

With `FILE:READ` granted and the listing code accepting any result shape,
`listFiles` walks `Document` and `Note` successfully, and
`getLassoElements` → `recognizeElements` returned the handwritten word.
Every primitive in the release plan has now run on the Manta. Remaining
unknowns are behavioural (how keywords show up in the NOTE app after
`insertKeyWord`, whether `openFile` closes the plugin view) and get answered
by using the features.

## Error 102: the hosting app decides the API set (0.4.0, 2026-11-11)

With a PDF open in DOC, `getNoteTotalPageNum` and the index-note path
(`createNote` / `insertKeyWord` on a `.note`) fail with
`102 This app is not allowed to use this API, please call a different API`.
The same calls work with a note open in NOTE. Reading: the API surface is
scoped to the app hosting the plugin, not only to permissions. 0.4.2 uses
`PluginDocAPI.getCurrentTotalPages` for page counts in DOC and stores a
bookmark as a keyword on the document itself when the index note is refused.
Three probes establish the full rule: can DOC read a note's keywords, can
NOTE read a document's keywords, and does `getCurrentTotalPages` work.

## Open questions 0.4 answers on-device

- Does a type-2 lasso button registered for `['NOTE','DOC']` appear over a
  PDF annotation, and does `getLassoElements` + `recognizeElements` work
  there? (`getPageSize` is note-only; Capture falls back to the device's
  native page size for documents.)
- Does `createNote` succeed for `Note/DM Tome Index.note` with template
  `style_blank`? If not, the user creates that note by hand once.
- Keyword length: a `REF` keyword carries a full path (~100 characters).
- Does `openFile` close the plugin view, or must we close it ourselves?
- `getCurrentDocText(page)`: text layer quality on a real module PDF.
- `insertTextLink` with `linkType: 2`: does tapping the link open the PDF at
  `destPage`?

## Open questions version 0.2 answers on-device

- Does `getFileList(['pdf'])` need `FILE:READ` permission, and what paths does
  it return? (We need absolute paths for `openFile` and link `destPath`.)
- Does `openFile` work from inside the plugin UI, and does it close our view?
- What does `getPageDisplaySize()` return on the Manta?
- Does `recognizeElements` handle a multi-word lasso well enough for task
  capture?
- Does `insertText` with `fontSize: 40` read comfortably at Manta density?

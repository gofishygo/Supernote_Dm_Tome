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

## Open questions version 0.1 answers on-device

- Does `getFileList(['pdf'])` need `FILE:READ` permission, and what paths does
  it return? (We need absolute paths for `openFile` and link `destPath`.)
- Does `openFile` work from inside the plugin UI, and does it close our view?
- What does `getPageDisplaySize()` return on the Manta?
- Does `recognizeElements` handle a multi-word lasso well enough for task
  capture?
- Does `insertText` with `fontSize: 40` read comfortably at Manta density?

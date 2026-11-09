# sn-plugin-lib API reference

Condensed from docs.supernote.com (April 2026) and the `sn-plugin-lib` 0.2.3
source (October 2026). Methods marked **0.2.x** are absent from the April docs
but present in the published package. Unless stated, async methods return
`Promise<APIResponse<T>>` where `APIResponse<T> = {success, result, error}`.

Contents

1. PluginManager (lifecycle, buttons, events, permissions)
2. PluginCommAPI (NOTE and DOC: lasso, recognition, geometry, stickers, navigation)
3. PluginNoteAPI (NOTE only: text, titles, links, images, save)
4. PluginDocAPI (DOC only)
5. PluginFileAPI (file-level: elements, pages, layers, keywords, titles, marks)
6. FileUtils, NativeUIUtils, RattaFileSelector, PointUtils
7. Native-only methods with no wrapper yet

---

## 1. PluginManager

```ts
import { PluginManager } from 'sn-plugin-lib';
```

| Method | Signature | Notes |
|---|---|---|
| `init()` | `Promise<void>` | Call once after `AppRegistry.registerComponent`. Repeat calls are ignored. Nothing works before it. |
| `registerButton(type, appTypes, button)` | `Promise<boolean>` | `type` 1 toolbar, 2 lasso, 3 selection (DOC). `appTypes` `['NOTE','DOC']` or subset. `button`: `{id, name, icon, showType?, editDataTypes?}`. |
| `unregisterButton(id)` | `Promise<boolean>` | |
| `getButtonState(id)` / `setButtonState(id, enabled)` | `Promise<boolean>` | Hide or show a registered button. |
| `registerButtonListener({onButtonPress})` | `ButtonSubscription` | Event `{id, name, icon}`. Register the button first. `.remove()` to unsubscribe. |
| `registerConfigButton()` | `Promise<boolean>` | Adds a settings button on the device's plugin management page. |
| `registerConfigButtonListener({onClick})` | subscription | |
| `registerEventListener(event, priority, {onMsg})` | subscription | `event` `'event_pen_up'` (payload `Element[]`); priority 0 first, 1 normal, 2 last. |
| `registerMotionListener(priority, {onMsg})` **0.2.x** | subscription | Raw pointer events `MotionEvent` (action 0 down, 1 up, 2 move, 3 cancel; `toolType` 1 finger, 2 pen). |
| `registerLangListener({onMsg})` | subscription | Language code: `en`, `zh_CN`, `zh_TW`, `ja`. |
| `registerPluginLifeListener({onMsg})` **0.2.x** | subscription | Lifecycle events. Docs called this `addPluginLifeListener`. |
| `getDeviceType()` | `Promise<number>` | 0 A5, 1 A6, 2 A6X, 3 A5X, 4 Nomad, 5 Manta. |
| `getPluginDirPath()` | `Promise<string>` | Plugin's private directory. |
| `getPluginName()` | `Promise<string>` | |
| `closePluginView()` / `showPluginView()` **0.2.x** | `Promise<boolean>` | |
| `hasPermission(name)` **0.2.x** | `Promise<number>` | 0 none, 1 once, 2 always. |
| `requestPermission(name, desc?)` **0.2.x** | `Promise<number>` | 0 deny, 1 once, 2 always, -1 cancelled. Names: `plugin.permission.FILE:READ`, `FILE:WRITE`, `FILE:DELETE`, `INTERNET`. |

`EventType` enum: `PEN_UP`, `IMPORT_STICKER`, `MOTION_EVENT`, `PLUGIN_LIFE`.

## 2. PluginCommAPI

Works in NOTE and DOC.

### Lasso

| Method | Returns | Notes |
|---|---|---|
| `getLassoRect()` | `Rect` | Pixel coords. Needs an active lasso. |
| `lassoElements(rect)` | `boolean` | Programmatic selection within a pixel rect. |
| `resizeLassoRect(rect)` | `boolean` | Proportional scaling only; scale around the centre of `getLassoRect()`. |
| `getLassoElements()` | `Element[]` | Accessor fields populated. |
| `getLassoElementTypeCounts()` | `LassoElementTypeNum` | Counts per type. |
| `getLassoGeometries()` | `Geometry[]` | |
| `deleteLassoElements()` | `boolean` | |
| `setLassoBoxState(state)` | `boolean` | 0 show, 1 hide, 2 remove (closes lasso toolbar). |

### Recognition and pen **0.2.x**

| Method | Returns | Notes |
|---|---|---|
| `recognizeElements(elements, {width, height})` | `string` | Strokes and text boxes only. Size is the page pixel size. |
| `cancelRecognize()` | `boolean` | |
| `getPenInfo()` | `PenInfo` | `{type, color, width}`. |

### Elements and stickers

| Method | Returns | Notes |
|---|---|---|
| `createElement(type)` | `Element` | Type constants in data-model.md. |
| `recycleElement(uuid)` / `clearElementCache()` | void | Free native memory. Old Element objects become unusable after clear. |
| `insertPageElements(elements, page, layer)` **0.2.x** | `boolean` | Batch insert to a page. |
| `saveStickerByLasso(path)` | `boolean` | Strokes and geometries only. |
| `insertSticker(path)` / `getStickerSize(path)` | | |
| `generateStickerThumbnail(stickerPath, pngPath, size)` | `boolean` | `pngPath` must end `.png`. |
| `convertElement2Sticker({machineType, elements, stickerPath})` | `boolean` | |

### Geometry and stars

| Method | Notes |
|---|---|
| `insertGeometry(geometry)` | See `Geometry` in data-model.md. |
| `modifyLassoGeometry(geometry)` | Selection must contain exactly one geometry. |
| `insertFiveStar(points)` | Exactly 6 pixel points, first equals last. |

### Navigation and state

| Method | Returns | Notes |
|---|---|---|
| `getCurrentFilePath()` | `string` | |
| `getCurrentPageNum()` | `number` | 0-based. |
| `jumpToPage(page)` **0.2.x** | `boolean` | Within the open file. |
| `canHandwrite()` **0.2.x** | `boolean` | False in read-only DOC views. |
| `getPageDisplaySize()` **0.2.x** | `Object` | Displayed size (zoom/split aware). Shape unverified; probe it. |
| `reloadFile()` | `boolean` | Reload the open file from disk. |
| `getNoteSystemTemplates()` | `Template[]` | Not wrapped in APIResponse. |
| `setSlideBarStatus`, `setSystemDormancyState(enable)`, `setStatusBarAndSlideBarState(lock)` | | UI chrome and sleep control. |

## 3. PluginNoteAPI

NOTE only. Calls fail in DOC.

| Method | Returns | Notes |
|---|---|---|
| `insertText(textBox)` | `boolean` | Required `textContentFull`, `textRect` (pixels, non-zero area). Optional `fontSize`, `fontPath`, `textAlign` 0/1/2, `textBold`, `textItalics`, `textFrameWidthType` 0 fixed 1 auto, `textFrameStyle` 0/3, `textEditable` 0 editable 1 locked. Main layer, undoable. |
| `getLassoText()` | `TextBox[]` | |
| `modifyLassoText(textBox)` | `boolean` | Exactly one text box selected. |
| `setLassoTitle({style})` | `boolean` | Style 0 remove, 1 black bg, 2 grey-white, 3 grey-black, 4 shadow. Main layer. |
| `getLassoTitles()` / `modifyLassoTitle({style})` | | Exactly one title for modify. |
| `insertTextLink(link)` | `number` | 0 ok, -1 fail, -2 upgrade required. Fields: `destPath`, `destPage`, `linkType` 0 note page / 1 note file / 2 document / 3 image / 4 URL, `style` 0 underline / 1 border / 2 dashed, `rect`, `fontSize`, `showText`, `fullText`, `isItalic`. |
| `setLassoStrokeLink({destPath, destPage, style, linkType})` | `number` | Turns selected strokes into a link. |
| `getLassoLinks()` | `LassoLink[]` | |
| `modifyLassoLink({destPath, destPage?, linkType, style, fullText?, showText?})` | `boolean` | Exactly one link; cannot convert text ↔ stroke link; type 6 (digest) read-only. |
| `insertImage(pngPath)` | `boolean` | Into the active layer. |
| `saveCurrentNote()` | `boolean` | Flush memory to file. Call before `PluginFileAPI` element writes. |

## 4. PluginDocAPI

DOC only.

| Method | Returns | Notes |
|---|---|---|
| `getLastSelectedText()` | `string` | After a text selection in DOC. (Docs once called it `getSelectedText`.) |
| `getCurrentDocText(page)` | `string` | Text layer of a page, 0-based. The only way a pure-JS plugin reads document text. |
| `getCurrentTotalPages()` | `number` | |
| `generateCurrentDocImage(page, pngPath, size, type)` **0.2.x** | | Render a page to PNG. |

## 5. PluginFileAPI

Path-based. Works on files that are not open. All `page` are 0-based.

### Elements

| Method | Notes |
|---|---|
| `getElements(page, notePath)` | Note the argument order differs from the rest. |
| `getElement(notePath, page, num)` / `getLastElement()` | |
| `getElementCounts(notePath, page)` / `getElementNumList(notePath, page)` | |
| `insertElements(notePath, page, elements)` / `modifyElements(...)` / `replaceElements(...)` | Call `saveCurrentNote()` first if the note is open. |
| `deleteElements(notePath, page, numsInPage)` **0.2.x** | By index. |
| `clearLayerElements(notePath, page, layer)` | |

### Pages and notes

| Method | Notes |
|---|---|
| `getNoteTotalPageNum(notePath)` | |
| `insertNotePage(notePath, page, template)` | `template` e.g. `'style_blank'` or a name from `getNoteSystemTemplates()`. |
| `removeNotePage(notePath, page)` | |
| `createNote({notePath, template, mode, isPortrait})` | `mode` 0 normal, 1 recognition layout. |
| `getNotePageTemplate(notePath, page)` | `{name, md5}`; system templates have md5 `"0"`. |
| `getPageSize(notePath, page)` | `{width, height}` pixels. Feed to PointUtils and recognizeElements. |
| `getNoteType(notePath)` | 0 normal, 1 recognition note. |
| `getFileMachineType(notePath)` | Device that created the file. |
| `generateNotePng({NOTEPath, page, times, pngPath, type})` | `times` scale 1 or 2; `type` 0 transparent, 1 white. |
| `generateNoteTemplatePng(notePath, page, pngPath)` | Background only. |
| `openFile(filePath, page)` **0.2.x** | Opens a note or document at a page. Returns raw object; probe it. |

### Layers (NOTE only)

| Method | Notes |
|---|---|
| `getLayers(notePath, page)` | `Layer[]`: `{layerId, name, isCurrentLayer, isVisible}`. |
| `insertLayer(notePath, page, layer)` | Ids 1–3 are custom. |
| `modifyLayers(notePath, page, layers)` | Cannot rename -1 or 0. |
| `deleteLayers(notePath, page, ids)` | Only 1–3. |
| `sortLayers(notePath, page, ids)` | First id on top. |

### Keywords, titles, marks, stars

| Method | Notes |
|---|---|
| `getKeyWords(notePath, pageList)` | `KeyWord[]`: `{keyword, page, index}`; `index` is 1-based. Works for NOTE and DOC. |
| `insertKeyWord(notePath, page, keyword)` | A per-page string store. |
| `deleteKeyWord(notePath, page, index)` | 1-based index. |
| `getTitles(notePath, pageList)` | `Title[]`. NOTE only. |
| `searchFiveStars(filePath)` | Pages containing stars. |
| `getMarkPages(filePath)` | DOC pages with handwriting. |
| `generateMarkThumbnails(markPath, page, pngPath, size)` | |
| `clearMarkElements(filePath, page)` | Removes handwriting from a DOC page. |

## 6. Utilities

### FileUtils (no content read or write)

`exists(path)`, `makeDir(dir)`, `copyFile(src, dst)`, `renameToFile(src, dst)`,
`deleteFile(path)`, `deleteDir(dir)`, `listFiles(dir)`, `getFileMD5(path)`,
`getExportPath()`, `openFilePath(path)` (file manager),
`getStorageAvailableSpace()`.

**Crash on device:** `getExternalDirPath()`, `getFileList(suffixes)` and
`getImageList()` call `getCurrentActivity()` in the host module, which is null
inside PluginHost. They kill the runtime with no JS error. Walk
`listFiles()` from the storage root instead: `getExportPath()` returns
`<root>/EXPORT`; siblings are `Document` (PDFs, EPUBs), `Note` (.note),
`INBOX`, `MyStyle`, `SCREENSHOT`.

### NativeUIUtils

`showErrorTipDialog(tag)`; `showRattaDialog(tip, leftBtn, rightBtn, isSuccess)`
→ `Promise<boolean>` (true when the right button is tapped).

### RattaFileSelector

`selectImage()` → path. `selectFile({selectType, suffixList, maxNum, title,
rightButtonText, selectPathList, needSelectFolder, limitPath})` → paths. The
only way to let the user pick an arbitrary file.

### PointUtils

`androidPoint2Emr(point, pageSize)`, `emrPoint2Android(point, pageSize)`.
Constants: `NORMAL_PAGE_SIZE` 1404×1872, `A5X2_PAGE_SIZE` 1920×2560, rotation
and machine-type constants. Throws `unknown pageSize` for sizes outside the
table (1404×1872, 1872×1404, 1920×2560, 2560×1920).

## 7. Native methods without a documented wrapper (0.2.3)

Present on `NativePluginAPI` and callable through it, but undocumented and
unverified: `batchUpdatePageElements`, `deletePageElements`,
`modifyPageElements`, `fillRegionByPoint`, `flipLassoElements`,
`generateLassoPreview`, `generateLayerPreviewImage`, `getCacheElement`,
`getPathEncryptionStatus`, `lockPathAccess`, `unlockPathWithPassword`,
`opElementPointData`. Prefer documented wrappers; treat these as experiments.

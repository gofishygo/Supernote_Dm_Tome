---
name: supernote-plugin
description: Build, debug, package and install plugins for Supernote e-ink tablets (Manta/A5X2, Nomad/A6X2, A5X, A6X) using the official sn-plugin-lib React Native SDK and .snplg packages. Use this whenever the user mentions Supernote, Ratta, sn-plugin-lib, PluginHost, .snplg files, the NOTE or DOC app, lasso buttons, .note files, or wants an e-ink tablet plugin, even if they do not say "plugin". Also use it when choosing how a plugin should store data, read handwriting, insert text or links into a note, or when a Supernote build or install fails.
---

# Supernote plugin development

Supernote tablets run Android with two host apps, NOTE (handwriting) and DOC
(PDF/EPUB reading). A plugin is a React Native 0.79.2 app that runs inside a
separate PluginHost process and talks to NOTE/DOC through the `sn-plugin-lib`
SDK. It ships as a `.snplg` file (a zip) that the user installs from
Settings → Apps → Plugins.

This skill captures what the official docs say plus what the SDK source and a
real build revealed. Read the body, then open a reference only when you need
the detail it holds:

- `references/api-reference.md`: every SDK method with signature and gotchas.
- `references/data-model.md`: element types, layers, pen values, link types,
  coordinate systems, type shapes.
- `references/build-and-install.md`: toolchain, build scripts, package layout,
  install steps, troubleshooting.
- `scripts/check_plugin.py`: validates a plugin project's config before a build.
- `scripts/push_to_supernote.ps1`: copies a file to the device's MyStyle folder
  from Windows over USB (MTP has no drive letter, so this drives Explorer).

## The mental model that prevents most mistakes

1. **A plugin UI is full-screen or nothing.** `showType: 1` opens a
   full-screen React view over the note; `showType: 0` runs the button handler
   with no UI. There are no sidebars or overlays. Design features so content
   the user needs *while writing* goes into the note itself (text boxes,
   links, titles) and the plugin screen is for setup, search and capture.

2. **The SDK cannot read or write ordinary files.** `FileUtils` lists, copies,
   moves and deletes, but nothing returns file contents. A pure-JS plugin
   cannot read a `.md` or `.json` from disk. Text it *can* read: text boxes,
   titles, keywords and links inside a `.note`; page text of an open DOC via
   `PluginDocAPI.getCurrentDocText(page)`; recognized handwriting via
   `PluginCommAPI.recognizeElements`. Static content can be bundled at build
   time with `require('./data.json')`. A native module (Java/Kotlin) is the
   only other way, and it drags in Android Studio and Gradle.

3. **The note is a database.** Keywords (`insertKeyWord`/`getKeyWords`) are a
   per-page string store that survives sync and reinstall. Text boxes carry
   `textContentFull`. Links carry `destPath` and `destPage`. Use these before
   inventing a storage layer.

4. **Two coordinate systems.** UI, rects, text boxes, links and lasso use
   pixels with top-left origin (Manta page 1920×2560, older devices
   1404×1872). Stroke points use EMR digitizer units. Convert with
   `PointUtils.androidPoint2Emr` / `emrPoint2Android`, passing the real page
   size from `PluginFileAPI.getPageSize(path, page)`. An unknown page size
   throws.

5. **Almost every call returns `APIResponse<T>`**: `{success, result, error}`.
   Check `success` before touching `result`. Pages are 0-based everywhere
   except keyword `index`, which is 1-based.

6. **Build needs Node only, unless there is native code.** The official
   `buildPlugin.sh` / `.ps1` run Metro and zip. Gradle runs only when the project
   defines a `ReactPackage` (a native module of its own) or a third-party node
   module ships Java/Kotlin. The template's MainActivity and MainApplication
   do not trigger it. Do not
   send the user to install Android Studio for a pure-JS plugin.

## Workflow

### Scaffold

```bash
npx @react-native-community/cli init MyPlugin \
  --template @supernote-plugin/sn-plugin-template --version 0.79.2
```

The `--version 0.79.2` flag is required: PluginHost embeds that React Native
version and a mismatch fails at runtime. The template pins an old
`sn-plugin-lib`; bump it to the latest (`npm view sn-plugin-lib version`) and
check the changelog of methods in `references/api-reference.md`.

The `ios/` folder and `Gemfile` are unused on Supernote and can be deleted.
Keep `android/` even without native code; the build script scans it.

### Entry file (`index.js`)

Order matters and is checked by the host:

```js
AppRegistry.registerComponent(appName, () => App); // 1. React entry
PluginManager.init();                               // 2. plugin runtime
PluginManager.registerButton(1, ['NOTE','DOC'], {...}); // 3. buttons
PluginManager.registerButtonListener({onButtonPress}); // 4. listener
```

Button types: `1` toolbar (NOTE and DOC), `2` lasso toolbar (NOTE; add
`editDataTypes` to say which selected content shows it: 0 strokes, 1 title,
2 image, 3 text, 4 link, 5 geometry), `3` text-selection toolbar (DOC only).
Button `id`s must stay stable across releases. `App` receives no props from
the host, so store the last `ButtonEvent` in a module-level variable and read
it in `App` to pick a screen.

### Manifest (`PluginConfig.json`)

Generated on first build. `pluginKey` must equal the `name` in `app.json`
(the first argument of `registerComponent`) or the plugin silently never
runs. `pluginID` is a 16-char id; never change it after a build has been
installed, or the device treats the next build as a different plugin.
Set `iconPath` to a PNG relative to the project root.

### Build and install

```bash
bash buildPlugin.sh            # macOS / Linux / cloud container
powershell -ExecutionPolicy Bypass -File buildPlugin.ps1   # Windows
```

Output `build/outputs/<name>.snplg`. Copy it to the device's `MyStyle`
folder over USB (MTP; on Windows use `scripts/push_to_supernote.ps1` or drag
and drop in Explorer), then Settings → Apps → Plugins → Add Plugin. If
Settings → Apps has no Plugins entry, the firmware predates plugins; update
via Settings → System Update first. Run `python3 scripts/check_plugin.py
<project-dir>` before building to catch the config mismatches above.

### Iterate on hardware

There is no emulator for PluginHost. Treat the first build of any feature as a
probe: print what each SDK call returns in a plain console screen, read the
real paths, sizes and error codes, then design on facts. In particular, probe
on-device before relying on: paths returned by `FileUtils.getFileList`,
whether a call needs `plugin.permission.FILE:READ`, recognition quality on
multi-word lassos, and whether `openFile` closes the plugin view.

## E-ink UI rules

The display is reflective e-ink that refreshes slowly and ghosts.

- Pure black on white. Greys dither; avoid opacity under 1 except to show a
  disabled state.
- No animation, spinners or progress bars. Show a static "working…" line,
  then the result. Batch `setState` calls so each action repaints once.
- Big targets: 56 px tall buttons, 20 px+ text. The Manta is dense
  (1920×2560 on 10.7") and is held in one hand.
- Monospace for anything the user may transcribe (paths, ids, errors).
- Always provide a visible Close that calls `PluginManager.closePluginView()`.

## Permissions (declare, check, request)

Shared storage (`Document`, `EXPORT`, `INBOX`, `MyStyle`, `Note`,
`SCREENSHOT`) and the network are closed to a plugin until the user grants
access. Only the plugin's private directory
(`/data/data/com.ratta.supernote.pluginhost/files/plugins/<pluginID>`) is
free. The check applies at the process boundary, so RN `fetch` and Android
file APIs are intercepted too, not just `sn-plugin-lib`.

1. **Declare** in `PluginConfig.json`:
   `"uses-permissions": ["plugin.permission.FILE:READ", "plugin.permission.FILE:WRITE"]`.
   Names: `FILE:READ`, `FILE:WRITE`, `FILE:DELETE`, `INTERNET`. Requesting an
   undeclared one rejects with "This permission has not been declared"
   (code 1500). The packaging script does not add this field; write it by hand.
2. **Check** every time the plugin opens: `hasPermission(name)` returns `1`
   when granted.
3. **Request** when it returns `0`: `requestPermission(name, desc)` shows a
   three-option dialog and returns `1` allow once, `2` always, `0` deny,
   `-1` cancelled. "Allow this time only" dies when the plugin closes, so do
   this before each feature, not once at install. After a "Don't allow" the
   dialog is replaced by a prompt to Settings; `desc` is the body of that
   prompt only.

What needs what: `FILE:READ` for `getElements`, `getLassoElements`,
`getKeyWords`, `getTitles`, `getPageSize`, `listFiles` on shared folders;
`FILE:WRITE` for `insertElements`, `modifyElements`, `replaceElements`,
`insertPageElements`, `deleteElements`. Error codes: 1500 undeclared, 1501
write without `FILE:WRITE`, 1502 unknown permission name, 1503 read without
`FILE:READ`, 1217 target path encrypted and locked.

## Writing text and links into a note

- `PluginNoteAPI.insertText({textContentFull, textRect, fontSize, ...})`
  inserts on the main layer with undo support. `textRect` is pixels and must
  have non-zero area. NOTE only; DOC has no text boxes.
- `PluginNoteAPI.insertTextLink({destPath, destPage, linkType, style, rect,
  fontSize, showText, fullText})` makes a tappable link. `linkType` 0 note
  page, 1 note file, 2 document (PDF) at `destPage`, 3 image, 4 URL. Links,
  titles and digests live on layer 0 only. Returns 0 ok, -1 fail, -2 host
  upgrade needed.
- Call `PluginNoteAPI.saveCurrentNote()` before any `PluginFileAPI`
  element write (`insertElements`, `modifyElements`, `replaceElements`) so
  the in-memory note and the file agree.

## Reading handwriting

From a lasso: `getLassoElements()` → `recognizeElements(elements,
{width, height})` where the size is the page pixel size. Only strokes and
text boxes are recognized. Elements hold large point arrays behind
`ElementDataAccessor` (`size()`, `get(i)`, `getRange(start, count)`); do not
assume points are in JS memory. Call `element.recycle()` or
`PluginCommAPI.clearElementCache()` when done with many elements.

Programmatic selection: `PluginCommAPI.lassoElements(rect)` selects within a
pixel rect without user interaction, enabling batch processing. End an
operation with `setLassoBoxState(2)` to dismiss the lasso UI.

## Opening files and navigating

`PluginFileAPI.openFile(filePath, page)` opens `pdf`, `epub`, `cbz`, `xps`,
`fb2` or `note` files at a 0-based page, or at the last viewed page with `-1`.
`PluginCommAPI.jumpToPage(page)` moves within the open file.
`PluginCommAPI.getCurrentFilePath()` and `getCurrentPageNum()` tell you where
the user is. `PluginCommAPI.canHandwrite()` distinguishes a writable NOTE
view from a read-only DOC view.

## Common failures

| Symptom | Cause | Fix |
|---|---|---|
| Installed, no button appears | `pluginKey` ≠ `app.json` name | make them equal |
| Button appears, view stays blank, no error | two copies of React in the bundle (nested `node_modules/node_modules` or a symlinked path). A hello-world bundle is about 520 modules and 260 KB zipped; a doubled one about 880 and 450 KB | delete the nested folder, rebuild, run `check_plugin.py` |
| Device shows two copies of the plugin | `pluginID` changed | restore the original id |
| Plugin crashes on open | RN version ≠ 0.79.2 or SDK API missing on firmware | pin RN; check firmware |
| `requestPermission` rejects "has not been declared" | permission missing from `uses-permissions` in the manifest | add it, rebuild, reinstall |
| Runtime dies on a `FileUtils` call | `getExternalDirPath`, `getFileList`, `getImageList` need an Activity that PluginHost does not have | use `listFiles(path)` on `Document`, `Note`, etc. under `getExportPath()` minus `/EXPORT` |
| `unknown pageSize` thrown | passed a scaled view size to PointUtils | use `getPageSize` result |
| `got 3 arguments, expected 4` | omitted optional arg to a native method | pass `null` explicitly |
| Build runs Gradle unexpectedly | a dependency ships Java/Kotlin, or a ReactPackage was added | drop it or accept the toolchain |
| PowerShell refuses the script | execution policy | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |

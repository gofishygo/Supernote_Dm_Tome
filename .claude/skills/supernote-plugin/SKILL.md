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
  install steps, the debugging playbook, troubleshooting.
- `references/verified-on-device.md`: what actually happened on a Manta
  (firmware 3.31.45, SDK 0.2.3): view size, working calls, crashing calls,
  native method inventory, permission behaviour, storage layout. Read it
  before trusting any method the docs do not cover.
- `assets/probe-kit/`: drop-in entry file, console and probes that turn a
  fresh template into a test instrument. Start every new plugin from it.
- `scripts/check_plugin.py`: validates a plugin project before a build:
  manifest, versions, init order, permission declarations, nested
  `node_modules`, duplicated bundles.
- `scripts/push_to_supernote.ps1`: copies a file to the device's MyStyle folder
  from Windows over USB (MTP has no drive letter, so this drives Explorer).

## The mental model that prevents most mistakes

1. **A plugin UI is full-screen or nothing.** `showType: 1` opens a
   full-screen React view over the note; `showType: 0` runs the button handler
   with no UI. There are no sidebars or overlays. Design features so content
   the user needs *while writing* goes into the note itself (text boxes,
   links, titles) and the plugin screen is for setup, search and capture.

2. **The SDK cannot read or write ordinary files.** `FileUtils` lists, copies,
   moves and deletes, but nothing returns file contents, and `FileUtils` is
   not in the official API reference at all, so its return shapes are
   firmware-defined. A pure-JS plugin cannot read a `.md` or `.json` from
   disk. Text it *can* read: text boxes,
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

7. **Firmware lags the SDK, and the SDK lags its docs.** Methods exist in
   the npm package that the device's native modules may not implement, and
   documented behaviour (permissions, manifest fields) may be missing from
   the SDK source. Nothing is true until it has run on the device. Build a
   probe first, print raw results, and keep a per-firmware notes file.

8. **The hosting app scopes the API, not just permissions.** A plugin
   opened from DOC (a PDF) gets `102 This app is not allowed to use this
   API` for note-file calls such as `getNoteTotalPageNum` and `createNote`,
   even with every permission granted. Branch on the open file's type: use
   `PluginDocAPI` for documents, keep note writes for when NOTE is hosting,
   and store per-document data as keywords on the document itself.

9. **Permissions are declared, then checked, then requested.** Shared
   storage and the network are closed until the user grants access, and a
   permission must be listed in the manifest's `uses-permissions` before it
   can even be asked for. Reading a lasso selection counts as a file read.

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

There is no emulator for PluginHost and `console.log` goes nowhere. Copy
`assets/probe-kit/` into the project and ship that first: it paints before
any SDK call, captures startup and render errors on screen, runs one call
per tap, prints raw result shapes and full error detail, and inventories
which native methods the firmware really has. The user photographs the
screen; you design on what it says. The full playbook, including bundle
comparison and side-by-side bisect packages, is in
`references/build-and-install.md`.

Known device facts to design against are in
`references/verified-on-device.md`. The headline ones: the Manta view is
1024 × 1365 dp; `FileUtils.getExternalDirPath`, `getFileList` and
`getImageList` crash the runtime; `listFiles` does not return plain strings;
every `PluginFileAPI` read needs `FILE:READ`, including `getLassoElements`.

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

## Common failures, in the order to check them

| Symptom | Cause | Fix |
|---|---|---|
| Installed, no button appears | `pluginKey` ≠ `app.json` name, or `index.js` threw before `registerButton` | make them equal; wrap `init`/`registerButton` in catch and print |
| Device shows two copies of the plugin | `pluginID` changed | restore the original id |
| Button appears, view blank, no error, template hello-world works | dependency graph bundled twice: `node_modules/node_modules` exists or the path goes through a symlink. Clean bundle ~520 modules / 260 KB; doubled ~880 / 450 KB | `rm -rf node_modules/node_modules`; rebuild; `check_plugin.py` |
| View blank only for your plugin, bundle size normal | `App.tsx` throws when first evaluated (inline requires) | load `App` lazily in the `registerComponent` factory and render the exception |
| View disappears on a tap, log lost | native crash in that call (e.g. `FileUtils.getExternalDirPath`) | one call per tap; avoid the call; see verified-on-device.md |
| `requestPermission` rejects "This permission has not been declared" (1500) | missing from `uses-permissions` in the manifest | add it, rebuild, reinstall |
| `102 This app is not allowed to use this API` | the hosting app (DOC vs NOTE) does not offer that call; typical when note-file APIs run with a PDF open | check the open file's type and use the DOC-side API or defer the note write |
| Reads fail with 1503, writes with 1501 | permission not granted, or "allow this time" expired when the plugin closed | check `hasPermission() === 1` on every open and request again |
| `TypeError: undefined is not a function` around an SDK call | the firmware lacks the native method, or your code called a string method on a non-string result | print `Object.keys(module)`, `typeof module.method`, and `JSON.stringify(raw)` |
| `unknown pageSize` thrown | a scaled view size was passed to PointUtils | use `getPageSize` for the current file and page |
| `got N arguments, expected N+1` | optional argument omitted on a native method | pass `null` explicitly |
| Build runs Gradle unexpectedly | a dependency ships Java/Kotlin, or a `ReactPackage` was added | drop it or accept the Android toolchain |
| PowerShell refuses the script | execution policy | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `Copy-Item` cannot find the device | MTP has no drive letter | `scripts/push_to_supernote.ps1` (Shell.Application) |

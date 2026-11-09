# Build, install, troubleshoot

## Toolchain

| Need | Pure-JS plugin | Plugin with native code |
|---|---|---|
| Node.js ≥ 18 (LTS 22 fine) | yes | yes |
| npm or yarn | yes | yes |
| JDK ≥ 19 | no | yes |
| Android Studio Narwhal 2025.1.2+, SDK Platform 35, Build-Tools 35.0.0 | no | yes |
| `ANDROID_HOME` + `platform-tools` on PATH | no | yes |
| Windows: PowerShell 5+, execution policy allowing scripts | yes | yes |
| macOS/Linux: bash, `zip`, `jq` or `python3` | yes | yes |

The official docs list the Android toolchain unconditionally because the
template can host native modules. The build script itself only runs Gradle
when it finds a class implementing `ReactPackage` under `android/` or `.java`
/ `.kt` sources in a third-party `node_modules` package (React Native's own
packages and `sn-plugin-lib` are ignored). The template's `MainActivity.kt`
and `MainApplication.kt` do not count. Verified by building a template project with Node
alone in a Linux container.

Windows one-liners:

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

## Scaffold

```bash
npm uninstall -g react-native-cli react-native   # old global CLIs break init
npx @react-native-community/cli init MyPlugin \
  --template @supernote-plugin/sn-plugin-template --version 0.79.2
cd MyPlugin
npm install
npm install sn-plugin-lib@latest
```

Template versions seen: `sn-plugin-template` 1.0.13 (pins `sn-plugin-lib
^0.1.19`), `sn-plugin-lib` 0.2.3 (2026-10). Always bump the lib; new methods
such as `openFile`, `jumpToPage`, `recognizeElements` and permissions only
exist in 0.2.x.

Useful `package.json` scripts:

```json
"build": "bash buildPlugin.sh",
"build:win": "powershell -ExecutionPolicy Bypass -File buildPlugin.ps1"
```

## What the build script does

1. Creates `build/generated/`.
2. `npx react-native bundle --entry-file index.js --platform android --dev
   false --bundle-output build/generated/<name>.bundle --assets-dest
   build/generated/` (bash sets `CI=1` so Metro does a one-shot scan).
3. Generates `PluginConfig.json` in the project root on first run (random
   16-char `pluginID`), copies it into `build/generated/`, copies the icon.
4. Scans `android/` for `ReactPackage` implementations and `node_modules`
   for third-party Java/Kotlin. If found, runs
   Gradle `buildCustomApkDebug`, copies the APK as `app.npk`, writes
   `reactPackages` and `nativeCodePackage` into the manifest.
5. Zips `build/generated/*` to `build/outputs/<name>.snplg`.

Bundle size for hello-world is about 1 MB raw, 260 KB zipped, around 520
modules (`grep -c '__d(' build/generated/*.bundle`). A small real plugin adds
only tens of KB. If a build comes out near 1.8 MB / 880 modules, the graph is
duplicated; see troubleshooting.

Only the `index.js` entry is bundled, so `require('./data.json')` is the way
to ship static data, and `Image.resolveAssetSource(require('./assets/x.png')).uri`
the way to reference icons.

## Install on the device

1. Firmware must have **Settings → Apps → Plugins**. If absent, update via
   **Settings → System Update** (sometimes under About), possibly twice.
2. Connect over USB. The device appears as an MTP drive. Copy the `.snplg`
   into the top-level **MyStyle** folder. Cloud sync or the Partner app also
   work for the transfer.
3. **Settings → Apps → Plugins → Add Plugin**, pick the file, **Install**.
4. Open a note or document. Toolbar buttons appear in the left toolbar;
   lasso buttons after a lasso selection; selection buttons after selecting
   text in DOC.

Scripting the copy on Windows: the device is MTP, so it has no drive letter
and `Copy-Item` cannot see it. Use Explorer's object model instead:
`(New-Object -ComObject Shell.Application).NameSpace(17)` is This PC; find the
device item by name, then `Internal shared storage`, then `MyStyle`, and call
`CopyHere(item, 16)` on the folder. The copy is asynchronous, so poll
`ParseName` until the file appears. `scripts/push_to_supernote.ps1` does this;
a `.cmd` wrapper calling `powershell -ExecutionPolicy Bypass -File` makes it
double-clickable. Upload under a versioned file name to avoid overwrite
prompts and to see which build you are installing on the device.

Upgrading: same `pluginID`, higher `versionCode`. If the host refuses to
install over the old version, remove it in the Plugins page first.

ADB is not required. Sideloading (Settings → Security & Privacy →
Sideloading) is only for installing ordinary APKs, not plugins.

## Debugging without an emulator

PluginHost has no desktop emulator. Practical loop:

- Build a console screen that prints `JSON.stringify` of each SDK response in
  monospace. The user photographs or transcribes it.
- Wrap every SDK call in try/catch; native methods throw on bad arguments
  (`verifyParams` in the SDK) rather than returning `success: false`.
- Keep a changelog of what each firmware returned; behaviour differs between
  firmware releases and the SDK adds methods the firmware may not yet
  implement (expect `success: false` with an error code, or a throw).
- `console.log` output is not visible on the device. Surface everything in UI
  or write it into a note as a text box.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Plugin installs, no buttons | `pluginKey` ≠ `app.json.name` | match them; rebuild |
| Buttons appear, tapping shows nothing, template hello-world works | bundle holds the dependency graph twice: `node_modules/node_modules` exists or the project path goes through a symlink. Node resolves `react` from the nested copy for RN internals and from the top copy for your code, so the native `runApplication` lands in an `AppRegistry` with nothing registered | `rm -rf node_modules/node_modules`; build from a real path; compare `grep -c '__d(' build/generated/*.bundle` with a fresh template (~520) |
| Two entries in Plugins page | `pluginID` changed | restore old id |
| White screen on open | JS exception during first render | wrap root in an error boundary that prints the error |
| Button works in NOTE, fails in DOC | NOTE-only API called | check `canHandwrite()` and branch |
| `unknown pageSize` | wrong size passed to `PointUtils` | use `getPageSize` result |
| `got N arguments, expected N+1` | optional arg omitted on a native method | pass `null` |
| Metro `ENOSPC` / watch errors on Linux | inotify limits | `CI=1` is already set by the script; otherwise raise `fs.inotify.max_user_watches` |
| Gradle starts unexpectedly | a dependency ships Java/Kotlin | check `Scan node_modules` output; remove the dep |
| PowerShell: script not digitally signed | execution policy | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` or run with `-ExecutionPolicy Bypass` |
| `react-native` version warning in build | RN ≠ 0.79.2 | pin `react-native` and `@react-native/*` to 0.79.2 |

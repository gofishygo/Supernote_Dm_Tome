# DM Tome

A Supernote plugin for dungeon masters: scene script, page-deep links into
rulebook PDFs, in-session note organization, and a back-burner task list with
due sessions. Built for the Supernote Manta (A5X2) with `sn-plugin-lib` 0.2.3.

Hobby project. Current release: **0.1.0, SDK probe console**. It installs,
registers a toolbar button and a lasso button, and prints what each SDK
primitive returns on the device so the real features can be built on facts.

## Docs

- `docs/SETUP-WINDOWS.md`: firmware update, installing a prebuilt plugin,
  Node on Windows, the build loop.
- `docs/DESIGN.md`: what we are building and why, including the "note is the
  database" model and the release plan.
- `docs/SDK-NOTES.md`: what the SDK can and cannot do, verified against 0.2.3.

## Build

Node 18 or newer. No Android Studio needed for a pure-JS plugin.

```bash
npm install
npm run build        # macOS / Linux
npm run build:win    # Windows PowerShell
```

Output: `build/outputs/DmTome.snplg`. Copy it to the Manta's `MyStyle`
folder, then Settings → Apps → Plugins → Add Plugin.

## Layout

```
index.js          plugin entry: init, button registration, button listener
App.tsx           full-screen UI (version 0.1: probe console)
src/buttons.ts    stable button ids
src/lastButton.ts which button opened the UI
src/probes.ts     one function per SDK primitive under test
PluginConfig.json plugin manifest; never change pluginID
assets/icon.png   toolbar icon
buildPlugin.*     official Supernote packaging scripts
android/          scaffold kept for a possible future native module
```

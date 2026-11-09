# Setup guide: Manta + Windows

Read this top to bottom the first time. Later you will only need the
"Everyday loop" at the end.

## The short version

| Step | Needs | Why |
|---|---|---|
| 1. Update Manta firmware | Wi-Fi, charger | Plugins only exist in recent firmware |
| 2. Install a prebuilt `.snplg` | USB cable | Proves install path works, no toolchain needed |
| 3. Install Node.js and Git | Windows installers | Build the plugin yourself |
| 4. Build and reinstall | PowerShell | The everyday loop |

Android Studio and the JDK are **not** needed. The official build script only
runs Gradle when the plugin contains Java or Kotlin source. DM Tome is pure
JavaScript, so the build is just Metro bundling plus a zip. If we ever add a
native module, there is a section at the end for that day.

---

## Step 1: Update the Manta firmware

Your Manta currently has no **Plugins** entry under Settings → Apps, which
means the firmware predates plugin support.

1. Charge the Manta above 50 percent and connect it to Wi-Fi.
2. Open **Settings → System Update** (on some firmware this is under
   **Settings → About → System Update**).
3. Tap **Check for updates**, download, and install. The device restarts.
   Allow ten to fifteen minutes.
4. After the restart open **Settings → Apps**. You should now see **Plugins**.
   If it is still missing, check for updates again. Firmware sometimes ships in
   two hops.

What is happening: plugins run inside a separate Android process called
PluginHost that ships with the firmware. NOTE and DOC talk to it over AIDL,
Android's inter-process messaging. No PluginHost, no plugins.

## Step 2: Install the prebuilt version 0.1 (no toolchain)

I build the package in the cloud and hand you `DmTome.snplg`. It is a zip file
with a different extension: inside are the JavaScript bundle, the icon, and
`PluginConfig.json`.

1. Save `DmTome.snplg` somewhere easy, like your Desktop.
2. Plug the Manta into the PC with USB. On the Manta, if asked, choose
   **Transfer files**. Windows shows the device in File Explorer as a drive
   (MTP mode, like an Android phone).
3. Open the Manta drive and find the **MyStyle** folder at the top level.
   Copy `DmTome.snplg` into it.
4. On the Manta: **Settings → Apps → Plugins → Add Plugin**. Pick
   `DmTome.snplg` and tap **Install**.
5. Open any note. The left toolbar should now show a **DM Tome** button.
   Tap it. A black-and-white console appears and runs a set of probes,
   printing a line per SDK call.
6. Write a word by hand, lasso it, and look for a **Capture** button in the
   lasso toolbar. Tapping it should show recognized text in the console.

Version 0.1 is deliberately a test instrument, not the real tool. Every line it
prints tells us whether a primitive we plan to build on actually works on your
device and what the data looks like. Send me a photo or transcription of the
console output and we move to version 0.2 with facts instead of guesses.

If the plugin installs but the button never appears, the usual cause is the
`pluginKey` in `PluginConfig.json` not matching the app name in `app.json`.
Both are `DmTome` in this repo; do not rename one without the other.

## Step 3: Install the Windows toolchain

Open **PowerShell** (not as administrator) and run each block.

Install Node.js LTS. Supernote requires Node 18 or newer; this gets 22.

```powershell
winget install OpenJS.NodeJS.LTS
```

Install Git.

```powershell
winget install Git.Git
```

Close and reopen PowerShell so the new PATH takes effect, then verify.

```powershell
node -v
npm -v
git --version
```

Allow PowerShell to run the build script. This affects only your user account.

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

If `winget` is missing, install Node from https://nodejs.org (LTS button) and
Git from https://git-scm.com/download/win with default options.

## Step 4: Clone and build

```powershell
cd H:\Supernote_projects
git clone https://github.com/gofishygo/Supernote_Dm_Tome.git DMtome
cd DMtome
git checkout claude/gifted-ramanujan-qgcoa7
```

Then double-click `tools\deploy.cmd` (see the everyday loop below). To build
without deploying, run `npm run build:win`; the output is
`build\outputs\DmTome.snplg`. The first build takes a minute or two because
Metro has to walk `node_modules`. Later builds are faster.

## Everyday loop

The working copy lives at `H:\Supernote_projects\DMtome`.

1. Pull my latest changes:

```powershell
cd H:\Supernote_projects\DMtome
git pull
```

2. Plug the Manta in over USB and unlock it. It appears in Explorer as
   **This PC → Supernote A5 X2 Manta → Internal shared storage**.
3. Double-click `tools\deploy.cmd`. It installs dependencies on the first
   run, builds, finds the Manta, and copies `DmTome-<version>.snplg` into
   `MyStyle`. The window stays open so you can read any red line.
   `tools\send-only.cmd` skips the build and sends the last one.
4. On the Manta: **Settings → Apps → Plugins → Add Plugin**, pick the
   versioned file, **Install**. If the install is refused, remove the old DM
   Tome on that page first.
5. Open a note and test.

Why a script instead of drag and drop: the Manta is an MTP device, so it has
no drive letter and ordinary copy commands cannot see it. The script asks
Windows Explorer's own object model (Shell.Application) to do the copy, which
is exactly what a drag and drop does, minus the mouse.

Because the `pluginID` in `PluginConfig.json` never changes, the device treats
every build as the same plugin. Do not edit that field. Bump `versionCode`
and `versionName` for each build you intend to install.

## Optional: let me build on your PC directly

If you share a folder through Remote Control, I can run the build on your
machine and copy the file straight to the Manta over USB while we talk. In the
Claude desktop app open **Settings → Claude Code → Remote Control** and share
the cloned repo folder. Then tell me and I will connect to it.

## If we ever need native code

Some future features might want a native Android module (for example reading
arbitrary text files, which the SDK's FileUtils cannot do today). That day you
would install:

- JDK 19 or newer (Supernote docs; Microsoft's OpenJDK build is fine)
- Android Studio Narwhal 2025.1.2 or newer
- SDK Platform 35 and Build-Tools 35.0.0 from the SDK Manager
- `ANDROID_HOME` pointing at `%LOCALAPPDATA%\Android\Sdk`

The build script detects Java or Kotlin files and switches on the Gradle step
automatically. Until then, skip all of it.

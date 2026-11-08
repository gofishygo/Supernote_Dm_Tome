#!/usr/bin/env python3
"""Validate a Supernote plugin project before building.

Usage: python3 check_plugin.py [project-dir]

Checks the mistakes that fail silently on the device: pluginKey mismatch,
wrong React Native version, stale SDK, missing icon, unstable pluginID, and
the init order in index.js. Exit code 1 if any error is found.
"""
import json
import re
import sys
from pathlib import Path

RN_REQUIRED = "0.79.2"
MIN_SDK = (0, 2, 0)


def load_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except json.JSONDecodeError as e:
        print(f"ERROR  {path.name}: invalid JSON ({e})")
        return None


def version_tuple(spec):
    m = re.search(r"(\d+)\.(\d+)\.(\d+)", spec or "")
    return tuple(int(x) for x in m.groups()) if m else None


def main(root):
    errors, warnings = [], []
    root = Path(root)

    pkg = load_json(root / "package.json")
    app = load_json(root / "app.json")
    cfg = load_json(root / "PluginConfig.json")

    if pkg is None:
        errors.append("package.json missing; is this the project root?")
        return report(errors, warnings)

    deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
    rn = deps.get("react-native", "")
    if version_tuple(rn) != version_tuple(RN_REQUIRED):
        errors.append(f"react-native is '{rn}', PluginHost requires {RN_REQUIRED}")
    for name, spec in deps.items():
        if name.startswith("@react-native/") and version_tuple(spec) and version_tuple(spec) != version_tuple(RN_REQUIRED):
            warnings.append(f"{name} is '{spec}', expected {RN_REQUIRED}")
    sdk = deps.get("sn-plugin-lib")
    if not sdk:
        errors.append("sn-plugin-lib is not a dependency")
    elif (version_tuple(sdk) or (0, 0, 0)) < MIN_SDK:
        warnings.append(f"sn-plugin-lib '{sdk}' is old; 0.2.x adds openFile, jumpToPage, recognizeElements, permissions")

    app_name = (app or {}).get("name")
    if not app_name:
        errors.append("app.json has no 'name'")

    if cfg is None:
        warnings.append("PluginConfig.json not present yet; the first build generates it (then re-run this check)")
    else:
        if cfg.get("pluginKey") != app_name:
            errors.append(f"pluginKey '{cfg.get('pluginKey')}' != app.json name '{app_name}' (plugin will never run)")
        pid = cfg.get("pluginID", "")
        if not re.fullmatch(r"[a-z0-9]{16}", pid):
            errors.append(f"pluginID '{pid}' should be 16 lowercase alphanumerics")
        if cfg.get("jsMainPath") != "index":
            warnings.append(f"jsMainPath is '{cfg.get('jsMainPath')}', expected 'index'")
        icon = cfg.get("iconPath")
        if not icon:
            warnings.append("iconPath is empty; the plugin shows no icon")
        elif not (root / icon).exists():
            errors.append(f"iconPath '{icon}' does not exist")
        if not str(cfg.get("versionCode", "")).isdigit():
            errors.append("versionCode must be a numeric string")

    index = root / "index.js"
    if index.exists():
        src = index.read_text(encoding="utf-8")
        reg = src.find("registerComponent(")
        init = src.find("PluginManager.init(")
        btn = src.find("registerButton(")
        lst = src.find("registerButtonListener(")
        if init == -1:
            errors.append("index.js never calls PluginManager.init()")
        elif reg != -1 and init < reg:
            errors.append("PluginManager.init() must come after AppRegistry.registerComponent()")
        if btn != -1 and init != -1 and btn < init:
            errors.append("registerButton() called before PluginManager.init()")
        if lst != -1 and btn != -1 and lst < btn:
            warnings.append("registerButtonListener() appears before registerButton(); docs say register buttons first")
    else:
        errors.append("index.js missing")

    # The build runs Gradle only when the project defines a ReactPackage or a
    # third-party node module ships Java/Kotlin. The template's own
    # MainActivity/MainApplication do not count.
    pkg_re = re.compile(r"(implements|extends)\s+(ReactPackage|TurboReactPackage|BaseReactPackage|ViewManagerOnDemandReactPackage)")
    android = root / "android"
    if android.exists():
        for f in list(android.rglob("*.java")) + list(android.rglob("*.kt")):
            if "build" in f.parts:
                continue
            if pkg_re.search(f.read_text(encoding="utf-8", errors="ignore")):
                warnings.append(f"ReactPackage in {f.relative_to(root)}: build will run Gradle (needs JDK + Android SDK)")
    nm = root / "node_modules"
    ignored = {"react-native", "sn-plugin-lib"}
    if nm.exists():
        for mod in sorted(nm.iterdir()):
            names = [mod.name] if not mod.name.startswith("@") else [f"{mod.name}/{c.name}" for c in mod.iterdir() if c.is_dir()]
            for full in names:
                if full in ignored or full.startswith("@react-native/") or full.startswith("@react-native-community/"):
                    continue
                d = nm / full / "android"
                if d.exists() and (any(d.rglob("*.java")) or any(d.rglob("*.kt"))):
                    warnings.append(f"node module '{full}' has Android sources: build will run Gradle")

    return report(errors, warnings)


def report(errors, warnings):
    for w in warnings:
        print(f"WARN   {w}")
    for e in errors:
        print(f"ERROR  {e}")
    if not errors and not warnings:
        print("OK     project looks ready to build")
    elif not errors:
        print("OK     no blocking problems")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "."))

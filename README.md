# GT One-Click Dispatch

A Chrome extension for resource gathering in GTarcade's Game of Thrones. Select a resource point in the game, then press **F8** or click the extension icon to apply **army preset slot 1**, dispatch troops, and use march speedups until the estimated remaining travel time is **1 second or less**.

Current version: **1.2.0**. This extension is installed separately from the legacy gathering assistant in `chrome-extension/`. The extension name and interface currently remain in Traditional Chinese.

## Requirements

- Chrome 125 or later.
- Supported game build: `2.81.0_c2cae856e7`, with the exact WASM fingerprint in `native-profile.json`.
- An available army preset in slot 1. Its name does not have to be “Spear.”
- A manually selected, unoccupied resource point for ordinary gathering.

Game updates that change the verified build require a new, validated native profile before the extension can run.

## Installation and updates

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select this repository's root folder, `deploy_assisst`, which contains `manifest.json`. Do not select the ZIP or the `chrome-extension/` subfolder.
3. Pin **GT 一鍵出征** (GT One-Click Dispatch) to the Chrome toolbar.
4. Open or refresh the game page.

After updating the source files, click **Reload** on the extension's card in `chrome://extensions`, then refresh the game page to load the updated F8 listener.

If an older installation points to the former `chrome-one-click` directory, load this repository root instead. Extension storage is not guaranteed to migrate between installation paths.

## Usage

1. Select an available resource point and leave its gathering menu or dispatch panel open.
2. Click inside the game to give it keyboard focus.
3. Press **F8** once, or click the extension icon.
4. The extension checks the game version and state, selects preset slot 1, dispatches once, and correlates the newly created march with your target.
5. It uses speedup item **10303**, one item at a time, checking the inventory and march response before continuing.
6. A green **✓** means the same march has reached the target and started gathering. An orange **!** means you should open the extension's **Options** page to inspect the execution log.

There is no fixed startup countdown. Repeated clicks while a run is active do not queue another dispatch.

| Control | Action |
| --- | --- |
| F8 | Start from the focused game page |
| Extension toolbar icon | Start on the game tab |
| Alt+Shift+G | Alternative start shortcut |
| Alt+Shift+X | Stop subsequent actions |
| Stop button on the Options page | Stop subsequent actions |

Stopping does not recall dispatched troops or refund consumed items. Chrome command shortcuts can be changed at `chrome://extensions/shortcuts`; the page-level F8 binding is not controlled by that page.

## Speedup behavior

Version 1.2.0 removes the previous two-item limit. Each successful speedup is followed by another state check. Speedups stop when:

- The conservative remaining-time estimate is **≤ 1 second**.
- The march has finished traveling or started gathering.
- The available speedup inventory reaches zero.

The estimate uses the game's `finish - start - speedupSeconds`, minus monotonic elapsed time since the extension first observed the new march. It does not depend on the computer's date or time zone. Initial observation latency is not subtracted, so the estimate can be slightly longer than the game's displayed countdown.

Zero or one available item does not prevent dispatch. If items run out, troops continue traveling normally. After speedups stop, the extension watches for arrival for up to two minutes. A timeout reports that arrival was not confirmed; it does not recall the march or send more items.

Invalid timing data, an unexpected state, a blocking game dialog, cancellation, or a missing acknowledgement stops further actions. Dispatch and speedup commands are never automatically resent after a timeout. Check the game's troop state before starting another run after an error.

## F8 troubleshooting

F8 displays a brief acknowledgement or error message. A key-release fallback can trigger the action when another script intercepts key-down; a normal press and release still starts only one run. Holding the key does not repeatedly dispatch.

If F8 has no visible effect:

1. Click the game canvas and try again. Some keyboards require **Fn+F8**.
2. Right-click the extension icon, open **Options**, and click **修復 F8（不出征）** (“Repair F8 — no dispatch”). This reinstalls the listener without dispatching troops.
3. Reload the extension, refresh the game page, and check its site access permissions.

F8 is ignored in normal web input fields and editable elements. Unity's canvas-rendered chat fields cannot be reliably identified by this check, so avoid pressing F8 while chatting.

## Execution and limitations

- Uses the game's original native methods, without screen coordinates or packet replay.
- Supports ordinary resource gathering only, not attacks on players or other combat targets.
- Preserves WASM fingerprint, method signature, target, troop, inventory, and march identity checks. Additional confirmation dialogs are not accepted automatically.
- Since v1.1.0, the main extension uses Chrome's scripting API and does not request the debugger permission or attach a debugger. Post-dispatch polling reads only march, inventory, and blocking-dialog state. No FPS or end-to-end performance improvement has been measured.
- The legacy assistant's traffic observation feature still uses the debugger API.
- Keep the game tab open during execution. Avoid simultaneously changing the target, operating the march manually, or enabling another assistant's traffic observer.
- Main-extension logs are stored in Chrome session storage and do not record login URLs, packets, or credentials.

## Verification

The latest automated verification passed **52 tests** and syntax checks for **21 JavaScript files**: 24 tests for the main extension and 28 for the legacy assistant.

An earlier live test verified native preset selection, dispatch, two speedups, and the transition to gathering. Its summary is retained in `research/capture/native-live-test-2026-10-25.json`. The user has confirmed that v1.1.0 works. The v1.2.0 remaining-time threshold has been tested offline; it has not yet been verified through a new live dispatch with item consumption.

Run verification and packaging from the repository root:

```powershell
node tools/verify.mjs
python tools/package.py
```

Verification records results and source hashes in `.skill/notes/verification.json`. Packaging creates `dist/gt-one-click.zip` and `dist/gt-gather-helper.zip` using explicit file allowlists. Research captures, tests, and skill documents are excluded from the packages. No npm install, transpiler, or bundler is required.

## Repository layout

| Path | Purpose |
| --- | --- |
| Root JS/MJS files, `manifest.json`, and status page | Main One-Click Dispatch extension |
| `chrome-extension/` | Separately installable legacy gathering assistant, including traffic observation and coordinate mode |
| `research/` | Research scripts and local evidence; raw captures are excluded from Git except for the explicitly retained live-test summary |
| `tools/` | Verification and packaging scripts |
| `.skill/` | Module guidance, architecture, testing references, and maintenance evidence |
| `graphify-out/` | Local AST relationship graph and report |
| `dist/` | Generated ZIP packages, excluded from Git |

Read [AGENTS.md](AGENTS.md) and the [module skill](.skill/SKILL.md) before development. The [Graphify report](graphify-out/GRAPH_REPORT.md) describes static relationships; dynamic extension messaging and native calls require source-level verification. Graphify and research Python dependencies reside in the parent workspace; see the [build environment reference](.skill/references/build-environment.md) for paths and environment overrides.

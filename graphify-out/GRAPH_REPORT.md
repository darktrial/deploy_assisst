# Graph Report - deploy_assisst  (2026-10-25)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 254 nodes · 462 edges · 13 communities (11 shown, 2 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10

## God Nodes (most connected - your core abstractions)
1. `TrafficObserver` - 17 edges
2. `start()` - 9 edges
3. `NativeClient` - 9 edges
4. `NativeClient` - 9 edges
5. `render()` - 8 edges
6. `guard()` - 7 edges
7. `run()` - 7 edges
8. `nativeRun()` - 7 edges
9. `click()` - 6 edges
10. `init()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `nativeSession()` --calls--> `NativeClient`  [EXTRACTED]
  chrome-extension/background.js → chrome-extension/native-client.mjs
- `nativeRun()` --calls--> `runNative()`  [EXTRACTED]
  chrome-extension/background.js → chrome-extension/native-runner.mjs
- `nativeRun()` --calls--> `validateNativeOptions()`  [EXTRACTED]
  chrome-extension/background.js → chrome-extension/native-runner.mjs
- `harness()` --calls--> `TrafficObserver`  [EXTRACTED]
  chrome-extension/observer.test.mjs → chrome-extension/observer.mjs
- `harness()` --calls--> `runOneClick()`  [EXTRACTED]
  one-click.test.mjs → one-click.mjs

## Import Cycles
- None detected.

## Communities (13 total, 2 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.10
Nodes (11): fields(), main(), read_varint(), table_rows(), load_local_dependencies(), main(), Handler, main() (+3 more)

### Community 1 - "Community 1"
Cohesion: 0.10
Nodes (21): badge(), check(), note(), persist(), sleep(), start(), state, writes (+13 more)

### Community 2 - "Community 2"
Cohesion: 0.17
Nodes (12): stopObservation(), autoAttach, httpType(), LIMITS, payload(), safeText(), safeUrl(), scrubText() (+4 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (26): action, default_title, background, service_worker, type, commands, mark-boost, mark-march (+18 more)

### Community 4 - "Community 4"
Cohesion: 0.20
Nodes (20): capture(), check(), click(), guard(), nativeRun(), nativeSession(), note(), observer (+12 more)

### Community 5 - "Community 5"
Cohesion: 0.09
Nodes (23): action, default_title, background, service_worker, type, commands, _execute_action, stop (+15 more)

### Community 6 - "Community 6"
Cohesion: 0.20
Nodes (17): api(), download(), field(), init(), message(), on(), profile(), profiles (+9 more)

### Community 7 - "Community 7"
Cohesion: 0.20
Nodes (9): NativeClient, nativeInPage(), runNative(), validateNativeOptions(), clone(), memoryFixture(), profile, queue() (+1 more)

### Community 8 - "Community 8"
Cohesion: 0.25
Nodes (7): analyze(), decode(), fields(), lz4_block(), main(), schemas(), varint()

### Community 9 - "Community 9"
Cohesion: 0.17
Nodes (7): commands, hashes, notes, root, sources, summary, tests

### Community 10 - "Community 10"
Cohesion: 0.43
Nodes (4): instructions(), main(), uint(), Wasm

## Knowledge Gaps
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `TrafficObserver` connect `Community 2` to `Community 4`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.09716599190283401 - nodes in this community are weakly interconnected._
- **Why does `NativeClient` connect `Community 7` to `Community 4`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.10384068278805121 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.08262108262108261 - nodes in this community are weakly interconnected._
- **Should `Community 5` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
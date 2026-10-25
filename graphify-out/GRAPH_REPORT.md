# Graph Report - deploy_assisst  (2026-10-26)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 285 nodes · 531 edges · 14 communities (13 shown, 1 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 25 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `cb5b9074`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

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
- Community 11
- Community 12

## God Nodes (most connected - your core abstractions)
1. `TrafficObserver` - 17 edges
2. `start()` - 11 edges
3. `NativeClient` - 9 edges
4. `render()` - 8 edges
5. `NativeClient` - 8 edges
6. `guard()` - 7 edges
7. `run()` - 7 edges
8. `nativeRun()` - 7 edges
9. `connect()` - 6 edges
10. `click()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `harness()` --calls--> `selectedResource()`  [EXTRACTED]
  activation.test.mjs → activation.mjs
- `start()` --calls--> `selectedResource()`  [EXTRACTED]
  background.js → activation.mjs
- `nativeSession()` --calls--> `NativeClient`  [EXTRACTED]
  chrome-extension/background.js → chrome-extension/native-client.mjs
- `nativeRun()` --calls--> `runNative()`  [EXTRACTED]
  chrome-extension/background.js → chrome-extension/native-runner.mjs
- `nativeRun()` --calls--> `validateNativeOptions()`  [EXTRACTED]
  chrome-extension/background.js → chrome-extension/native-runner.mjs

## Import Cycles
- None detected.

## Communities (14 total, 1 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.10
Nodes (11): fields(), main(), read_varint(), table_rows(), load_local_dependencies(), main(), Handler, main() (+3 more)

### Community 1 - "Community 1"
Cohesion: 0.09
Nodes (11): selectedResource(), before, harness(), selected, commands, hashes, notes, root (+3 more)

### Community 2 - "Community 2"
Cohesion: 0.12
Nodes (26): activationMode(), badge(), check(), connect(), disableWatch(), note(), persist(), prepareAutomatic() (+18 more)

### Community 3 - "Community 3"
Cohesion: 0.17
Nodes (12): stopObservation(), autoAttach, httpType(), LIMITS, payload(), safeText(), safeUrl(), scrubText() (+4 more)

### Community 4 - "Community 4"
Cohesion: 0.08
Nodes (26): action, default_title, background, service_worker, type, commands, mark-boost, mark-march (+18 more)

### Community 5 - "Community 5"
Cohesion: 0.21
Nodes (20): capture(), check(), click(), guard(), nativeRun(), nativeSession(), note(), observer (+12 more)

### Community 6 - "Community 6"
Cohesion: 0.09
Nodes (23): action, default_title, background, service_worker, type, commands, _execute_action, stop (+15 more)

### Community 7 - "Community 7"
Cohesion: 0.20
Nodes (17): api(), download(), field(), init(), message(), on(), profile(), profiles (+9 more)

### Community 8 - "Community 8"
Cohesion: 0.25
Nodes (7): analyze(), decode(), fields(), lz4_block(), main(), schemas(), varint()

### Community 9 - "Community 9"
Cohesion: 0.20
Nodes (9): NativeClient, nativeInPage(), runNative(), validateNativeOptions(), clone(), memoryFixture(), profile, queue() (+1 more)

### Community 10 - "Community 10"
Cohesion: 0.57
Nodes (7): changed(), click(), dispose(), prepare(), schedule(), show(), update()

### Community 11 - "Community 11"
Cohesion: 0.54
Nodes (7): blur(), dispose(), eligible(), keydown(), keyup(), show(), trigger()

### Community 12 - "Community 12"
Cohesion: 0.43
Nodes (4): instructions(), main(), uint(), Wasm

## Knowledge Gaps
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `TrafficObserver` connect `Community 3` to `Community 5`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.09716599190283401 - nodes in this community are weakly interconnected._
- **Why does `NativeClient` connect `Community 9` to `Community 5`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.0873015873015873 - nodes in this community are weakly interconnected._
- **Why does `validateSteps()` connect `Community 5` to `Community 7`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.1166429587482219 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.08262108262108261 - nodes in this community are weakly interconnected._
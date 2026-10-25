# Graphify 建圖與關係證據

使用使用者提供的 graphifyy 0.9.95（CLI 名稱仍是 graphify），套件來源與隔離環境見 build-environment.md。未安裝全域 hook、未連遠端圖譜或 LLM。

## 建立／更新

```powershell
.\.skill\scripts\graphify.ps1 -Action Build
```

實際呼叫本機 `python -X utf8 -m graphify extract . --code-only --no-cluster --force --max-workers 2`，接著 `cluster-only . --no-label --no-viz`。兩階段避免自動 LLM 命名，`.graphifyignore` 排除 capture、外部工具、技能證據與產出。查驗 `graphify-out/graph.json`、`GRAPH_REPORT.md` 後才清除精確 cache 路徑。

Query 也會建立 cache/last_query_stamp；wrapper 在成功 Build/Query/Path/Explain 後都執行清理。直接使用原生 CLI 查詢時，交付前仍須核對並清除該 cache，不影響主要 graph 與 report。

2026-10-25 v1.2.0 更新結果：35 個 code 檔；raw 260 nodes / 512 edges，cluster 載入後 260 nodes / 477 edges、13 communities。邊數減少源自 Graphify 的圖模型／同端點合併，不可把輸出數量當原碼呼叫總數。報告含 17 條 INFERRED 邊；本文件的主鏈使用 EXTRACTED 邊並核對原碼。

## 已執行查詢

```powershell
& ../.codexdeps/graphify-venv/Scripts/python.exe -X utf8 -m graphify query 'preset dispatch boost arrival' --seed one_click_runoneclick --context call --budget 1400
.\.skill\scripts\graphify.ps1 -Action Path -From background_start -To native_runner_runnative
.\.skill\scripts\graphify.ps1 -Action Explain -Question native_client_nativeclient
```

輸出保存在 `../notes/graph-query.txt`、`graph-path.txt`、`graph-explain.txt`。初次寬泛 query 混入兩版同名 NativeClient 且達 token 上限；已用 node ID、seed 與 context 縮小，保留可完整閱讀的 14-node 查詢。

| 關係 | 圖譜證據 | 實碼核對 |
| --- | --- | --- |
| start → runOneClick → runNative | path 最短兩跳，EXTRACTED calls | background.js start、one-click.mjs、native-runner.mjs |
| start → new NativeClient | explain 反向 caller | background.js 建構後 connect，再呼叫 runOneClick |
| NativeClient methods | connect/call/constructor | native-client.mjs，scripting MAIN 與唯一 documentId |
| 舊版 nativeRun → runNative | GRAPH_REPORT Surprising Connections | chrome-extension/background.js 原生模式 |

## 缺漏與手動補證

- v1.1.0 的 hotkey.js 已使用具名 handler，現在可抽取符號；跨 extension runtime message 的 F8 → start 關係仍須由 manifest、兩端實碼及 VM 測試核對。
- `research/inspect_unity_bundles.py` 是頂層腳本，沒有具名符號；以實碼定位，不推論檔案不存在。
- nativeInPage 被序列化成字串後跨 context 執行，JS call graph 無法完整表示這條資料流；用主版 native-client.mjs 的 func/args/documentIds 與 native-page.mjs 的 command branches 核對；舊版則核對 Runtime.evaluate expression。
- 遊戲 WASM 的動態 slot 及內部 network 方法不在此次 Graphify 語料，依 profile、離線 WASM 報告與既有實測摘要交叉確認。
- CSS／README 語義未抽取；JSON manifest 的節點只表示結構，不能當 Chrome runtime 的證據。

後續變更跨模組、檔案位置、初始化／資料流或主要函式名時重建並重跑相關查詢。只改文案不必為數字變動重建。工具缺失、query 名稱不唯一（exit 3）或無節點（exit 4）時記錄原因，先縮小 node ID／用原碼查核，不盲目重試或宣稱圖譜證實不存在。

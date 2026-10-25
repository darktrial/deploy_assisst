---
name: deploy-assisst-developer
description: 維護 deploy_assisst 的 GT 一鍵出征 Chrome 擴充功能、原生 Unity 橋接、舊版採集助手與離線研究工具；用於功能修改、除錯、版本適配、打包、測試及呼叫關係研究。
metadata:
  version: "1.0.0"
---

# deploy_assisst 模組技能

## 1. 模組總覽

`<repo-root>` 是含根目錄 `manifest.json` 的 deploy_assisst。先讀 `AGENTS.md`；只按任務需要載入下列參考資料，資源大小與載入條件見本目錄 `manifest.json`。

| 元件 | 類型／輸出 | 用途 |
| --- | --- | --- |
| 根目錄 JS/MJS、manifest、status | Chrome MV3／gt-one-click.zip | F8／工具列，一次採集出征與最多兩次加速 |
| chrome-extension/ | 獨立 MV3／gt-gather-helper.zip | 原生模式、被動通訊觀察與校準座標模式 |
| research/ | Python 離線工具與本機證據 | 協定、Unity 資產、WASM 呼叫路徑研究 |
| tools/、.skill/scripts/ | 建置／驗證工具 | Node 測試、白名單打包、圖譜與資源索引 |

主模式為 **Pipeline**，以 **Tool Wrapper** 封裝 Node、Graphify 與打包命令，以 **Generator** 維護文件／索引。Reviewer 僅在審查任務使用，規則見 [review rubric](references/rubrics/code_review_rubric.md)；缺少必要目標資訊時才進入 Inversion 收集狀態，不將一般讀碼變成問答流程。

## 2. 核心架構知識

主鏈：`hotkey.js → runtime message → background.start → NativeClient.connect → runOneClick → runNative → NativeClient.call → nativeInPage → 遊戲原生方法`。Chrome action 直接進入 `start`，不經 content script。

- `runOneClick(client, snapshot, deps)` 固定 `preset=1`、`boosts=min(2, inventory)`；回傳含 `arrived:true` 的結果前，要確認同一 target／queue／march 的採集狀態。
- `runNative(client, {preset,target,boosts}, {check,sleep,note,now})` 開面板、套 preset、出征、關聯唯一新 queue、逐次加速；其完成不等同抵達。
- `NativeClient.connect(profile)` 找唯一 Unity 預設 context，校驗完整 WASM；`call(command,args,verifyHash=false)` 透過 CDP 求值並檢查例外。
- snapshot：`source/target/occupied/presets/panel/queues/boostInventory/blockingWindows`。`Queue.uid/marchId/target` 與 `panel.soldiers` 為十進位字串，目標參數為整數。更多欄位、方法 slot 和版本更新步驟見 [architecture](references/architecture.md)。
- 限制：等待原生回應 8 秒／150ms 輪詢；抵達等待 120 秒／500ms；Runtime.evaluate timeout 10 秒；加速道具 10303、每次 count=1。兩版停止鍵與啟動倒數不同。

已執行 Graphify query、path、explain，證據為 `notes/graph-query.txt`、`notes/graph-path.txt`、`notes/graph-explain.txt`；已用 `background.js`、`one-click.mjs`、`native-runner.mjs`、`native-client.mjs` 核對 `start → runOneClick → runNative` 與 NativeClient 初始化。F8 匿名 callback、跨 context 序列化及 WASM 動態呼叫未被完整建模，見 [graphify](references/graphify.md)。

## 3. 建置系統

從 `<repo-root>` 執行 `node tools/verify.mjs`、`python tools/package.py`。擴充功能是原生 ESM，不需 npm、編譯器、header/library、make 或 Conan；目前無 CI/CD。實測 Node 22.14.0、Python 3.11.5，Chrome manifest 最低 125。Graphify 與 Selenium／UnityPy 是研究依賴，不是擴充功能執行依賴。

環境變數、可攜路徑、工具安裝與各驗證命令見 [build-environment](references/build-environment.md)。不要讀取完整環境變數或 credential；不需要 API key 的本機圖譜模式優先。

## 4. 單元測試

使用 `node:test` 與 `assert/strict`，主版本 17 項、舊版 28 項（含子測試）。`tools/verify.mjs` 直接測本目錄來源，保存命令、exit code、Node 版本與 SHA-256；沒有測試用複製原始碼或 ABI 差異。

修改時依 [testing](references/testing.md) 選擇 fixture 與負向場景。記憶體 fixture、CDP mock、F8 VM 測試與隔離 UI smoke 都不是已安裝 extension 的 E2E。2026-10-25 的原生實測摘要可證實當時的遊戲原生流程，不能替代當前工具列／F8 實機驗證。

## 5. 程式碼安全規則

正式來源、測試與範例同樣依 [safety](references/safety.md) 查核輸入、邊界、資源生命週期、動態求值與資料保存。保留 WASM 指紋與 method 檢查、執行鎖、精確 queue 比對及不重送規則。只在已確認輸入有效且型別範圍可證明時做轉型。

Coverity 尚未配置且本環境沒有相關命令，狀態為 **Not Run**。模板 C/C++ 候選函式清單不適用此 JS/Python 模組，不代表可省略實際資料流查核，也不建立函式名稱黑名單。

## 6. Graphify 知識圖譜

入口：`graphify-out/graph.json`、`graphify-out/GRAPH_REPORT.md`。按需讀 [graphify](references/graphify.md) 後查詢，不直接把整份 graph 放入 context。主要關係／檔案位置改變時用 `.\.skill\scripts\graphify.ps1 -Action Build` 重建；保留主要輸出，清除 cache。

Graphify 是調查線索。對同名函式使用完整 node ID；AST 缺漏與 cluster 合併邊不代表實際關係消失。工具失敗時記錄 Not Run／Blocked，仍可用實碼和測試完成獨立部分。

## 7. 執行流程（Pipeline）

| 階段／Gate | 通過證據 | 失敗後動作 |
| --- | --- | --- |
| S0 範圍 | 主版本／舊版／研究工具與預期結果明確 | 先定位來源；只有必要決策缺失才詢問 |
| S1 輸入 | 任務所需版本、目標檔案與授權可確認 | 不猜 profile、登入資料或實機道具額度 |
| S2 資源 | 已讀相關實碼、reference，工具能執行 | 按 error rules 診斷；完成不依賴缺件的工作 |
| S3 實作 | 保留適用行為契約、修改範圍可核對 | 修正實作，不以取消檢查換取測試通過 |
| S4 驗證 | 語法／受影響測試成功；圖譜按需更新；ZIP 白名單正確 | 失敗標示與證據保留，不重送遊戲指令 |
| S5 交付 | 文件、token 索引、踩坑紀錄及驗證限制更新 | 明確區分完成、Not Run 與需要使用者操作 |

一般修改不自動啟動完整安全掃描或實機出征。審查任務依 rubric 核對證據與待完成驗證。Gate 沒有程式執行器，所以不建立空的 `gating.json`。

## 8. 已知注意事項與陷阱

- 根目錄與 chrome-extension 的 native 檔案相似但不完全相同；主版無倒數，舊版保留 3 秒倒數。
- preset `pos` 與 `formationId` 不同；取 `preArmyDictAsType[0]`，不能用只有目前設定的 `preArmyDict` 代替。
- Unity class methodCount 位移為 168；profile 必須對應確切版本，不沿用早期 dump。
- 工具列鎖定防止並發出征，但 F8 DOM 輸入保護無法辨識 Unity 自繪聊天框。
- 搬移後研究依賴仍位於工作區 `.codexdeps`，經 `GT_RESEARCH_DEPS` 可覆寫；Chrome 需改載新目錄。歷史與限制見 [version history](notes/version_history.md)。

## 9. 異常處理

使用 [error handling](rules/error_handling.md)。可重試的離線讀取最多三次且先找原因；遊戲出征／加速不重試。多 queue、目標改變、版本錯誤、額外視窗或 context 中斷均停止後續動作。連續驗證失敗改用最小重現，不為例行除錯增加不必要的批准步驟。

## 10. Code Review 基準與歷史

模板提及的 `.github/firmware-code-review-instructions.md` 與中央歷史規範在本專案不存在；本專案證據格式使用 [review rubric](references/rubrics/code_review_rubric.md)，不宣稱已符合未提供的中央流程。

預定歷史位置為 `notes/code-review-history.md`，尚未建立：本次是搬移、研讀與文件生成，沒有正式完整審查證據。不要建立虛構歷史或有效基準；未來取得實際 review 後才保存可追溯 source/diff、finding、驗證與限制，並加入資源索引。沒有有效基準不能據此略過後續審查。

# 版本與研究紀錄

## 2026-10-25：主版 v1.2.1／舊版 v0.3.1 英文介面

- 兩版擴充功能名稱、manifest 描述、按鈕、HTML 標籤、執行紀錄、快捷鍵提示、原生錯誤及預設校準步驟改為英文；HTML lang=en。既有使用者自訂流程名稱及遊戲回傳名稱不強制翻譯。
- 修正主版 manifest 仍寫「最多兩個道具」的過期文案，改為剩餘 ≤ 1 秒。只變更文字與版本，沒有改動流程、權限、方法或道具條件。
- 更新錯誤訊息斷言；首次驗證的單一失敗來自 Refresh／refresh 大小寫，改為不區分大小寫。最終 52/52 測試與 21 檔語法通過，結果見 verification.json。
- 執行兩版完整測試、語法、HTML 元素 ID 與 JSON 結構核對、中文殘留掃描、ZIP 與資源索引驗證。文案修改不重建 Graphify；未實機出征或消耗道具。


## 2026-10-25：英文 README 更新

- 將主專案 README 改寫為英文，依 v1.2.0 整理安裝／更新、快捷鍵、加速門檻、計時限制、F8 修復、驗證範圍與專案目錄。
- 保留實際中文 UI 名稱以便對照；未變更執行碼或版本。文件連結、資源索引及 ZIP 內容核對完成；純文件變更不重跑遊戲測試或 Graphify。


## 2026-10-25 v1.2.0：剩餘一秒加速門檻

- 使用者確認 v1.1.0 可使用，要求取消兩道具限制、加速至剩餘 ≤ 1 秒；僅更新正式一鍵版，舊版採集助手未改。
- 每次一個 10303，等待庫存減少及行軍變化後才再次判斷。時間用原 queue 的 finish/start、累積 speedupSeconds 與首次觀察後的 performance.now 經過時間保守估計；不依賴 PC 日期、不猜 server clock 記憶體位置。初次通訊延遲可能使估計比遊戲 UI 稍長。
- ≤1 秒、已抵達或庫存歸零停止加速；時間缺失／異常、queue 改變、回應逾時、使用者停止均不重送。仍確認同一 queue 開始採集才報成功。
- 52/52 測試、21 檔語法通過；包含超過兩次加速、0/1 秒、自然經過時間、無效時間、庫存不足、缺回應、停止與不重送。未執行真實出征／道具消耗，未驗證新門檻的已安裝 E2E。
- Graphify 本機重建：35 檔、260 nodes、raw 512／cluster 477 edges、13 communities；重新核對 start → runOneClick → runNative 路徑。既有圖譜主要呼叫鏈不變。


## 2026-10-25：主版 v1.1.0 快捷鍵診斷與 scripting transport

- 唯讀查看使用者遊戲時，已安裝版本是 1.0.3；Unity iframe 內有一鍵助手 isolated context 與 capture keydown listener，document.hasFocus=true、activeElement=CANVAS、Unity Module 可用。當下並非腳本未注入或 DOM 輸入框焦點，但未操作 F8／出征來重現使用者故障，不能宣稱已確定單一根因。
- 程式查核確認舊 hotkey 丟棄 sendMessage 的 reject／ok:false，且只有 keydown；因此失效連線、分頁拒絕或攔截都可能呈現「沒反應」。新版加可見提示、keyup 備援、單次按鍵去重與修復按鈕；onInstalled 對既有遊戲分頁補注入，不出征。
- 主版 NativeClient 改用 chrome.scripting.executeScript MAIN，唯一 Unity documentId 鎖定；移除 debugger 權限及 attach/detach/event 工作。仍每次 connect 驗證完整 WASM 指紋，原生方法／目標／queue／道具上限檢查保留。錯誤以 __gtError envelope 回傳，避免注入例外被省略後無提示。
- 出征後改用 progress，讀 queues／inventory／blockingWindows，不反覆掃描預設列隊與面板方法。舊版採集助手不變，仍支援 debugger 通訊觀察。
- `node tools/verify.mjs` exit 0：50/50 測試、21 檔語法通過。新增 keypad down/up／keyup 備援／訊息失敗／重注入、documentId 防錯頁、錯誤不重送與 progress 不讀 preset 測試；background fixture 沒有 debugger API 也可執行。屬離線模擬，未完成已安裝 1.1.0 的真實 scripting/F8 E2E；沒有新的軍隊或道具消耗，沒有實測 FPS／速度改善數字。
- Graphify 已重建：260 nodes、raw 512／cluster 477 edges、13 communities，query/path/explain 更新且 cache 清理。主版 client 僅 constructor/connect/call；hotkey 的具名函式已可抽取。仍需人工核對 extension messaging 與 WASM 間接呼叫。
- 更新 README、AGENTS、技能與資源索引；安裝包以白名單重建。Coverity 仍 Not Run（無工具／capture target）。

## 2026-10-25：專案集中與技能 v1.0.0

- Chrome 主版維持 1.0.3，舊版維持 0.3.0；本次沒有修改遊戲操作流程或發出出征。
- deploy_assisst 原已含主版所有 14 檔及尚無提交的 Git。逐檔確認與 chrome-one-click SHA-256 相同後，搬移原檔覆蓋相同副本並移除空目錄；搬移前證據見 migration-source-hashes.json。
- chrome-extension、research 全部搬入 repo；ZIP 移至 dist，原始 traffic 移至 research/capture/original。模板移至 references/templates/module-skill-template.md。外部 graphify 原始碼與工作區 .codexdeps 仍在上一層，不複製到產品來源。
- 修正 README 載入路徑及 Python 的研究依賴解析。新增 research/environment.py，支援 GT_RESEARCH_DEPS，預設指回工作區 .codexdeps。解析器本身演算法未修改。
- 新增白名單打包與 Node 驗證命令；主版 ZIP 11 檔、舊版 13 檔，不含技能、測試、研究或登入紀錄。

### 驗證紀錄

`node tools/verify.mjs`：45 tests / 45 pass / 0 fail；21 個 JS/MJS 語法檢查。完整命令、exit code、Node v22.14.0／win32、來源 SHA-256 見 verification.json。Python 3.11.5 編譯檢查 9 個自製研究／打包檔案成功。`python tools/package.py` 兩包成功。

本次 Coverity Not Run：沒有 cov-build/cov-analyze/cov-format-errors，也沒有模組 capture target。已安裝擴充功能／F8 實機測試 Not Run；原有 10:04 的原生流程實測摘要仍保存於 research/capture/native-live-test-2026-10-25.json，不能當本次安裝測試。

搬移後 `python research/observer_ui_smoke.py` exit 0：隔離 Chrome 的 native probe/options/run、觀察開始／標記／停止／匯出／清除通過（mock extension API）。`python research/analyze_traffic.py research/capture/original/gt-traffic-2026-10-25T01-30-01-679Z.json --output research/capture/traffic-analysis-migration.json` exit 0：載入 7886 schemas、45 個收到的訊息全部解碼。兩者均未操作使用者遊戲。

技能驗證器原本用系統預設 cp950 讀 UTF-8 文件而失敗；改用 `python -X utf8 .../quick_validate.py .skill` 後回報 Skill is valid。這是驗證器編碼條件，不需修改 UTF-8 文件。資源索引由 resources.py 產生並驗證。

### Graphify 學習

使用使用者提供的 graphifyy 0.9.95，從雙層解壓目錄安裝到工作區隔離 venv。extract --code-only --no-cluster --force --max-workers 2，再 cluster-only --no-label --no-viz：35 code 檔，254 nodes，raw 491 edges／cluster 462 edges，13 communities。無 LLM token 消耗。

query/path/explain 已執行並存檔，確認 start → runOneClick → runNative；NativeClient 初始化與 methods 由實碼交叉核對。初次寬泛查詢因兩版同名符號而截斷，改用主版 node ID、seed、context 限制後取得完整 14-node 查詢。

hotkey.js 與 inspect_unity_bundles.py 無抽出符號，匿名／頂層流程需人工核對。序列化 native bridge 與 WASM 動態 call 不在完整 AST 語義範圍。重建腳本確認 graph.json／GRAPH_REPORT.md 後清理 cache；gitignore 排除 cache，未提交暫存。

後續 query 會重新建立 cache/last_query_stamp，故僅在 Build 後清理不足。已將成功 Query/Path/Explain 後的清理納入同一 wrapper，限於已確認輸出的 graphify-out/cache 絕對路徑。

### 模板適配與既有陷阱

模板要求的 10 節、Gate、資源 token 索引、按需 reference、錯誤規則、測試矩陣、rubric 與報告格式已落地。沒有 gating.json consumer，不建立假 schema。firmware .github 規範不在本 repo；C/C++／Conan／GoogleTest 指令不套用，Coverity 不宣稱通過。此次沒有正式 code review，故不創造 code-review-history.md 或有效基準。

過往已驗證知識：preset pos 與 formationId 不同；preArmyDictAsType[0] 才含完整列隊；class methodCount 位移 168。主版已移除固定 3 秒倒數，舊版仍保留。F8 的 DOM 輸入保護不能辨識 Unity 自繪聊天；Chrome 搬移後需從新目錄載入，不能只按舊項目的重新整理。

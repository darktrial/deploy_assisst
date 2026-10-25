# 版本與研究紀錄

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

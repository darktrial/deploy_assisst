# deploy_assisst 開發規範

本檔適用於本目錄及其子目錄。`<repo-root>` 指本目錄，不是上一層工作區。開發文件可使用繁體中文；擴充功能介面、提示與錯誤訊息統一使用英文。

## 先讀與任務路由

- 修改或研究本專案，先讀 [.skill/SKILL.md](.skill/SKILL.md)；用 [.skill/manifest.json](.skill/manifest.json) 選擇按需資源，不一次載入研究 dump 或全部圖譜。
- 根目錄是正式「GT 一鍵出征」；`chrome-extension/` 是可獨立載入的舊版採集助手，含觀察器與座標模式。兩者的原生橋接有重複檔案，但流程與預設值不同，不能直接整包互相覆蓋。
- `research/` 保存自製分析程式、離線證據與本機工具；`research/capture/`、`research/tools/` 的大檔／原始紀錄不加入發佈包。例外保存的既有實測摘要由 `.gitignore` 明確列出。
- 本目錄尚無 `.github/firmware-*.md`、C/C++ build、Conan 或 CI。模板中的韌體專用命令不適用，不補造規範或宣稱已完成 Coverity。

## 行為契約

- 一鍵版預設手動模式，由工具列、F8 或 Alt+Shift+G 啟動；可在 Options 儲存點選即執行模式，僅真實 canvas 點擊前後的新空資源或一般其他玩家城堡選取可觸發，停止時切回手動；使用者先選資源點或支援的玩家城堡，固定 preset `pos=1`，沒有固定啟動倒數。停止鍵 Alt+Shift+X。
- 每次出征一次，逐次使用 10303 加速道具直到保守估計剩餘 ≤ 1 秒（無固定個數上限）、每次一個；讀到本次 queue 的 `subType=7` 才報抵達。缺回應不重送，停止不撤軍。
- 保留確切 WASM SHA-256、大小、類別、方法 slot、參數數量檢查與目標／兵力／queue 關聯檢查。版本不符須更新有證據的 profile，不能略過檢查或猜位址。
- `nativeInPage` 經序列化進入遊戲 context，必須自包含，不可依賴外部 closure/import。64 位識別碼使用字串，不能先轉 Number 再驗證。
- 主版以 `chrome.scripting.executeScript` 的 MAIN world 執行原生橋接，綁定唯一 Unity `documentId`，不使用 debugger。舊版採集助手仍使用 CDP，兩版 transport 不可直接互換。
- 不以座標或封包重播作原生模式的失敗備援。另支援一般其他玩家城堡（CastleInfoWindow Attack）；不支援特殊戰場、集結或其他建築。攻擊僅報出征／加速階段完成，不以返程或 queue 消失宣稱抵達或勝利。
- 本次維護或文件工作不會自動觸發真實出征。實機測試依使用者已授權的目標、preset 與道具額度執行；沒有相關授權時先完成離線驗證，再取得缺少的決策。

## 驗證與交付

從本目錄執行：

```powershell
node tools/verify.mjs
python tools/package.py
```

前者檢查兩版 JavaScript 語法並跑 Node 測試，更新 `.skill/notes/verification.json`；後者以白名單產生 `dist/gt-one-click.zip`、`dist/gt-gather-helper.zip`。沒有 npm install／轉譯／bundler。

研究程式路徑或依賴修改時，驗證對應的離線流程；UI smoke 只在隔離的 mock 環境執行。`probe_gtarcade.py` 是歷史登入研究程式，不是 smoke test，勿當成一般檢查執行。

修改檔案位置、主要函式、呼叫／資料流時，執行 `.\.skill\scripts\graphify.ps1 -Action Build`，核對圖譜與實碼並保留查詢證據。Graphify 預設只做本機 AST，不呼叫 LLM、不上傳來源；完成輸出後刪除精確範圍內的 cache。詳見 [.skill/references/graphify.md](.skill/references/graphify.md)。

維護 `.skill/notes/version_history.md`；程式或資源改變後執行 `python .skill/scripts/resources.py --write` 更新索引，再執行同腳本不帶參數驗證。不要把測試通過或圖譜生成寫成完整 code review／已安裝擴充功能 E2E 通過。

發佈功能修改才調整對應 Chrome manifest 版本；目前主版 v1.4.0／舊版 v0.3.1。搬移後 Chrome 需從新目錄重新載入未封裝項目；不要假定原安裝路徑或 storage 自動轉移。

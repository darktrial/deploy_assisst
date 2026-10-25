# 程式碼使用條件與資料邊界

本規則適用正式來源、測試與 references/templates 中的程式片段。判斷基於實際輸入、型別、容量、生命週期與呼叫路徑，不依函式名稱定罪。

| 使用處 | 必要條件／證據 | 維護與驗證 |
| --- | --- | --- |
| 舊版 Runtime.evaluate | 固定 nativeInPage 函式＋JSON.stringify 純資料；明確 contextId、awaitPromise、timeout；檢查 exceptionDetails | 不接受訊息提供的程式文字；保留 CDP mock 與錯誤路徑 |
| 主版 scripting.executeScript | 固定 nativeInPage 函式與純資料 args，MAIN world，唯一 Unity documentId，明確錯誤 envelope | 不建立可被頁面呼叫的任意 bridge；導航後禁止沿用 frameId；新版不使用 debugger |
| WASM fn table 呼叫 | 完整 SHA／size，類別、方法、args、slot、arity 全數匹配 | profile 改版需離線資料與執行狀態證據；方法 fixture 不等於版本驗證 |
| DataView／HEAPU8 讀取 | range、list/dictionary count 與容量、字串長度限制；i64 字串保存 | 不把校驗搬到讀取之後；查核所有新增欄位的正確尺寸與 signedness |
| queueId → Number | 只在 boost 原生入口需要 int32，先檢查十進位與上限 2147483647 | 不對 marchId 做 Number 轉換；測大 ID 與錯誤 target |
| 非同步出征／加速 | busy、check、目標不變、唯一新 queue、ack 後下一步；缺回應不重送 | 停止只阻止後續動作；不能宣稱已送指令可撤回 |
| UI 文字輸出 | status 使用 textContent／createTextNode | 新增外部文字不可直接放 innerHTML |
| observer payload | URL 去 query/fragment、known secret 文字遮蔽、大小上限 | 二進位是不透明資料；不承諾完全脫敏，不放公開包或圖譜 |
| ZIP／Graphify 輸入 | package 明確白名單；graphifyignore 排除 capture/tools/.skill | 驗證 ZIP 清單、graph source_file，避免研究 dump 或登入紀錄外洩 |
| 研究解析器 | 目前是對已知本機資料的研究程式，不是通用不可信檔案服務 | extract_unity_webdata 未完整防路徑穿越；varint/反組譯解析限制需評估；不可將未知 archive 當可信輸入直接執行 |
| probe_gtarcade.py | 歷史登入研究工具，會保存原始 network 並輸出最終 URL | 不作自動驗證、不把其輸出當已遮蔽，後續如需使用先改成最小資料擷取 |

以上列出程式現況與使用邊界，不構成完整安全掃描或修復承諾。此次搬移沒有修改研究解析器演算法。

可用候選定位命令（從 repo root）：

```powershell
rg -n 'Runtime.evaluate|JSON.stringify|Number\(|getBigInt64|setBigInt64|innerHTML|write_bytes|sendCommand|sendMessage' . -g '*.js' -g '*.mjs' -g '*.py' -g '!research/capture/**' -g '!research/tools/**' -g '!graphify-out/**'
Get-Command cov-build,cov-analyze,cov-format-errors -ErrorAction SilentlyContinue
```

rg 只定位待查核處，零命中不代表安全。測試中的記憶體寫入用於 fixture 初始化，與正式橋接的唯讀記憶體不同；不要因同名 API 一律刪掉。

Coverity：本環境未找到上述工具，repo 無 capture target／checker list／CI 設定，所以為 **Not Run**，沒有 translation unit capture 證據，不產生虛構 cov-build 指令或報告。將來加入正式分析時記錄工具版本、受測來源、checker、缺陷查證與重掃結果；不以 suppression 隱藏未查證問題。

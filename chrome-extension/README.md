# GT 採集助手（Chrome 擴充功能 MVP）

手動選取建築物後，執行保存的 army preset 點擊流程。每次只執行一輪，不搜尋建築物、不循環採集。

## 0.3.0：原生採集模式（不用座標）

重新載入擴充功能並重開助手，即可使用頂部的「原生採集模式」。保留舊有通訊觀察與座標流程。

1. 在遊戲手動選取可採集的資源建築物，讓「資源採集」資訊視窗顯示。也可停在已開啟的一般採集出征面板。
2. 助手按「讀取遊戲狀態」，核對目標資源格、preset 名稱與加速庫存。
3. 選擇 army preset，以及道具 10303 使用 0、1 或最多 2 次。預設不使用加速。
4. 按「原生執行一次」。三秒後，程式沿用原有採集入口開啟面板、套用 preset、呼叫原有出征處理函式，再追蹤本次新行軍。
5. 只有新行軍可唯一對應至目標，才執行選定次數的加速；每次只用一個道具，確認庫存減少及 queue 狀態／累積加速變動後才繼續。行軍已抵達則停止加速。

`Alt+Shift+S` 可停止後續步驟。停止不會撤回已出征的軍隊，也不會恢復已用道具。遊戲若顯示確認、兵力不足等提示，處理函式保留這些正常檢查；助手等不到行軍回應會逾時，**不會跳過提示或重送指令**。每輪執行後需重新讀取狀態。

### 已確認的入口與版本

支援程式：`2.81.0_c2cae856e7`，SHA-256 `5f4dd34de793e3b0ff89c390c904dcc7622b394f20779ed70be1fa2c1f6d0667`。每次連線先驗證完整 WASM 指紋，再檢查類別名稱、方法名稱、參數數量、函式表索引與原生函式參數數量；不相符即停止。升級遊戲後需重新分析 `native-profile.json`，不可直接重用舊位址。

- `ResourcesInfoWindow.OnBtnCollection`：沿用資源視窗採集動作。
- `SendtrooppanelWindow.ClearCommanderBtn` → `setPerInfoShow`：與原本 preset 選取處理器相同的套用路徑。preset 資料來自 `WarHallPlugin.preArmyDictAsType[0]`，不是另一個僅存目前設定的 `preArmyDict`。
- `SendtrooppanelWindow.OnClickGoBtnHandler`：保留原有出征按鈕的條件與確認流程，沒有直接呼叫內部 SendDispatch 跳過檢查。
- `QueuePlugin.SendSpeedUpQueueRequest`：沿用原有建立請求與 `GotNetworkManager.SendMessage` 的流程，序列化和加密由遊戲處理。

橋接透過 CDP 在 Unity 所在的預設執行環境讀取 IL2CPP 類別與遊戲快取，並呼叫經過比對的原有 WASM 函式。**不寫入遊戲記憶體、不取得加密金鑰、不複製或重播網路封包。** 64 位行軍／queue ID 在助手之間以字串傳遞，避免精度遺失。這是依版本的原生函式橋接，並非遊戲官方提供的穩定外部 API。Unity 的一般 SendMessage 只能呼叫 GameObject 上特定參數形式的方法，不能直接呼叫這些多參數的管理器方法：[Unity 官方說明](https://docs.unity.com/en-us/engine/6000.6/manual/platform-specific/webgl/develop/interactingwithbrowserscripting/web-interacting-browser-unity-to-js)。

### 實際驗證與限制

2026-10-25 已在使用者現有 Chrome 遊戲中確認：執行中的 WASM 指紋與下載分析的版本一致；可讀取 12 組 preset、自己的行軍 queue 及道具 10303 庫存；成功不靠座標開啟資源格 349641 的出征面板，並透過原生路徑套用 preset 1「Spear」，兵力更新為 1,182,345。畫面保留在出征前，**沒有在這次驗證中派兵或消耗加速道具**。

出征與加速已完成方法描述、呼叫路徑、模擬測試及下方所列的實際伺服器回應驗證；已安裝助手的按鈕與連線生命週期仍待使用者首次操作確認。只支援一般地圖資源點採集，不處理城堡攻擊、集結、RTS 或其他活動出征面板；資源點若有現行 MarchID 則停止。資源資訊可能保留過去佔領者名稱，因此不以顯示名稱判斷是否可採集。

**2026-10-25 10:04（Asia/Taipei）實測更新**：依使用者指定的資源點與最多兩個道具額度，在原生入口實際出征一次並加速兩次成功。資源格 349641、Spear、兵力 1,182,345；新行軍 ID `4899549206363499`、queue `5783738`。道具 10303 庫存 `2656 → 2655 → 2654`；累計加速 `0 → 22 → 28` 秒，之後 queue 由行軍 subType 1 轉為採集 subType 7。網路層同時收到一次 WorldMarchResponse、兩次 SpeedUpQueueResponse 及相關庫存／行軍更新。測試經由授權遊戲 HTTPS frame 的原生呼叫完成；瀏覽器工具禁止讀取擴充功能頁，因此**未驗證已安裝助手介面按鈕與連線生命週期**。實測明細位於 `research/capture/native-live-test-2026-10-25.json`。

原生、通訊觀察與座標模式共用除錯連線鎖定，不能同時執行。請關閉 DevTools，避免其他擴充功能佔用同一分頁的 debugger。原生模式若無法連線，會顯示錯誤；不會自動改用座標點擊。

## 0.2.0：通訊觀察模式

已安裝舊版者：在 `chrome://extensions` 找到 GT 採集助手，按重新載入；關閉舊的助手視窗，再點擴充功能圖示重新開啟。使用相同資料夾載入可保留原有 army preset 流程。需要 Chrome 125 以上。

1. 先登入遊戲並手動選好目標建築物，關閉遊戲分頁的 DevTools。
2. 開啟助手、選擇遊戲分頁。在「通訊觀察模式」保留「包含二進位訊息內容」，按「開始觀察」。不需要座標校準。
3. 等待約 3 秒，留下未操作時的背景訊息作為比較基準。
4. 在助手填寫備註，例如 `army preset 2`，按「標記選 preset」；回遊戲選 preset，再等待約 3 秒。也可直接在遊戲按 `Alt+Shift+1`，再手動選 preset；快捷鍵標記不包含助手備註欄文字。
5. 出征前按 `Alt+Shift+2` 或助手「標記出征」，再手動出征，等行軍出現及約 3 秒回應。
6. 使用加速前按 `Alt+Shift+3` 或助手「標記加速」，再使用一次加速，等待約 3 秒。若分次使用兩次，請各標記一次；可用備註記錄道具種類及數量。
7. 回助手按「標記操作完成」，再「停止觀察」→「匯出通訊 JSON」。也可用 `Alt+Shift+S` 停止。將匯出的 `gt-traffic-*.json` 交給分析者。

**快捷鍵**：若未生效，到 `chrome://extensions/shortcuts` 檢查是否註冊成功或有衝突；介面的標記按鈕也可使用。觀察模式允許在助手和遊戲視窗之間切換，且不會送出滑鼠點擊、出征、加速或重播訊息。

**記錄範圍**：只附加你指定的遊戲分頁與相關 iframe／dedicated worker／shared worker。收錄 WebSocket 送出／收到的 frame、開關連線，以及 Fetch／XHR 的請求、狀態與可取得的回應內容。跨程序 iframe 使用 CDP flat session，並遞迴觀察子目標。開始前已建立的 WebSocket 可能缺少 endpoint，但後續 frame 仍會保留 session 與 requestId 供分組。HTTP 請求缺少 postData 時不補讀上傳內容；大於 1 MiB 的已知 HTTP 回應不擷取 body，靜態圖片／腳本不擷取 body。

**匯出格式**：`gt-traffic-v1`，包含開始／結束時間、停止原因、計數、警告，以及 `events`。每筆事件包含 `seq`、`elapsedMs`（從開始觀察起算）、`stage` 與可用的 CDP timestamp。`marker` 為手動標記；`ws_send`／`ws_receive` 為 WebSocket；`http_request`／`http_response`／`http_body` 為 HTTP。二進位 payload 以 base64 保存，不代表已解碼；文字為 UTF-8。單一 payload 最多保留 256 Ki 字元，截斷會標記 `truncated`；取消二進位選項時保留長度與 `omitted`，無法分析其實際內容。HTTP body 非同步取得，分析時可依 elapsedMs 與 CDP timestamp 排序。

**容量與保存**：10 分鐘、8000 筆或約 6 MiB 事件資料，先達者自動停止並保留紀錄。停止前最多等待 2 秒讓已開始擷取的 HTTP body 完成。停止後暫存於 `chrome.storage.session`，關閉助手再打開仍可匯出；重新啟動 Chrome、停用或重新載入擴充功能可能清除。觀察進行中主要保存在 service worker 記憶體，當機可能遺失。若超出 Chrome 暫存配額，介面會提示直接匯出。新觀察會覆蓋上一份；「清除紀錄」可手動移除。

**資料處理**：不保存 HTTP headers、cookies、完整 CDP request 或完整目標網址的 query／fragment／userinfo。可辨識的文字憑證欄位（例如 token、password、session）會遮蔽。未知文字、base64 與二進位內容不能保證移除敏感資料，因此請在登入後開始，將匯出檔視為可能含帳號／登入資料的本機分析檔。觀察器不會自行把紀錄上傳任何服務。

**排錯**：如果啟動失敗，先關閉該分頁 DevTools，再試一次。若操作後 WebSocket 與 HTTP 計數仍都是 0，先確認選的是遊戲分頁；可在觀察中重新整理遊戲、等待載入後再標記操作，以捕捉新連線。若還是沒有資料，停止並匯出供檢查 `target_attached`／`capture_error`。離開 GTarcade 遊戲網址或移除除錯連線會自動停止；正常重新整理同一遊戲網址則繼續觀察。

## 安裝

1. 在 Chrome 開啟 `chrome://extensions`，開啟「開發人員模式」。
2. 按「載入未封裝項目」，選擇 `<repo-root>\chrome-extension` 資料夾。
3. 開啟並登入 GTarcade 遊戲，關閉該分頁的 DevTools。
4. 點工具列的「GT 採集助手」圖示，會開啟獨立控制視窗。

## 第一次校準

原始 Recorder 提供 7 個 canvas 座標，但沒有 canvas 尺寸、等待時間或按鈕名稱。不能把 Recorder 的視窗尺寸當成 canvas 尺寸，也不能把 canvas 座標直接當成瀏覽器座標。附帶的 starter-profile.json 僅包含去除登入資訊的操作資料，所有步驟都需要重新校準。

1. 在遊戲中手動選好建築物；第一個選建築物步驟預設停用。
2. 在助手選擇遊戲分頁，按「擷取遊戲畫面」。
3. 選擇對應步驟的「校準」，點擊截圖中要點的位置。此動作只保存位置，不會點擊遊戲。
4. 自己在遊戲中操作到下一個畫面，再擷取並校準下一步。依實際功能修改步驟名稱。
5. 把「選擇 army preset」那一步指向想使用的 preset。按「另存新 preset」可複製流程，再校準該 preset 的位置。
6. 設定每一步「等待前置 ms」：這是**該步點擊之前**等待的時間，預設 1500ms；開啟行軍及加速視窗可能需要更久。
7. 最後兩次雙擊依使用者描述標成加速道具。核對次數、單擊／雙擊與實際道具位置；每個雙擊會送出兩次點擊，兩個步驟合計四次，不代表一定消耗四個道具。
8. 任何可能消耗加速道具的步驟都應勾選「加速道具」。執行時只有勾選「本次包含加速步驟」才會執行這些步驟。

## 使用

手動選好新建築物 → 選擇已校準的 army preset 流程 → 選擇是否包含加速 →「執行一次」。助手切回遊戲，倒數三秒後開始。`Alt+Shift+S` 隨時停止；也可回到助手按停止。若 Chrome 快捷鍵衝突，請到 `chrome://extensions/shortcuts` 設定。

執行時維持遊戲分頁與視窗在前景。尺寸、縮放或頁面捲動改變會停止；切換分頁／視窗、頁面載入、移除除錯連線也會停止。停止不會撤銷已出發的軍隊或已使用的道具。重跑前先把遊戲恢復到「已選好建築物」的起始畫面。

## 資料與限制

- 使用 Manifest V3、原生 JavaScript，沒有遠端服務與相依套件。流程保存在 `chrome.storage.local`，截圖僅留在控制視窗記憶體。
- 匯入 Recorder 時捨棄所有網址、登入 token 與導航斷言。匯入助手流程也採用欄位白名單，且必須重新校準。原始錄製檔未改動。
- `debugger` 權限用於當次截圖、座標操作和被動通訊觀察，結束即解除連接。Chrome 會顯示除錯提示；程式會檢查起始目標必須為 `https://game.gtarcade.com/game`。站點存取限於 game.gtarcade.com。觀察與座標操作／截圖互斥。
- 所有位置都來自**整個分頁可見畫面**的截圖，包含 iframe 裡的遊戲，避免推算跨來源 iframe 的偏移。校準及執行時均使用附加除錯連線後的視窗尺寸。
- 這版沒有影像辨識、OCR、Unity 內部狀態或成功檢查。視窗尺寸相同但遊戲面板移位、彈窗、延遲過長或遊戲地圖位置改變，仍可能點錯。每次僅執行一次，先驗證不含加速的流程。
- 尚未在實際遊戲驗證輸入是否被接受、行軍等待時間、道具用量及 preset 的正確位置。需要使用者在已登入遊戲校準並試跑。
- 若 WebGL 截圖顯示黑畫面，請先停止使用並回報，不能在不可見截圖上盲目校準。

## 開發驗證

在專案根目錄執行：

```powershell
node --test chrome-extension/core.test.mjs chrome-extension/observer.test.mjs chrome-extension/native.test.mjs
node --check chrome-extension/background.js
node --check chrome-extension/controller.js
```

測試涵蓋匯入去除敏感資料、未校準阻擋、加速選項、座標與尺寸檢查，以及模擬 Chrome API 下的失焦停止、取消時釋放滑鼠與解除除錯連線。模擬測試不代表遊戲端驗證完成。

觀察器測試另涵蓋文字遮蔽、二進位保留／省略、階段標記、子目標 Network.enable、HTTP body、容量／時間上限、手動停止與暫存失敗。`python research/observer_ui_smoke.py` 會在獨立 headless Chrome 中以模擬擴充 API 測試介面與 JSON 匯出，並產生 `research/capture/observer-ui.png`；需要本專案既有 `.codexdeps` 內的 Selenium。此測試不會連接使用者的 Chrome profile，也不驗證實際遊戲協定或擴充功能安裝。

原生模式測試包含：模擬 IL2CPP 記憶體布局與原生方法描述；讀取不執行方法；版本／指標／目標／道具數量拒絕；套用 preset 與 Go handler 路由；只追蹤新 queue；逐次加速確認；逾時不重送；取消／多支行軍／已抵達的處理。介面測試另覆蓋原生讀取、選項與執行訊息。研究工具 `research/inspect_native_build.py` 解析當前 WASM 函式表與直接呼叫，產生 `research/capture/build-2.81.0/native-call-graph.json`。

# 架構、介面與資料流

## 初始化與入口

主版注入 API 契約依 [Chrome scripting 官方文件](https://developer.chrome.com/docs/extensions/reference/api/scripting)：MAIN world、func/args、InjectionResult.documentId 與 target.documentIds。沒有把程式字串交給 eval。

1. 根 `manifest.json` 啟用 module service worker `background.js`；F8 content script 在 game 與 logins-gotpc frame 的 document_start 載入。
2. `hotkey.js` 只處理 trusted、非 repeat、無 modifier、非 composition、非 DOM 輸入區的 F8，送 `hotkeyRun`。background 再核對 extension sender、frame origin、頂層 `/game` URL 與 active tab。

   v1.1.0 以 keydown 為主，keyup 為備援；記錄已見到的按下事件，避免重複出征或將 modifier 組合鍵誤當單鍵。傳訊成功／拒絕／失效有頁面提示。onInstalled 與 options「修復 F8」只重注入 ISOLATED hotkey.js，具 dispose 防重複機制，不執行 native call。
3. action／Alt+Shift+G 直接進 `start(tab)`。busy 鎖不排隊，status 存 session storage，不附加 debugger。分頁載入、離開、關閉或停止會設 cancelled。
4. 主版 `NativeClient.connect` 用 scripting.executeScript 的 MAIN world 在 frames 中尋找唯一 Unity Module 和 canvas；綁定 documentId，先檢查 SHA-256。後續不以可重用的 frameId 代替 documentId。
5. `runOneClick` 固定第一組、逐次加速至保守估計剩餘 ≤ 1 秒或道具耗盡。`runNative` 先快照舊 queues、打開資源出征面板、套用預設、刷新 baseline、送一次出征；只採用目標吻合且 baseline 沒有的唯一新 queue。
6. 出征後用 progress 精簡快照（queues、boostInventory、blockingWindows），不重掃 presets。每次加速前確認 uid/marchId/target、subType=1 和庫存；送 count=1 後等待庫存下降且速度／行軍狀態更新。最後 `runOneClick` 只在同一隊伍 subType=7 時回傳抵達。

## 資料契約

| 結構 | 關鍵欄位／型別 | 意義 |
| --- | --- | --- |
| snapshot | build:string, source:resource/dispatch/none, target:number/null, occupied:boolean | 選取狀態；資源占用依現行 MarchID |
| preset | pos:number, name:string, formationId:number, soldiers:[{id,count}] | pos 才是選取第幾組，formationId 是陣型 |
| panel | preset:number, soldiers:string | 出征面板已套用內容，兵力 BigInt > 0 |
| queue | uid/marchId/target:string, mainType/subType/warType:number, speedupSeconds/start/finish:number | mainType=11、warType=0；1 行軍、7 採集；抵達後 speedupSeconds 可歸零 |
| native options | preset:1..100, target:positive integer, boosts:0..2 | 主版固定 preset=1；舊版允許選擇 |
| result | marchId/queueId:string, target/preset:number, arrived?:true | runNative 不承諾抵達；runOneClick 成功必有 arrived=true |
| status | running, message, log:[{time,message}], result? | session storage 的 UI 狀態，不能當伺服器的唯一證據 |

主版 `NativeClient.call(command,args,verifyHash=false)` 支援 `inspect/progress/open/preset/dispatch/boost`；以固定 func:nativeInPage 和純資料 args 注入 MAIN，錯誤由 __gtError envelope 回傳，避免注入 API 漏掉例外。不得加入任意字串 eval 或 page postMessage 執行入口。舊版仍使用 CDP Runtime.evaluate。

## 版本限定的原生橋接

Profile：`2.81.0_c2cae856e7`；wasmBytes `113960090`；SHA-256 `5f4dd34de793e3b0ff89c390c904dcc7622b394f20779ed70be1fa2c1f6d0667`。

| command／用途 | 遊戲原有方法 | slot／參數／native arity |
| --- | --- | --- |
| open | ResourcesInfoWindow.OnBtnCollection | 64689 / 1 / 3 |
| preset 清理 | SendtrooppanelWindow.ClearCommanderBtn | 111672 / 0 / 2 |
| preset 套用 | SendtrooppanelWindow.setPerInfoShow | 111569 / 3 / 5 |
| dispatch | SendtrooppanelWindow.OnClickGoBtnHandler | 111659 / 1 / 3 |
| boost | QueuePlugin.SendSpeedUpQueueRequest | 47986 / 3 / 5 |

以上是已驗證版本的描述，不是跨版本常數。類別 layout、type pointers 以 `native-profile.json` 為唯一機器可讀來源；各物件欄位偏移在 `native-page.mjs`。不額外複製一套可執行 profile 到文件。

改版研究先核對公開 build、WASM SHA、metadata/dump，再驗證 class name、method name、args、slot、arity 與欄位。先完成離線 fixture／唯讀狀態驗證，再依使用者授權測必要的原生動作。不要跳過 OnClickGoBtnHandler 的正常提示直接送內部 dispatch。

## 舊版與研究工具

舊版 background 同一 busy lock 管理座標、觀察、原生連線；controller 是可選 preset/boost 的 UI。observer 只接收 WS 與 Fetch/XHR，不攔截或重播；上限 8000 events、6MiB、10 分鐘，payload 256Ki 字元。

主版 scripting client 與舊版 CDP client 已不同；主版 native-page 多了 progress 和 transportEnvelope，profile 仍相同；native runner 的輪詢、倒數與停止提示也不同。修正共用橋接時同時評估兩份來源並跑兩組測試，不要求把不同產品行為強行統一。

研究腳本：analyze_traffic 讀取已錄製資料與 ProtoMember dump；inspect_native_build 解析 WASM 直接呼叫；extract_unity_webdata 提取已知 Unity archive；decode_buff_config／inspect_unity_bundles 依賴 UnityPy。probe_gtarcade 是歷史互動登入工具，含原始網路記錄與 URL 輸出，不屬於預設工作流。

主版 v1.2.0：以首次觀察的新 queue 為時間錨點，剩餘 = max(0, finish-start-speedupSeconds-單調經過毫秒/1000)。初次觀察前的通訊延遲未扣除，因此為保守估計，避免依賴電腦時鐘與未驗證的 server clock 位址。start/finish 必須維持相同且為有效整數；缺資料即停止，不猜時間。主版仍保留固定 boosts=0–2 的底層相容介面供既有測試，產品入口只使用 remainingSeconds=1；舊版助手完全未修改。

## v1.3.0 啟動模式

- Options 透過受限 runtime message 儲存 storage.local.activationMode；undefined/其他值均視為 manual。模式為 selection 才接受 autoRun，來源須同擴充功能、允許網域及目前啟用遊戲分頁。
- auto-trigger.js 在 Unity canvas 出現後向背景請求準備；connect 校驗版本，sender.documentId 必須等於唯一 Unity document。MAIN 的 nativeInPage watchSelection 只讀狀態，沒有封包或遊戲 mutation。開啟模式本身不觸發。
- 真實 pointerdown 在遊戲處理前同步讀取 selection；pointerup 拒絕超過 8px 的拖曳並建立一次性 gesture。selectionGesture 只接受兩秒內且未領取的點擊；selectedResource 最多等 1.5 秒、75ms 間隔，要求兩次相同新資源、無 blocking、未佔用、focus 保留。
- 每次開面板／preset／dispatch／boost 前再核對模式、焦點與 gestureId；新互動取消自動流程，不排隊。沿用 runOneClick／runNative 既有目標、版本與 queue 保護。manual 流程不依賴自動 watcher。
- autoDisable 移除該 sender document 的唯讀 watcher；content repair 會替換兩組監聽器。停止即保存 manual，也會取消目前自動操作。舊版助手不變。
- 實機 Unity 事件先後順序及 GUI 選取仍待實測；目前只有記憶體 fixture、VM 與 scripting mock 證據，不能視為完整已安裝 E2E。

### v1.3.1 自動啟動修正

- native client 新增 locate(profile)：只選定唯一 documentId。autoRun 先 locate、領取 gesture 並確認新資源，再 inspect(verifyHash=true)，最後才允許原生 mutation。手動 connect 仍直接完整校驗。避免先計算完整 WASM SHA 導致兩秒 gesture 過期，也避免不合格點擊重複計算 SHA。
- content script 初始化改為持續退避重試（最長 10 秒間隔），不在約一分鐘後靜默停用；避免重疊 prepare。Ready、初始化錯誤、選取結果與流程錯誤顯示於非互動 toast。autoRun 回應等待流程結果，不再只回 started 後忽略失敗。
- selection watcher 的 blur 只在 event.target===window 時 reset；捕獲到輸入框／canvas 的 element blur 不清除 gesture。焦點離開整個遊戲、拖曳、取消及新互動仍中止。
- selectedResource 保留拒絕條件，增加明確原因紀錄。沒有新完成點擊時重新準備監聽器，不重送舊點擊。

### v1.3.2 資源視窗生命週期

resource(allowPending=true) 僅在 selection 唯讀分支允許 ResourcesInfoParam 或 WorldMapObject 指標為零時回傳 pending，不當成空目標；非零但錯誤 class 仍立即拒絕。selectedResource 最多等五秒，仍需兩次穩定新目標；點擊前 pending 不足以證明新選取，要求重選。snapshot／inspect／selection 在出征面板可見時優先採用面板，不讀取可能已清空參數的舊資源視窗。watch 初始化使用 verify + SHA／QueuePlugin method 檢查，與資源面板就緒脫鉤；實際 open/preset/dispatch 的檢查保持嚴格。

## 2026-10-26 v1.4.0 ordinary player castle attacks

User reported v1.3.2 gathering works. Read-only live inspection and opening/closing the native attack setup identified CastleInfoWindow.Attack, slot 59850, args 0, wasm arity 2. No attack dispatch or speedup was sent. Matching offline dump: CastleInfoWindow m_param +56, isMySelf +64, warType +100, night +104; CastleInfoParam castleData +24, gridType +32 (OTHER_CASTLE=4), isCastle +36; WorldCastle Grid +8. Selected castle was ordinary, not self, no special war/night mode. Native setup yielded dType=2 (CASTLE), targetType=4, warType=0, isRts=0, EditArmy=0. QueueSubType live class and static fields at +40/+44 confirmed attack outbound=1/return=2 (type metadata 9150748); return never proves victory.

Added typed selection/open/preset/dispatch checks and shared preset1/speedup workflow. Castle selection waits for missing native parameters; unsupported targets fail closed. Original native Attack retains game eligibility checks and warnings, which automation does not dismiss. Four added regression tests cover attack method/slot, unsupported castle contexts, stable selection, and shared speedups without claiming battle success. 68 tests pass, 25 syntax files. Live end-to-end attack dispatch remains Not Run. Extension reload plus game refresh required. Legacy unchanged.

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

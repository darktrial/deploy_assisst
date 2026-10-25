# 架構、介面與資料流

## 初始化與入口

1. 根 `manifest.json` 啟用 module service worker `background.js`；F8 content script 在 game 與 logins-gotpc frame 的 document_start 載入。
2. `hotkey.js` 只處理 trusted、非 repeat、無 modifier、非 composition、非 DOM 輸入區的 F8，送 `hotkeyRun`。background 再核對 extension sender、frame origin、頂層 `/game` URL 與 active tab。
3. action／Alt+Shift+G 直接進 `start(tab)`。busy 鎖不排隊，status 存 session storage，成功／失敗後 detach debugger。分頁載入、離開、detach 或停止會設 cancelled。
4. `NativeClient.enable` 監聽 Runtime context 並遞迴附加 iframe。`connect` 選唯一包含 Unity Module 和 canvas 的 default context；先檢查 SHA-256。
5. `runOneClick` 固定第一組、最多兩個現有道具。`runNative` 先快照舊 queues、打開資源出征面板、套用預設、刷新 baseline、送一次出征；只採用目標吻合且 baseline 沒有的唯一新 queue。
6. 每次加速前確認 uid/marchId/target、subType=1 和庫存；送 count=1 後等待庫存下降且速度／行軍狀態更新。最後 `runOneClick` 只在同一隊伍 subType=7 時回傳抵達。

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

`NativeClient.call(command,args,verifyHash=false)` 支援 `inspect/open/preset/dispatch/boost`；只傳序列化純資料。程式文字來自固定 `nativeInPage.toString()`，不是來自頁面或訊息的任意 script。

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

主版與舊版 `native-client.mjs`／`native-page.mjs`／profile 目前相同；native runner 的倒數與停止提示不同。修正共用橋接時同時評估兩份來源並跑兩組測試，不要求把不同產品行為強行統一。

研究腳本：analyze_traffic 讀取已錄製資料與 ProtoMember dump；inspect_native_build 解析 WASM 直接呼叫；extract_unity_webdata 提取已知 Unity archive；decode_buff_config／inspect_unity_bundles 依賴 UnityPy。probe_gtarcade 是歷史互動登入工具，含原始網路記錄與 URL 輸出，不屬於預設工作流。

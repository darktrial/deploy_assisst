# 測試整合與證據邊界

## Node 測試矩陣

| 檔案 | 計數 | 主要場景／oracle |
| --- | --- | --- |
| activation.test.mjs | 8 | 模式預設／切換、真實點擊、重複／佔用／blocking／combat／focus／gesture 拒絕、穩定選取與取消 |
| activation-background.test.mjs | 1 | storage 保存、來源與 documentId、唯讀準備、一次出征、busy 鎖、stop 切手動 |
| hotkey.test.mjs | 4 | VM 執行真實 hotkey.js；訊息次數、preventDefault 次數；repeat／輸入／modifier／非 trusted 被忽略 |
| one-click.test.mjs | 8 | preset=1、一次 dispatch、超過兩次 boost、≤1 秒邊界、經過時間、無效時間、加速缺回應不重送、0/1 庫存、抵達 timeout、queue 消失、停止、busy、傳訊拒絕、僅修復監聽器 |
| native.test.mjs | 15 | 呼叫順序／不重送、唯一新 queue、目標／庫存／視窗、IL2CPP fixture、指紋／method 指標拒絕、scripting documentId／錯誤 envelope／progress |
| chrome-extension/core.test.mjs | 9（含子測試） | 校準、去敏感資訊、boost opt-in、座標、焦點、mouse release、detach |
| chrome-extension/observer.test.mjs | 9 | 脫敏、binary 選項、標記、子目標、HTTP body、容量與時間上限、停止與儲存失敗 |
| chrome-extension/native.test.mjs | 10 | 舊版 native runner 與同版記憶體／CDP fixture |

合計 68 項。數字是這次驗證快照，新增測項後以 Node 輸出為準；不以測試數量或文字覆蓋率代表完整產品正確性。

## Fixture 與限制

- 假時鐘：runner 依注入 `now/sleep` 推進；一次成功回應即可往下，主版不得引入固定啟動睡眠。超時測試觀察指令次數，不能只比對錯誤文字。
- IL2CPP fixture：獨立 ArrayBuffer、class/method metadata、dictionary/list、fn table，檢查實際原生參數；使用同一份 profile 是維護方便，但不構成真實遊戲版本的獨立 oracle。
- 主版 scripting mock：驗證唯一 Unity document、MAIN world、初始 hash、documentId 導航保護、錯誤 envelope 與不重送；不涵蓋真實 Chrome 權限或 frame 注入成功。
- 舊版 CDP mock：驗證 iframe session/context 路由與 Runtime.evaluate 邊界；不涵蓋 Chrome 真正的 debugger 權限、service worker suspend、實機 frame lifecycle。
- F8 VM：驗證處理規則，不涵蓋 Unity 自繪輸入框、瀏覽器焦點或擴充功能重新載入。
- UI smoke：research/observer_ui_smoke.py 使用隔離 headless Chrome 與本機 HTTP server，finally 關閉 driver/server；測舊版 controller，不會驗證真實伺服器回應。
- tools/verify.mjs 保存每個來源 SHA-256、命令和 exit code，執行實際來源而非複製來源；沒有隨機 seed，fake time 可重現。未提供全面 branch coverage 或 Chrome 125 真機矩陣。

## 實測層級

`research/capture/native-live-test-2026-10-25.json` 是既有 10:04 Asia/Taipei 原生入口實測：一次出征、兩個道具、庫存減二與行軍變採集。當時未驗證已安裝助手按鈕，不能作為本次 F8／工具列安裝流程的 E2E。

本次搬移只跑離線檢查；結果見 `../notes/verification.json` 與 `../notes/version_history.md`。實機驗證若尚未做，標示 Not Run，不根據 mock 宣稱已完成。重新載入擴充功能需改選新根目錄；F8 需要重新整理遊戲才能注入新版 content script。

## 回歸選擇

改主流程：跑主版 40 項。改橋接／profile：評估兩份 native 檔並跑兩組 native 測試及相關產品測試。改舊版 observer/controller：跑 observer/core 與隔離 smoke。搬檔／打包：完整 `node tools/verify.mjs`、Python 語法、ZIP 白名單與相對路徑檢查。已通過且沒有新改動／失敗時，不反覆重跑同一批測試。

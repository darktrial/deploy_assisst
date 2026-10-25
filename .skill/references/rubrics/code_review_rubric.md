# 審查 rubric

用於實際 code review 任務；本次文件建置沒有建立 review 基準。模板引用的中央 firmware 流程尚未提供，本地規則只定義證據品質，未授予自動合併或發佈權限。

- 嚴重度沿用模板 P0～P3，不另訂加權評分；分類為 Confirmed—Block、Confirmed—Non-blocking、Refuted、Unresolved；整體結論為 Block／Needs Verification／No Blocking Findings。
- 查核可達 caller、實際輸入、產生的影響與直接 consumer。單純風格或名字命中不是缺陷。
- 重點：新行軍關聯、重送／重入、停止生命週期、64 位精度、原生版本校驗、跨 frame sender/context、敏感資料、研究 parser 的輸入邊界，以及兩個助手副本的影響。
- 每項 finding 應有來源位置、具體觸發條件、預期／實際行為、影響、最小驗證。Mock 未覆蓋的實機行為明確列為待驗證。
- 正式來源、測試、範例、包裝腳本都在適用範圍；涉及 API／權限改動要查看 manifest 和訊息兩端。
- 若新增 review 歷史，記錄不可變 source/diff 快照或可取得 artifact＋SHA-256、檢查範圍／平台／版本、finding 分類、修正／反證與未做測試；只有 hash 而無來源不足以建立有效基準。
- Node 測試成功不代表 Coverity、全面安全審查或已安裝 extension E2E 成功。必要驗證未完成時保留待完成狀態，不推進有效基準。

# 技能套件設計

此套件依使用者提供的 [module-skill-template v3.0.0](references/templates/module-skill-template.md) 建立。模板 metadata 標示 CC-BY-4.0，原文保留；本專案調整見下表。`.skill` 是本專案要求的位置，由 `AGENTS.md` 明確導航，不宣稱已安裝為全域可自動發現的技能。

| 模板輸出順序 | 實際文件／決策 |
| --- | --- |
| 1 Metadata & Summary | SKILL.md YAML；需要檔案讀寫、Node/Python/PowerShell，無外部 credential |
| 2 Architecture & Pattern | Pipeline + Tool Wrapper + 文件 Generator；Reviewer 按任務使用 |
| 3 Folder Structure | 下方結構；manifest.json 為可驗證的資源索引 |
| 4 SKILL.md | 保留模板 10 個必要章節，縮短核心、細節按需載入 |
| 5 Gating & Error Handling | SKILL.md 第 7/9 節、rules/error_handling.md；無 gating.json consumer |
| 6 Supporting Files | architecture/build/testing/safety/graphify、review rubric、change-report 模板；不造無 consumer 的 schema |
| 7 Graphify | 本機 0.9.95 AST 建圖與查詢，無 LLM 語義分析 |
| 8 Build & Environment | 原生 MV3 + Node 驗證 + Python ZIP；C/C++/Conan/韌體規範不適用 |
| 9 Test Integration | 主版 24 + 舊版 28 項；fixtures、oracle、實機缺口分開記錄 |
| 10 Safety | 依實際 JS/Python 資料流與生命週期判定；Coverity Not Run |

```text
.skill/
  SKILL.md / README.md / manifest.json
  rules/error_handling.md
  references/architecture.md / build-environment.md / testing.md
  references/safety.md / graphify.md
  references/rubrics/code_review_rubric.md
  references/templates/change-report.md / module-skill-template.md
  scripts/graphify.ps1 / resources.py
  notes/version_history.md / migration-source-hashes.json
  notes/verification.json / graph-query.txt / graph-path.txt / graph-explain.txt
```

只有核心 SKILL.md 必載；其他項目均依任務載入。索引以非 ASCII 字元約 1 token、ASCII 約 4 字元/token 估算，供載入預算使用，非模型 tokenizer 精確計費。`scripts/resources.py` 是索引的產生器與驗證 consumer，確認資源存在、估計量及載入條件一致。驗證紀錄與圖譜查詢只在核對證據時讀取。

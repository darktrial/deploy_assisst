# 建置與環境

所有命令從 `<repo-root>`（deploy_assisst）執行，勿再使用舊的 chrome-one-click 路徑。實際測試環境是 Windows、PowerShell、Node 22.14.0、Python 3.11.5；Chrome 最低版本 125 由兩份 manifest 宣告。

## 必要與選用依賴

| 用途 | 依賴／解析方式 |
| --- | --- |
| 擴充功能 | Chrome API、瀏覽器原生 ESM；無 runtime npm dependency |
| 單元測試／語法 | PATH 上 node；node:test、assert/strict、vm 等內建模組 |
| 打包／資源索引 | PATH 上 Python 3；標準函式庫 |
| Graphify | graphifyy 0.9.95，使用工作區提供的本機原始碼安裝到隔離 venv |
| 離線 Unity 研究／UI smoke | UnityPy／Selenium；research/environment.py 載入 GT_RESEARCH_DEPS，未指定時找 `<repo-root>/../.codexdeps` |
| Chrome smoke binary | observer_ui_smoke.py 目前使用 Windows 預設 Chrome 安裝位置；換平台需調整或提供對應 binary |

沒有 headers、linker libraries、Conan、config.mk、交叉編譯環境、GoogleTest 或 CI pipeline。模板提及的 firmware 中央規範未提供，不當作隱含依賴。

## 本機命令

```powershell
node tools/verify.mjs
python tools/package.py
python .skill/scripts/resources.py --write
python .skill/scripts/resources.py
```

驗證腳本逐一 `node --check` 並執行兩版測試；證據含 source hash。打包腳本只取明確的 runtime 白名單與 README，ZIP 根層必有 manifest。主版 11 檔、舊版 13 檔；測試、研究、技能文件與原始錄製不進包。

## Graphify 安裝與可攜設定

本次套件來源是 `<repo-root>/../graphifyy-0.9.95/graphifyy-0.9.95`，外層目錄只是解壓縮容器。已建立的環境位於 `<repo-root>/../.codexdeps/graphify-venv`；沒有全域 skill/hook 安裝。

重新建立環境時：

```powershell
python -m venv ../.codexdeps/graphify-venv
& ../.codexdeps/graphify-venv/Scripts/python.exe -m pip install ../graphifyy-0.9.95/graphifyy-0.9.95
.\.skill\scripts\graphify.ps1 -Action Build
```

在其他環境，以 `$env:GRAPHIFY_PYTHON` 指向已安裝 graphifyy 0.9.95 的 Python 可執行檔；研究第三方依賴則使用 `$env:GT_RESEARCH_DEPS` 指向該套件資料夾。兩個變數為工具路徑，不是 credential，不需要讀取或輸出其他環境變數。

Graphify 建圖參數固定 `--code-only --no-cluster --force --max-workers 2`，再用 `cluster-only --no-label --no-viz`。無 LLM API key、無遠端語義抽取；套件安裝可能下載 Python 依賴。詳見 graphify.md。

## 可選驗證

```powershell
python research/observer_ui_smoke.py
python research/analyze_traffic.py research/capture/original/gt-traffic-2026-10-25T01-30-01-679Z.json --output research/capture/traffic-analysis-migration.json
```

UI smoke 使用獨立 headless profile 與 mock API；缺 Selenium／Chrome／driver 時記錄缺項，不改連使用者已登入的 profile。原始 capture 與 dump 不在可攜 ZIP 內，離線分析需要本機保留的檔案。

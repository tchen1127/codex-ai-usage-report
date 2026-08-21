---
name: codex-ai-usage-report
description: 只在 Codex 內執行，自動分析指定日期區間的本機 Codex 與可讀取的 Google Antigravity 工作紀錄，整合 Token、AI 工作紀錄、專案群組、使用天數、活躍互動、工作分類、Skill、AI Value 與個人化觀察，並產生固定兩頁研發部 PowerPoint。Antigravity 只作為唯讀資料來源，不得在 Antigravity 內安裝或執行本 Skill。
---

# Codex＋Antigravity AI 使用報告

## 建議模型

- 預設：`gpt-5.6-terra`，推理等級：`中`。
- 適用於本機 session 歸類、專案分群、AI Value／綜合觀察、兩頁 PowerPoint 產生與驗證之間的日常平衡。
- 遇到資料來源混雜、需逐筆人工級判讀，或連續處理複雜版面問題時，才提高推理等級；一般同仁批次產報告不必預設使用更高等級。

本 Skill 只由 Codex 執行。Codex 以本機 Codex session 為主力來源，並在可讀取時唯讀納入 Google Antigravity 備援工作紀錄，自動完成固定兩頁研發報告。Antigravity 不是本 Skill 的執行環境。

## 輸入合約

- 只要求四項：英文姓名、中文姓名、統計起日、統計迄日。
- 使用者已提供部分資料時，只補問缺少的欄位；不要重問已提供內容。
- 不要求同仁手填 Token、專案、工作摘要、Skill、時數或 AI Value 事例。
- 完成本機紀錄分析與 AI 綜合應用觀察後、產生最終 PPT 前，執行 [collect_self_rating.ps1](scripts/collect_self_rating.ps1) 顯示單一 Windows 視窗，一次收集「任務推進、品質與查核、可複用成果、風險辨識、工作效率提升」五項同仁自評。
- 視窗必須顯示五項面向說明與 `1–5／N/A` 等級定義；每項使用鎖定式下拉選單，只能選擇，不得輸入文字、按鍵代碼、評語或工作事例。所有項目選完後才可確認。
- 顯示自評視窗前，不得先顯示 AI 證據評分或 AI 綜合應用觀察，以降低錨定影響。若 Windows Forms 確實無法啟動，才退回為一則訊息一次列出相同說明並收集五項分數，不可改成逐題詢問。
- 日期接受 `YYYY/MM/DD` 或 `YYYY-MM-DD`，首尾日都納入；時區固定 `Asia/Taipei`，部門固定 `研發部`。
- 固定只分析本機 Codex session，以及目前 Windows 使用者存在時的 `%USERPROFILE%/.gemini/antigravity`；排除 ChatGPT/GPT 聊天與非工作使用。
- 預設只分析目前 Windows 使用者的 `%USERPROFILE%/.codex`、目前生效的 `CODEX_HOME` 與 `%USERPROFILE%/.gemini/antigravity`；不得自動掃描其他 Windows 使用者資料夾。
- 同一位員工的個人電腦與 Windows 帳號內，即使曾使用多個 Codex 登入帳號，也合併為同一份員工報告；不作帳號別拆分。Token 代表這位員工在本機資料範圍內的合計，不代表單一訂閱帳號的帳單或額度。
- 只有在 Windows 帳號或 `.codex` 曾由不同人共用時，才停止自動報告並要求隔離資料來源，避免混入其他員工紀錄。

## 必讀規範

在分析或產生 PPT 前，完整讀取 [report-standard.md](references/report-standard.md) 與 [comprehensive-observation.md](references/comprehensive-observation.md)。Antigravity 存在或使用者要求整合時，再完整讀取 [antigravity-integration.md](references/antigravity-integration.md)。使用 [rd-codex-ai-usage-report-template.pptx](assets/rd-codex-ai-usage-report-template.pptx) 作為唯一版型來源。

## 工作流程

1. 建立任務專用工作目錄，將所有中間 JSON、預覽圖與驗證結果留在該目錄；最終只交付 PPT。
2. 使用 `codex_app__load_workspace_dependencies` 取得 bundled Node、Python 與 `RUNTIME_NODE_MODULES`。
3. 執行 [extract_codex_usage.mjs](scripts/extract_codex_usage.mjs)，掃描 `%USERPROFILE%/.codex/sessions` 與存在時的 `%USERPROFILE%/.codex/archived_sessions`，並產生 Codex evidence JSON。
4. Codex 檢查 `%USERPROFILE%/.gemini/antigravity/conversations` 與 `brain`。兩者存在時，由 Codex 使用 bundled Python 執行 [extract_antigravity_usage.py](scripts/extract_antigravity_usage.py)，產生 Antigravity evidence JSON 與 TSV 索引；不存在時維持 Codex-only，不把缺少備援來源視為失敗。
5. 依兩份 evidence 逐筆判斷工作相關性，排除內部 companion、重複與非工作紀錄，分別建立只含 session ID 的 included JSON。明確是同一工作在兩平台間的連續交接且沒有獨立成果時只計一次；其餘實際除錯、重構或交付仍各自保留。
6. 執行 [summarize_usage_sources.py](scripts/summarize_usage_sources.py) 合併工作紀錄數、Token、使用日與跨平台活躍區段；再依案名、產品線與交付目標重算專案群組、分類及 Skill。
7. 依規範為五個 AI Value 面向建立保守的「AI 證據評分」，並依六個觀察面向先建立個人化 `aiComprehensiveObservation`。平台角色與額度切換本身不構成加分證據。
8. 執行 `pwsh -NoProfile -File scripts/collect_self_rating.ps1 -OutputPath <工作目錄>/self-rating.json`。同仁確認後，才把五項 `selfScore` 合併進 `report-data.json`；取消視窗時停止產生最終 PPT，不可自行代填。
9. 依規範建立完整 `report-data.json`；加入 `sources`、`platformLabel`、`tokenDisplayNote` 與 `tokenMethodSummary`。所有數量、評分與觀察都必須能回溯到納入的 session。
10. 執行 [build_report.mjs](scripts/build_report.mjs)，只替換模板既有文字、表格、圖表資料與 Speaker Notes；不得新增、刪除或移動主要物件。
11. 執行 [validate_report.mjs](scripts/validate_report.mjs)，再逐頁檢視 builder 產生的 PNG。優先自動修正溢出與明顯版面問題。
12. 將最終檔名設為 `AI_Usage_Report_<English_Name>_<Start_YYYYMMDD>_<End_YYYYMMDD>.pptx` 並交付。

## 執行環境與雙 AI 自動判定

- 本 Skill 只能在 Codex 執行；不得複製、安裝或呼叫於 `%USERPROFILE%/.gemini/antigravity/skills`。
- 原因是完整流程依賴 Codex 的 `codex_app__load_workspace_dependencies`、bundled Node／Python、`RUNTIME_NODE_MODULES`、PowerPoint artifact runtime、驗證工具與 Windows 自評流程；Antigravity 不保證提供這些指令與 runtime，執行可能中途失敗或產出不完整。
- 若在 Antigravity 環境收到執行本 Skill 的要求，必須停止並請使用者回到 Codex 執行，不得略過不支援的步驟或產生未驗證報告。
- Antigravity 僅是 Codex 唯讀擷取的第二份本機資料來源，不需要也不允許 Antigravity 執行本 Skill、匯出 evidence 或產生 PPT。
- `conversations` 或 `brain` 不存在時，報告固定為 Codex-only。
- 兩者存在但統計期間內沒有通過工作相關性篩選的 Antigravity session 時，仍固定為 Codex-only。
- 只有至少一筆 Antigravity session 通過日期、資料完整性、工作相關性與去重檢查時，才建立 Antigravity source 並顯示 `Codex＋Antigravity`。
- 不以第三方工具登入、呼叫或繞過 Antigravity 配額；只讀取本機已存在的 conversation database 與 brain transcript。

## 彈性與一致性

- 固定：兩頁、16:9、主要區塊、配色、圓餅圖、專案表格、Skill 卡片及 AI Value 卡片。
- 彈性：專案數、摘要密度、Skill 有無、文字換行、小幅縮字與低樣本提示。
- `10` 筆以上使用一般版；`1–9` 筆使用起步版並標示「樣本累積中」；`0` 筆仍產生兩頁並如實顯示無紀錄與「資料累積中」。
- AI Value 固定顯示五個面向的「AI 證據評分／同仁自評」，兩欄皆只使用 `1–5` 或 `N/A`；低樣本或證據不足使用 `N/A`，不顯示低價值。
- 第二頁固定顯示 `AI 綜合應用觀察`，以跨平台量化資料與實際工作證據產生個人化短評；不得因切換平台、配額或 Token 增加而自動調高評分。
- 發現小幅樣式差異時先自動修正；無法完全修正仍交付並簡短提醒。
- 只有來源資料無法讀取、PPT 缺頁／損壞或必要物件遺失才停止。

## 評估定位

- 報告記錄 AI 對工作的實際助益，可作為個人績效與考核的參考之一。
- 不建立員工排名，也不把 Token、使用天數或紀錄數直接等同績效。
- AI 證據評分與同仁自評分開顯示、分開計算平均，不得混成單一總分；`N/A` 不納入平均。
- 解讀 AI Value 時同時考量職務內容、實際成果、首次使用日期與證據量；不得只用單一分數判定。工作效率提升若沒有可靠前後工時，不得換算節省時數或效率百分比。
- Token 含 Codex Cached Input 與 Antigravity Cache Read；Antigravity thinking／response 是 output 子集，不得重複加總。Token 只供部門額度與資源規劃，不代表帳單金額或正式工時。

## 隱私與交付

- 投影片只放彙總數字與工作摘要，不放原始 prompt、session 路徑、Antigravity database／brain 路徑、私人內容或敏感資訊。
- 中間 evidence JSON 可能含截短的工作提示，只能留在本機任務工作目錄，不得附在分享包或 Email。
- Speaker Notes 要記錄統計定義、低樣本狀態、資料來源類型與評估限制。
- 最終回覆需列出 PPT 路徑、統計期間、一般／起步／無資料狀態，以及是否有柔性驗證提醒。

---
name: codex-ai-usage-report
description: 自動分析指定日期區間的本機 Codex 工作 session，整理工作相關 Token、AI 工作紀錄、專案群組、使用天數、活躍互動估計、工作分類、Skill 頻率、AI Value 與個人化 AI 綜合應用觀察，並用固定兩頁研發部 PowerPoint 模板產生可彙整報告。當使用者要求建立、更新、重做或驗證個人／員工 Codex AI 使用報告、兩頁 AI 報告、AI 工作助益報告，或提供中英文姓名與日期並要求自動完成報告時使用。
---

# Codex AI 使用報告

## 建議模型

- 預設：`gpt-5.6-terra`，推理等級：`中`。
- 適用於本機 session 歸類、專案分群、AI Value／綜合觀察、兩頁 PowerPoint 產生與驗證之間的日常平衡。
- 遇到資料來源混雜、需逐筆人工級判讀，或連續處理複雜版面問題時，才提高推理等級；一般同仁批次產報告不必預設使用更高等級。

以本機 Codex 紀錄為證據，自動完成固定兩頁研發報告。保持版型一致，但允許內容依一般、起步或無資料狀態彈性呈現。

## 輸入合約

- 只要求四項：英文姓名、中文姓名、統計起日、統計迄日。
- 使用者已提供部分資料時，只補問缺少的欄位；不要重問已提供內容。
- 不要求同仁手填 Token、專案、工作摘要、Skill、時數或 AI Value 事例。
- 完成本機紀錄分析與 AI 綜合應用觀察後、產生最終 PPT 前，執行 [collect_self_rating.ps1](scripts/collect_self_rating.ps1) 顯示單一 Windows 視窗，一次收集「任務推進、品質與查核、可複用成果、風險辨識、工作效率提升」五項同仁自評。
- 視窗必須顯示五項面向說明與 `1–5／N/A` 等級定義；每項使用鎖定式下拉選單，只能選擇，不得輸入文字、按鍵代碼、評語或工作事例。所有項目選完後才可確認。
- 顯示自評視窗前，不得先顯示 AI 證據評分或 AI 綜合應用觀察，以降低錨定影響。若 Windows Forms 確實無法啟動，才退回為一則訊息一次列出相同說明並收集五項分數，不可改成逐題詢問。
- 日期接受 `YYYY/MM/DD` 或 `YYYY-MM-DD`，首尾日都納入；時區固定 `Asia/Taipei`，部門固定 `研發部`。
- 固定只分析本機 Codex session；排除 ChatGPT/GPT 聊天與非工作使用。
- 預設只分析目前 Windows 使用者的 `%USERPROFILE%/.codex`，或目前生效的 `CODEX_HOME`；不得自動掃描其他 Windows 使用者資料夾。
- 同一位員工的個人電腦與 Windows 帳號內，即使曾使用多個 Codex 登入帳號，也合併為同一份員工報告；不作帳號別拆分。Token 代表這位員工在本機資料範圍內的合計，不代表單一訂閱帳號的帳單或額度。
- 只有在 Windows 帳號或 `.codex` 曾由不同人共用時，才停止自動報告並要求隔離資料來源，避免混入其他員工紀錄。

## 必讀規範

在分析或產生 PPT 前，完整讀取 [report-standard.md](references/report-standard.md) 與 [comprehensive-observation.md](references/comprehensive-observation.md)。使用 [rd-codex-ai-usage-report-template.pptx](assets/rd-codex-ai-usage-report-template.pptx) 作為唯一版型來源。

## 工作流程

1. 建立任務專用工作目錄，將所有中間 JSON、預覽圖與驗證結果留在該目錄；最終只交付 PPT。
2. 使用 `codex_app__load_workspace_dependencies` 取得 bundled Node、Python 與 `RUNTIME_NODE_MODULES`。
3. 執行 [extract_codex_usage.mjs](scripts/extract_codex_usage.mjs)，掃描 `%USERPROFILE%/.codex/sessions` 與存在時的 `%USERPROFILE%/.codex/archived_sessions`，並產生 evidence JSON。不得使用網路、ChatGPT 歷史或其他員工資料補足內容。
4. 依 evidence JSON 逐筆判斷工作相關性，排除內部 companion、重複與非工作紀錄；將同案名、產品線或明確相同交付目標合併為專案群組。
5. 依規範為五個 AI Value 面向建立保守的「AI 證據評分」，並依六個觀察面向先建立個人化 `aiComprehensiveObservation`。這兩項都只依本機 session 證據產生。
6. 執行 `pwsh -NoProfile -File scripts/collect_self_rating.ps1 -OutputPath <工作目錄>/self-rating.json`。同仁確認後，才把五項 `selfScore` 合併進 `report-data.json`；取消視窗時停止產生最終 PPT，不可自行代填。
7. 依規範建立完整 `report-data.json`；所有 AI 數量、評分與觀察都必須能回溯到納入的 session，不得為填滿版面虛構專案、Skill、成果、效率提升、風險或 AI Value 證據。
8. 執行 [build_report.mjs](scripts/build_report.mjs)，只替換模板既有文字、表格、圖表資料與 Speaker Notes；不得新增、刪除或移動主要物件。
9. 執行 [validate_report.mjs](scripts/validate_report.mjs)，再逐頁檢視 builder 產生的 PNG。優先自動修正溢出與明顯版面問題。
10. 將最終檔名設為 `AI_Usage_Report_<English_Name>_<Start_YYYYMMDD>_<End_YYYYMMDD>.pptx` 並交付。

## 彈性與一致性

- 固定：兩頁、16:9、主要區塊、配色、圓餅圖、專案表格、Skill 卡片及 AI Value 卡片。
- 彈性：專案數、摘要密度、Skill 有無、文字換行、小幅縮字與低樣本提示。
- `10` 筆以上使用一般版；`1–9` 筆使用起步版並標示「樣本累積中」；`0` 筆仍產生兩頁並如實顯示無紀錄與「資料累積中」。
- AI Value 固定顯示五個面向的「AI 證據評分／同仁自評」，兩欄皆只使用 `1–5` 或 `N/A`；低樣本或證據不足使用 `N/A`，不顯示低價值。
- 第二頁固定顯示 `AI 綜合應用觀察`，以量化資料與實際工作證據產生個人化短評；不得使用制式罐頭句、性格推論、排名、虛構 ROI 或沒有依據的節省工時。
- 發現小幅樣式差異時先自動修正；無法完全修正仍交付並簡短提醒。
- 只有來源資料無法讀取、PPT 缺頁／損壞或必要物件遺失才停止。

## 評估定位

- 報告記錄 AI 對工作的實際助益，可作為個人績效與考核的參考之一。
- 不建立員工排名，也不把 Token、使用天數或紀錄數直接等同績效。
- AI 證據評分與同仁自評分開顯示、分開計算平均，不得混成單一總分；`N/A` 不納入平均。
- 解讀 AI Value 時同時考量職務內容、實際成果、首次使用日期與證據量；不得只用單一分數判定。工作效率提升若沒有可靠前後工時，不得換算節省時數或效率百分比。
- Token 含 Cached Input，供部門額度與資源規劃，不代表帳單金額或正式工時。

## 隱私與交付

- 投影片只放彙總數字與工作摘要，不放原始 prompt、session 路徑、私人內容或敏感資訊。
- 中間 evidence JSON 可能含截短的工作提示，只能留在本機任務工作目錄，不得附在分享包或 Email。
- Speaker Notes 要記錄統計定義、低樣本狀態、資料來源類型與評估限制。
- 最終回覆需列出 PPT 路徑、統計期間、一般／起步／無資料狀態，以及是否有柔性驗證提醒。

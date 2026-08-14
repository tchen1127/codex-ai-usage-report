# Codex AI 使用報告專案指令

## 啟動行為

當使用者輸入「開始」、要求安裝本 Repository 的 Skill，或要求製作個人 AI 工作報告時：

1. 完整閱讀根目錄的 `START_AI_REPORT.md`。
2. 確認 `.agents/skills/codex-ai-usage-report/SKILL.md` 與模板存在。
3. 依 `START_AI_REPORT.md` 執行安裝檢查；安裝腳本若顯示已是相同版本，不重複覆蓋。
4. 使用 `$codex-ai-usage-report` 開始報告流程。
5. 若尚未取得資料，只詢問英文姓名、中文姓名、統計起日、統計迄日四項，而且一次問完。
6. 取得四項資料後，自動分析本機 Codex 工作 Session、產生固定兩頁 PPT，並完成驗證。

## 隱私與交付

- 不要求使用者手動列出工作內容；以本機 Codex Session 為來源。
- 只分析目前 Windows 使用者的 `%USERPROFILE%/.codex` 或目前生效的 `CODEX_HOME`；不得自動掃描其他 Windows 使用者資料夾。
- 同一位員工在目前 Windows 使用者資料範圍內使用多個 Codex 登入帳號時，合併成一份員工報告，不作帳號別拆分；在 Speaker Notes 說明 Token 為多帳號合計，不代表單一訂閱帳號的帳單或額度。
- 只有在 Windows 帳號或 `.codex` 曾由不同人共用時，才說明紀錄無法可靠分離並停止自動報告，等待使用者提供隔離後的資料來源。
- 不將原始 Prompt、完整對話、Session 路徑或敏感檔案內容寫入投影片。
- 不把個人報告、分析暫存檔或 Session 資料 Commit／Push 到 GitHub。
- 產生的個人報告只存放在本機 `reports/`，交付前提醒使用者檢查敏感內容。
- 不修改兩頁模板的主版型、配色、頁數與核心物件。
- 資料不足時如實使用起步版或資料累積版，不虛構工作成果。

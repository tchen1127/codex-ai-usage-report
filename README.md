# Codex AI 使用報告

使用本機 Codex 工作紀錄，自動產生格式一致的兩頁 AI 工作報告。

本 Repository 只包含通用 Skill、空白 PowerPoint 模板與啟動工具，不包含任何員工個人範例、Token 數字、客戶名稱、公司專案名稱、原始 Prompt 或 Codex Session。

## 最簡單的使用方式

1. 從 GitHub 選擇 **Code → Download ZIP**。
2. 解壓縮到一個新的資料夾。
3. 用 Codex 開啟該資料夾。
4. 在新的 Codex Task 輸入：

   ```text
   開始
   ```

Codex 會自動讀取根目錄的 `AGENTS.md`，使用 Repository 內的 `.agents/skills/codex-ai-usage-report`，並詢問：

- 英文姓名
- 中文姓名
- 統計起日
- 統計迄日

不需要手動整理工作項目或修改 PowerPoint 版型。

也可以直接輸入：

```text
請讀取 START_AI_REPORT.md，安裝 Skill 並開始製作我的 AI 工作報告。
```

## 為什麼下載後就能使用

Codex 會自動尋找 Repository 內的 `.agents/skills`，因此開啟本資料夾後，報告 Skill 已可在此專案使用。`START_AI_REPORT.md` 也可讓 Codex 將 Skill 安裝到個人的 `%USERPROFILE%\.agents\skills`，供其他專案使用。

若個人目錄已有不同版本，安裝腳本會先備份到 `%USERPROFILE%\.agents\skill-backups`，不會直接刪除舊版本。

## 報告原則

- 固定兩頁、固定風格，方便研發部門彙整。
- 只分析指定日期區間內、判定為工作相關的本機 Codex Session。
- 排除 ChatGPT／GPT 聊天與非工作內容。
- 使用紀錄較少或沒有資料時，使用「樣本累積中」或「資料累積中」，不虛構內容。
- 不建立員工排名；Token 或使用量不作為單一績效判定。
- 原始 Prompt、Session 路徑與完整對話不會寫入投影片。

## 隱私提醒

本 Repository 本身不含員工資料。執行 Skill 後產生的報告屬於個人工作資料，請先檢查內容再交付；不要把 `reports/` 內的個人報告 Commit 或 Push 到 GitHub。

Skill 預設只讀取目前 Windows 使用者的 `%USERPROFILE%\.codex`，或目前生效的 `CODEX_HOME`，不會自動掃描其他 Windows 使用者。同一位員工即使在這個資料範圍內使用多個 Codex 登入帳號，也會合併成一份員工報告，不作帳號別拆分；Token 是合計值，不代表單一訂閱帳號的帳單或額度。只有在 Windows 帳號或 `.codex` 曾由不同人共用時，才應停止並改用隔離的 Windows 使用者或 `CODEX_HOME`。

## 主要檔案

- `START_AI_REPORT.md`：給 Codex 閱讀並執行的啟動檔。
- `.agents/skills/codex-ai-usage-report/`：完整報告 Skill。
- `template/RD_Codex_AI_Usage_Report_2Page_Template.pptx`：空白兩頁模板。
- `scripts/install-skill.ps1`：可重複執行、會保留舊版備份的安裝腳本。

## 官方參考

- [OpenAI：Codex Skills](https://learn.chatgpt.com/docs/build-skills)
- [OpenAI：AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)

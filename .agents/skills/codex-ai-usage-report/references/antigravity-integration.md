# Google Antigravity 整合規範

## 定位

本報告 Skill 只能在 Codex 執行，不得安裝、複製或呼叫於 Google Antigravity。Codex 是唯一報告執行器；Antigravity 只作為備援工作平台與第二份唯讀本機證據來源。平台角色只用於說明工作流程，不得因主力／備援、方案或額度刷新方式影響 AI 證據分數。

這是執行環境相容性限制：報告流程需要 Codex 的 workspace dependency loader、bundled Node／Python、`RUNTIME_NODE_MODULES`、PowerPoint artifact import／render／inspect、驗證器及 PowerShell 自評流程。Antigravity 不保證具有相同工具與指令，不能以省略步驟、替代未驗證工具或只產生部分 evidence 的方式執行本 Skill。若請求從 Antigravity 發起，應停止並改由 Codex 執行完整流程。

Antigravity 方案、模型、額度與刷新週期可能變動；報告 Skill 不推論帳號方案，也不把固定刷新時間寫入評估。若使用者詢問目前額度，應以 Antigravity 當下的 Usage／Quota 畫面或官方文件為準，不能由本機 Token 遙測反推剩餘額度。

## 本機來源

預設根目錄：`%USERPROFILE%/.gemini/antigravity`

- `conversations/*.db`：每個 conversation 的 SQLite database；`gen_metadata.data` 內含 protobuf 編碼的 ModelUsageStats。
- `brain/<session-id>/.system_generated/logs/transcript.jsonl`：使用者輸入、工具呼叫、路徑與活動時間證據。
- 某些版本可能使用 `brain/<session-id>/.system_generated/transcript.jsonl`；擷取器會依序檢查兩個位置。

只有 Codex 執行的本 Skill 可以對上述來源使用 SQLite read-only 連線與檔案讀取。不得要求 Antigravity 執行本 Skill，也不得修改、壓縮、刪除或搬移 Antigravity 原始資料。

## 雙 AI 自動判定

Codex 依下列順序判定資料來源，不依 Antigravity 是否已安裝本 Skill：

1. `conversations` 或 `brain` 不存在：Codex-only。
2. 兩者存在，但日期區間內沒有可讀 session：Codex-only。
3. 有候選 session，但全部是私人、一般聊天、用量查詢、重複或非工作內容：Codex-only。
4. 至少一筆 session 通過日期、database 解碼、工作相關性與去重檢查：Codex＋Antigravity。

Antigravity 應用程式存在或曾登入，不足以判定為雙 AI 使用；必須有納入報告的工作證據。

## 擷取

由 Codex 使用 bundled Python：

```powershell
& $RUNTIME_PYTHON scripts/extract_antigravity_usage.py `
  --start 2026-01-01 `
  --end 2026-01-31 `
  --output <workdir>/antigravity-evidence.json `
  --index <workdir>/antigravity-session-index.tsv
```

擷取器只建立候選 evidence，不自行判定工作績效或工作相關性。逐筆閱讀 `userInputs`、`cwdValues`、`pathHints`、`toolNames` 與實際成果後，建立：

```json
{
  "includedSessionIds": ["session-id-1", "session-id-2"]
}
```

用量／查額度、一般聊天、私人內容、沒有工作成果的產品設定詢問，以及嘗試在 Antigravity 安裝或呼叫本報告 Skill，預設排除。Antigravity 中實際完成的除錯、重構、自動化或文件工作，才可依成果納入。

## Token 定義

Antigravity ModelUsageStats 欄位：

- `inputTokens`
- `outputTokens`
- `cacheWriteTokens`
- `cacheReadTokens`
- `thinkingOutputTokens`
- `responseOutputTokens`

總量固定驗證：

```text
totalTokens = inputTokens + outputTokens + cacheWriteTokens + cacheReadTokens
outputTokens = thinkingOutputTokens + responseOutputTokens
```

`thinkingOutputTokens` 與 `responseOutputTokens` 是 `outputTokens` 子集，不能再加到 total。若任一等式不成立、`decodedCount < rowCount`、database read error，或 session 跨越統計邊界，先標示限制並人工確認，不得將不可靠 Token 寫成精確事實。

## 合併

Codex 分別為 Codex 與 Antigravity evidence 建立 included JSON 後執行：

```powershell
& $RUNTIME_PYTHON scripts/summarize_usage_sources.py `
  --start 2026-01-01 `
  --end 2026-01-31 `
  --codex-evidence <workdir>/codex-evidence.json `
  --codex-included <workdir>/codex-included.json `
  --antigravity-evidence <workdir>/antigravity-evidence.json `
  --antigravity-included <workdir>/antigravity-included.json `
  --output <workdir>/usage-source-summary.json
```

- AI 工作紀錄：兩平台納入工作之和；明確是同一任務的無成果交接才去重。
- 使用天數：兩平台 `activeDates` 聯集。
- 活躍互動：有 `activeSegments` 時取跨平台區段聯集，重疊只計一次；舊 evidence 缺少區段時才退回加總並在限制中說明。
- 專案群組與工作分類：必須重新依所有納入 session 判讀，不可直接把兩份「其他」列相加。
- Skill 覆蓋率：本報告 Skill 只在 Codex 執行；Antigravity 來源不得把 `codex-ai-usage-report` 計為 Skill 使用。其他 Skill 也只有明確 `$skill-name`、`SKILL.md` 或實際 Skill 路徑證據才計入。

## report-data.json

整合版保留 `schemaVersion: "2.0"`，新增可選欄位：

```json
{
  "platformLabel": "Codex＋Antigravity",
  "tokenDisplayNote": "含 Cached Input／Cache Read｜額度規劃依據",
  "tokenMethodSummary": "Antigravity thinking／response 為 output 子集，未重複加總。",
  "sources": [
    {
      "id": "codex",
      "label": "Codex",
      "role": "primary",
      "workRecordCount": 10,
      "tokens": { "totalTokens": 1000 }
    },
    {
      "id": "antigravity",
      "label": "Antigravity",
      "role": "backup",
      "workRecordCount": 3,
      "tokens": { "totalTokens": 300 }
    }
  ]
}
```

`sources[].workRecordCount` 與 `sources[].tokens.totalTokens` 必須分別加總等於合併 metrics。Speaker Notes 記錄各平台數量、Token 定義、跨平台去重、活躍時間算法與限制。

## 評語與建議

若證據顯示兩平台分工，評語可描述 Antigravity 補強的除錯、重構、自動化或文件工作，以及 Codex 與 Antigravity 共同形成的可追溯成果。不得只因 Token 或平台數增加就上調 AI Value。

跨平台改善建議優先考慮：共用專案標籤、成果回寫、測試／採用／量產結果，以及避免同一任務重複統計。不得建議將本報告 Skill 安裝到 Antigravity；只有 evidence 確實呈現這些缺口時才使用。

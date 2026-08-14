# 研發部 Codex AI 使用報告規範 v1

## 固定設定

- 統計期間：由使用者提供起日與迄日，含首尾日；部門彙整時全員必須使用相同區間
- 時區：Asia/Taipei
- 部門：研發部
- 來源：該員工本機 Codex session
- 排除：ChatGPT/GPT 聊天、內部 companion、重複任務、非工作內容
- 輸出：固定兩頁、16:9、使用 `assets/rd-codex-ai-usage-report-template.pptx`

## 指標定義

### AI 工作紀錄

1 筆＝1 筆去重後、與工作相關的 Codex 任務／session。不是正式專案數、工時、Token 或交付成果數。

同一 session 只有在確定是內部 companion 或完全重複時才排除。相似但目標不同的工程工作不得過度合併。

### 專案群組

依案名、產品線、客戶／平台與明確相同交付目標合併。不能只依資料夾名稱，也不能把不同產品因技術相似而合併。

### Token

將納入工作 session 期間內 `token_count` 事件的 `last_token_usage` 相加。總 Token 包含 Codex 回報的 Cached Input；供部門額度規劃，不等同財務帳單。

### 使用天數與活躍互動

- 使用天數：納入工作 session 的 Asia/Taipei 日曆日去重。
- 適用天數：從 `max(使用者指定起日, 首筆工作相關 Codex 日期)` 到指定迄日的日曆天數；0 筆時為 0。
- KPI 顯示 `使用天數／適用天數`，避免較晚開始使用者被完整 25 天分母不公平解讀。
- 活躍互動：每個 session 以 15 分鐘間隔切分互動區段；每段至少 2 分鐘，合計後四捨五入為小時。這是估計，不是正式工時。

### Skill 頻率

- Skill 覆蓋率＝偵測到實際 `SKILL.md` 使用的工作紀錄數／工作紀錄總數。
- 同一 Skill 在同一工作最多計 1 次；不同 Skill 可在同一工作重疊。
- 顯示 Top 5；沒有資料時寫「尚未偵測到 Skill 紀錄」，不得填入建議值。

## 固定工作分類

每筆工作只能歸入一個主要分類，四類合計必須等於 AI 工作紀錄總數：

1. 工程設計／審查
2. 技術研究／選型
3. 工具／自動化
4. 文件／報告／溝通

分類以該工作的主要交付目的為準，不只看關鍵字。無法判斷時根據使用者最後要求與產出型態做保守判斷。

## AI Value：工作助益，不做排名

AI Value 可作為個人績效與考核的參考之一，但不得只以 Token、使用量或單一分數判定，也不建立員工排名。

四個助益面向：

1. 任務推進：AI 是否協助完成、推進、除錯、決策或交付實際工作。
2. 品質與查核：AI 是否協助 Review、交叉比對、證據整理、規格確認或改善內容品質。
3. 可複用成果：是否形成可再次使用的 Script、Skill、MCP、Template、Workbook、文件或工程交換檔。
4. 風險辨識：AI 是否協助指出設計、相容性、量產、品質、時程或驗證風險。

每個面向只能使用下列狀態：

- `已觀察`：至少有一項具體、可描述的工作證據。
- `初步觀察`：證據量少或影響仍待後續工作確認。
- `資料累積中`：沒有足夠證據；不是低價值或負面評語。

標題規則：

- 10 筆以上：`AI Value｜X／4 助益面向已觀察`
- 1–9 筆：`AI Value｜初步觀察（X／4）`
- 0 筆：`AI Value｜資料累積中`

`X` 只計狀態為「已觀察」的面向。Speaker Notes 必須列出各面向的證據或資料仍在累積的原因。

## 樣本狀態

- `general`：10 筆以上。
- `starter`：1–9 筆；投影片註明樣本累積中，空列用 `—`。
- `no-data`：0 筆；仍產生兩頁，所有數字如實為 0，AI Value 顯示資料累積中。

圓餅圖在 1–9 筆時使用實際比例並在 Notes 註明樣本少；0 筆時顯示四個等分色塊但標籤為 `—`，不可顯示虛假的 25%。

## `report-data.json` 結構

```json
{
  "schemaVersion": "1.0",
  "employee": { "englishName": "English Name", "chineseName": "中文姓名" },
  "department": "研發部",
  "period": { "start": "2026-01-01", "end": "2026-01-31", "timezone": "Asia/Taipei" },
  "sampleMode": "general",
  "metrics": {
    "workRecordCount": 0,
    "projectGroupCount": 0,
    "activeDays": 0,
    "eligibleDays": 0,
    "activeMinutes": 0,
    "totalTokens": 0,
    "inputTokens": 0,
    "outputTokens": 0,
    "reasoningTokens": 0
  },
  "categories": [
    { "name": "工程設計／審查", "count": 0 },
    { "name": "技術研究／選型", "count": 0 },
    { "name": "工具／自動化", "count": 0 },
    { "name": "文件／報告／溝通", "count": 0 }
  ],
  "projects": [
    {
      "name": "專案名稱",
      "groupCount": 1,
      "aggregate": false,
      "workRecordCount": 1,
      "summary": "主要 AI 協作內容",
      "bullets": ["AI 協作重點", "分析或審查內容", "產出或決策"]
    }
  ],
  "skills": {
    "recordsWithSkill": 0,
    "top": [{ "name": "Skill Name", "count": 0 }]
  },
  "aiValue": {
    "observedDimensions": 0,
    "items": [
      { "name": "任務推進", "status": "資料累積中", "evidence": "" },
      { "name": "品質與查核", "status": "資料累積中", "evidence": "" },
      { "name": "可複用成果", "status": "資料累積中", "evidence": "" },
      { "name": "風險辨識", "status": "資料累積中", "evidence": "" }
    ]
  },
  "methodologyNotes": ["納入與排除摘要"],
  "sourceSummary": "Codex 本機工作 session"
}
```

一般情況每個 `projects[]` 項目代表一個群組，`groupCount` 為 1、`aggregate` 為 false。只有在已確認的「其他 N 個群組」彙總資料中，才可設 `aggregate: true` 與實際 `groupCount: N`；不得用彙總欄掩蓋無法確認的專案分類。

## 一致性與柔性驗證

- 不新增或刪除投影片、主卡片、圖表、表格或頁碼。
- 只修改既有命名物件的文字與資料。
- 姓名或摘要過長時，先縮短摘要，再在原框內小幅縮字／換行；不得移動主要物件。
- 驗證警告不阻擋交付；在最終回覆簡短說明即可。
- 只有檔案無法開啟、頁數錯誤、必要圖表／表格／核心物件遺失才屬致命錯誤。

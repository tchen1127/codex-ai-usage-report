# 研發部 Codex AI 使用報告規範 v2

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

## AI Value：AI 證據評分與同仁自評

AI Value 可作為個人績效與考核的參考之一，但不得只以 Token、使用量或單一分數判定，也不建立員工排名。

五個助益面向：

1. 任務推進：AI 是否協助完成、推進、除錯、決策或交付實際工作。
2. 品質與查核：AI 是否協助 Review、交叉比對、證據整理、規格確認或改善內容品質。
3. 可複用成果：是否形成可再次使用的 Script、Skill、MCP、Template、Workbook、文件或工程交換檔。
4. 風險辨識：AI 是否協助指出設計、相容性、量產、品質、時程或驗證風險。
5. 工作效率提升：AI 是否減少重複步驟、加快搜尋整理、自動化處理或縮短交付流程；沒有可靠前後工時時，不得宣稱節省時數或效率百分比。

每個面向在 PPT 顯示兩個獨立分數：

- `AI 證據評分`：由 Codex 工作 session 中可回溯的工作內容、成果與助益證據保守評定。
- `同仁自評`：由同仁依本人感受到的工作助益填寫；只填分數，不要求文字事例。

兩欄都只能使用 `1–5` 或 `N/A`：

- `1`：幾乎沒有實質助益。
- `2`：只有少量、個別或有限助益。
- `3`：可觀察到明確且具體的助益。
- `4`：經常產生明顯且重要的助益。
- `5`：廣泛、持續並對工作成果產生關鍵助益。
- `N/A`：本期不適用、沒有使用，或 AI 證據不足以評定；不代表低價值。

AI 證據評分必須依證據強度與影響範圍判定，不得只依 Token、工作紀錄數、使用天數或關鍵字自動換算。AI 給 `1–5` 時，`evidence` 必須保留可回溯的簡短依據於 Speaker Notes；PPT 畫面不顯示事例。證據不足時必須使用 `N/A`。

同仁自評在 AI 分析完成後一次收集五項 `1–5` 或 `N/A`，不要求文字說明。為降低錨定影響，收集前不要先顯示 AI 證據評分。

### 同仁自評視窗

預設執行 `scripts/collect_self_rating.ps1`，用單一 Windows 視窗一次顯示並收集五項分數。視窗必須符合：

- 五項各自顯示名稱、白話說明及鎖定式下拉選單。
- 下拉選單只提供 `1、2、3、4、5、N/A`，不能手動輸入文字。
- 視窗上方同時顯示等級意義：`1` 幾乎沒有實質助益、`2` 少量或有限助益、`3` 明確且具體助益、`4` 經常有明顯且重要助益、`5` 廣泛持續且對成果有關鍵助益、`N/A` 本期不適用或資訊不足。
- 不要求同仁輸入理由、評語或工作事例；五項未全部選完前不得確認。
- 五項說明固定為：
  - 任務推進：是否協助完成工作、解決阻礙、分析問題、作出決定或推進至可交付結果。
  - 品質與查核：是否協助 Review、交叉比對、規格確認、資料查證、測試或修正錯誤。
  - 可複用成果：是否協助建立可再次使用的 Script、Skill、Template、Workbook、文件或標準流程。
  - 風險辨識：是否協助發現設計、規格、相容性、量產、品質、時程、測試或執行風險。
  - 工作效率提升：是否減少重複步驟、加快搜尋整理、自動化處理或縮短流程；不要求估算節省時數。

AI 證據評分與 AI 綜合應用觀察必須先在內部完成，再顯示自評視窗；但在同仁送出自評前不得揭露兩者內容，以避免錨定。

PPT 卡片標題固定顯示 `AI 的證據與自評`，以表格呈現五個面向與 `AI 證據`、`同仁自評` 兩欄分數。兩欄平均分開計算，`N/A` 不納入平均，不得再混成單一總分。

## AI 綜合應用觀察

依 [comprehensive-observation.md](comprehensive-observation.md) 的六面向、成熟度與證據規則產生。第二頁左下卡片固定顯示 `AI 綜合應用觀察`；畫面只放個人化短評，量化訊號、六面向證據、優勢、改善建議與限制留在 Speaker Notes。自評只反映同仁感受，不得改寫 AI 綜合觀察或 AI 證據評分。

## 樣本狀態

- `general`：10 筆以上。
- `starter`：1–9 筆；投影片註明樣本累積中，空列用 `—`；AI 證據不足的面向使用 `N/A`。
- `no-data`：0 筆；仍產生兩頁，所有數字如實為 0，AI 證據評分固定使用 `N/A`。

圓餅圖在 1–9 筆時使用實際比例並在 Notes 註明樣本少；0 筆時顯示四個等分色塊但標籤為 `—`，不可顯示虛假的 25%。

圓餅圖的非零分類標籤固定顯示「百分比＋分類名稱」。圖中只要包含比例小於或等於 12% 的項目，即啟用自動外側配置與引導線，避免小切片內的文字重疊；0 筆與零值分類仍依前述規則顯示 `—` 或空白。

## `report-data.json` 結構

```json
{
  "schemaVersion": "2.0",
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
    "items": [
      { "name": "任務推進", "aiEvidenceScore": 4, "selfScore": 4, "evidence": "可回溯的 AI 助益證據" },
      { "name": "品質與查核", "aiEvidenceScore": 5, "selfScore": 5, "evidence": "可回溯的 AI 助益證據" },
      { "name": "可複用成果", "aiEvidenceScore": 3, "selfScore": 3, "evidence": "可回溯的 AI 助益證據" },
      { "name": "風險辨識", "aiEvidenceScore": 4, "selfScore": 4, "evidence": "可回溯的 AI 助益證據" },
      { "name": "工作效率提升", "aiEvidenceScore": "N/A", "selfScore": "N/A", "evidence": "" }
    ]
  },
  "aiComprehensiveObservation": {
    "status": "evaluated",
    "maturityLevel": "穩定應用",
    "observationText": "依本期紀錄呈現的個人化 AI 應用觀察，須符合字數與證據規則。",
    "quantitativeSignals": {
      "totalTokens": 0,
      "workRecordCount": 0,
      "activeDays": 0,
      "eligibleDays": 0,
      "activeMinutes": 0,
      "projectGroupCount": 0,
      "skillCoverageRate": 0
    },
    "dimensionAssessments": [
      { "name": "使用投入與持續性", "score": 3, "evidence": "可回溯依據" },
      { "name": "任務廣度", "score": 3, "evidence": "可回溯依據" },
      { "name": "任務深度與複雜度", "score": 3, "evidence": "可回溯依據" },
      { "name": "成果與實務價值", "score": 3, "evidence": "可回溯依據" },
      { "name": "品質、查核與風險意識", "score": 3, "evidence": "可回溯依據" },
      { "name": "可複用性與成熟度", "score": 3, "evidence": "可回溯依據" }
    ],
    "strengths": ["本期可由證據支持的優勢"],
    "improvement": "下一步可執行的改善方向。",
    "limitations": ["資料或推論限制"],
    "internalScore": 60
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

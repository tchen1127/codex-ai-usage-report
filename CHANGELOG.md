# 版本變更記錄

本檔案記錄公開版本的重要功能與行為變更。版本號採用 Semantic Versioning。

## v1.2.0 — 2026-08-21

### 新增

- 新增 Google Antigravity 本機 conversation database／brain transcript 擷取器。
- 新增 Codex＋Antigravity 數值彙整器，可聯集使用日與跨平台活躍區段，並驗證 Antigravity Token 子集不重複加總。
- `report-data.json` 可加入 `sources`、平台角色及 Token 方法欄位；兩頁報告可顯示雙平台標題與來源。
- 安裝腳本維持 Codex-only；Antigravity 僅由 Codex 唯讀擷取本機紀錄，不安裝或執行本 Skill。
- 新增雙 AI 自動判定：只有至少一筆 Antigravity Session 通過日期、資料完整性、工作相關性與去重檢查時才顯示雙平台。

### 評估規則

- Codex 定位為主要報告產生器，Antigravity 可作備援工作來源；主力／備援與額度切換本身不構成 AI Value 加分。
- Skill 覆蓋率只納入明確 `$skill-name`、`SKILL.md` 或實際 Skill 路徑證據。
- Antigravity output 已含 thinking／response 子集，不得重複計入總 Token。

### 相容性

- 保持 `schemaVersion: 2.0` 與 Codex-only 舊報告相容；沒有 Antigravity 本機資料時維持原本流程。
- 明確限制本 Skill 只能在 Codex 執行，不支援 Antigravity Skill runtime。
- 說明限制原因：Antigravity 不保證支援 Codex bundled runtime、PowerPoint artifact／驗證及 Windows 自評指令，禁止以省略步驟方式執行不完整報告。

## v1.1.1 — 2026-08-18

### 文件

- README 新增建議的 Codex 模型設定：`gpt-5.6-terra`，推理等級 `中`。

## v1.1.0 — 2026-08-17

### 新增

- 同仁自評改為單一 Windows 視窗的五個鎖定式下拉選單，直接顯示五個面向與 `1–5／N/A` 定義，不要求輸入文字或事例。
- 第二頁新增 `AI 綜合應用觀察`，依本機工作紀錄形成個人化短評、成熟度、六面向證據及可執行的改善方向。
- 報告最後一行改為每位同仁專屬的 `AI 建議`，不再顯示 AI 證據／同仁自評平均。

### 驗證

- 新增 AI 綜合觀察的資料完整性檢查，會拒絕缺項、重複、非法分數、無證據數值分數及與統計數字不一致的輸入。

## v1.0.1 — 2026-08-17

### 修正

- 工作分類圓環圖改為顯示「百分比＋分類名稱」，避免只有百分比而無法辨識分類。
- 圖中包含比例小於或等於 12% 的項目時，啟用自動外側配置與引導線，降低小切片標籤重疊風險。
- 保留起步版的實際比例，以及無資料版的 `—` 顯示，不產生虛假百分比。

### 文件

- README 新增已安裝 Skill 的更新步驟，並說明既有 PPT 不會自動套用新版圖表設定。

### 驗證

- 一般版、1–9 筆起步版及 0 筆無資料版皆通過兩頁結構驗證。
- 三種版本皆通過投影片邊界與溢出檢查。
- 驗證圖表包含正確分類標籤、實際比例及引導線設定。

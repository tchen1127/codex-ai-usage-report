# 安裝並開始製作 AI 工作報告

> 本檔案是給 Codex 執行的啟動指令。使用者只需請 Codex 閱讀本檔，或在此 Repository 輸入「開始」。

> 執行界線：本報告 Skill 只能在 Codex 執行。完整流程依賴 Codex 的 bundled Node／Python、PowerPoint artifact runtime、驗證工具與 Windows 自評流程；Antigravity 部分指令無法使用，因此不得在 Antigravity 安裝或執行本 Skill。Antigravity 只提供 Codex 唯讀分析的本機工作紀錄。

## Codex 執行步驟

1. 將本檔所在資料夾視為 Repository 根目錄。
2. 檢查下列來源是否完整：
   - `.agents/skills/codex-ai-usage-report/SKILL.md`
   - `.agents/skills/codex-ai-usage-report/agents/openai.yaml`
   - `.agents/skills/codex-ai-usage-report/assets/rd-codex-ai-usage-report-template.pptx`
   - `.agents/skills/codex-ai-usage-report/assets/template.sha256`
   - `.agents/skills/codex-ai-usage-report/references/antigravity-integration.md`
   - `.agents/skills/codex-ai-usage-report/scripts/extract_antigravity_usage.py`
   - `.agents/skills/codex-ai-usage-report/scripts/summarize_usage_sources.py`
3. 在 Windows PowerShell 執行：

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-skill.ps1
   ```

4. 檢查安裝結果：
   - `CODEX_STATUS=installed／updated／already-current`：Codex Skill 狀態。
5. 即使 Codex 尚未重新啟動，也直接使用 Repository 內已自動發現的 `$codex-ai-usage-report` 繼續本次工作。
6. 若使用者尚未提供資料，一次詢問以下四項：
   - 英文姓名
   - 中文姓名
   - 統計起日（`YYYY/MM/DD` 或 `YYYY-MM-DD`）
   - 統計迄日（`YYYY/MM/DD` 或 `YYYY-MM-DD`）
7. 收到四項資料後：
   - 以 Asia/Taipei 計算，起日與迄日都納入。
   - 自動分析該期間本機 Codex 的工作相關 Session。
   - Codex 自動檢查 `%USERPROFILE%/.gemini/antigravity/conversations` 與 `brain`；只有至少一筆期間內 Antigravity session 通過資料完整性、工作相關性與去重檢查時才顯示雙 AI，否則維持 Codex-only。
   - 排除 ChatGPT／GPT 聊天及非工作使用。
   - 依工作證據為五個 AI Value 面向建立 `1–5` 或 `N/A` 的「AI 證據評分」，並先完成 AI 綜合應用觀察。
   - 不先顯示 AI 證據評分或綜合觀察；執行 Skill 的 `collect_self_rating.ps1` 開啟單一 Windows 視窗，讓同仁以五個下拉選單選擇任務推進、品質與查核、可複用成果、風險辨識、工作效率提升的 `1–5` 或 `N/A`。視窗顯示各項說明與分數意義，不要求文字事例。
8. 收到五項同仁自評後：
   - 使用固定兩頁模板產生報告。
   - 將成品放在 Repository 的 `reports/`。
   - 執行 Skill 內的驗證程序。
9. 最終只請使用者確認姓名、統計期間及是否含有不宜分享的敏感摘要；不要要求使用者自行重新排版。

## 安全界線

- 不上傳或提交個人 Session、原始 Prompt、分析中間檔或產生的個人報告。
- 只讀取目前 Windows 使用者的 `%USERPROFILE%/.codex`、目前生效的 `CODEX_HOME` 與 `%USERPROFILE%/.gemini/antigravity`，不得自動掃描其他 Windows 帳號。
- 同一位員工在目前 Windows 使用者資料範圍內使用多個 Codex 登入帳號時，合併統計成一份報告，不作帳號別拆分；Token 視為員工合計值。
- 只有在 Windows 帳號或 `.codex` 曾由不同人共用時，才停止並說明紀錄可能無法可靠分離。
- 不建立員工排名，也不把 Token、使用天數或紀錄數直接等同績效。
- AI 綜合應用觀察只反映本期可回溯的本機 Codex 與 Antigravity 工作證據，不得使用 Token、活躍時間、平台數、主力／備援角色或單一分數直接判定績效，也不得虛構 ROI、節省時數或效率百分比。
- 已安裝不同版本時，安裝腳本必須先保留備份，不直接刪除舊版。

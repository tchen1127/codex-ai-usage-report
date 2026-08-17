param(
    [string]$OutputPath,
    [switch]$ValidateOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$dimensions = @(
    [pscustomobject]@{
        Name = '任務推進'
        Description = 'AI 是否協助完成工作、解決阻礙、分析問題、作出決定，或將任務推進到可交付結果。'
    },
    [pscustomobject]@{
        Name = '品質與查核'
        Description = 'AI 是否協助 Review、交叉比對、規格確認、資料查證、測試或修正錯誤。'
    },
    [pscustomobject]@{
        Name = '可複用成果'
        Description = 'AI 是否協助建立可再次使用的 Script、Skill、Template、Workbook、文件或標準流程。'
    },
    [pscustomobject]@{
        Name = '風險辨識'
        Description = 'AI 是否協助發現設計、規格、相容性、量產、品質、時程、測試或執行風險。'
    },
    [pscustomobject]@{
        Name = '工作效率提升'
        Description = 'AI 是否減少重複步驟、加快搜尋整理、自動化處理或縮短工作流程；不需估算節省時數。'
    }
)

$scoreOptions = @(
    '請選擇',
    '1｜幾乎沒有實質助益',
    '2｜只有少量、個別或有限助益',
    '3｜有明確且具體的助益',
    '4｜經常產生明顯且重要的助益',
    '5｜廣泛、持續，並對工作成果產生關鍵助益',
    'N/A｜本期不適用、沒有使用或沒有足夠資訊判斷'
)

if ($ValidateOnly) {
    [pscustomobject]@{
        status = 'valid'
        inputMode = 'drop-down-list'
        freeTextEntry = $false
        dimensions = $dimensions
        scoreOptions = $scoreOptions[1..($scoreOptions.Count - 1)]
    } | ConvertTo-Json -Depth 5
    exit 0
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    throw 'OutputPath is required unless -ValidateOnly is used.'
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

try {
    [System.Windows.Forms.Application]::SetHighDpiMode(
        [System.Windows.Forms.HighDpiMode]::PerMonitorV2
    ) | Out-Null
} catch {
    # Windows PowerShell 5.1 does not expose SetHighDpiMode; the form still works.
}

[System.Windows.Forms.Application]::EnableVisualStyles()

$font = [System.Drawing.Font]::new('Microsoft JhengHei', 11)
$titleFont = [System.Drawing.Font]::new('Microsoft JhengHei', 18, [System.Drawing.FontStyle]::Bold)
$sectionFont = [System.Drawing.Font]::new('Microsoft JhengHei', 13, [System.Drawing.FontStyle]::Bold)
$smallFont = [System.Drawing.Font]::new('Microsoft JhengHei', 10.5)

$form = [System.Windows.Forms.Form]::new()
$form.Text = 'Codex AI 使用報告｜同仁自評'
$form.StartPosition = 'CenterScreen'
$form.ClientSize = [System.Drawing.Size]::new(1120, 980)
$form.MinimumSize = [System.Drawing.Size]::new(1080, 950)
$form.Font = $font
$form.AutoScroll = $true
$form.MaximizeBox = $false

$title = [System.Windows.Forms.Label]::new()
$title.Text = 'AI 工作助益自評'
$title.Font = $titleFont
$title.AutoSize = $true
$title.Location = [System.Drawing.Point]::new(28, 18)
$form.Controls.Add($title)

$intro = [System.Windows.Forms.Label]::new()
$intro.Text = "請依本統計期間內 AI 對實際工作的助益程度，為五個面向各選擇 1–5 或 N/A。`r`n此頁只收集同仁自評；不會先顯示 AI 證據評分。"
$intro.Location = [System.Drawing.Point]::new(30, 92)
$intro.Size = [System.Drawing.Size]::new(1050, 76)
$intro.ForeColor = [System.Drawing.Color]::FromArgb(71, 85, 105)
$form.Controls.Add($intro)

$scaleBox = [System.Windows.Forms.GroupBox]::new()
$scaleBox.Text = '評分說明'
$scaleBox.Font = $sectionFont
$scaleBox.Location = [System.Drawing.Point]::new(28, 210)
$scaleBox.Size = [System.Drawing.Size]::new(1064, 134)
$form.Controls.Add($scaleBox)

$scale = [System.Windows.Forms.Label]::new()
$scale.Text = "1 幾乎沒有實質助益　 2 少量或有限助益　 3 明確具體助益`r`n4 經常有明顯且重要助益　 5 廣泛、持續且對成果有關鍵助益`r`nN/A 本期不適用、沒有使用，或沒有足夠資訊判斷"
$scale.Font = $smallFont
$scale.Location = [System.Drawing.Point]::new(18, 30)
$scale.Size = [System.Drawing.Size]::new(1026, 92)
$scaleBox.Controls.Add($scale)

$combos = [ordered]@{}
$top = 364
foreach ($dimension in $dimensions) {
    $nameLabel = [System.Windows.Forms.Label]::new()
    $nameLabel.Text = $dimension.Name
    $nameLabel.Font = $sectionFont
    $nameLabel.Location = [System.Drawing.Point]::new(32, $top)
    $nameLabel.Size = [System.Drawing.Size]::new(160, 34)
    $form.Controls.Add($nameLabel)

    $descriptionLabel = [System.Windows.Forms.Label]::new()
    $descriptionLabel.Text = $dimension.Description
    $descriptionLabel.Font = $smallFont
    $descriptionLabel.ForeColor = [System.Drawing.Color]::FromArgb(71, 85, 105)
    $descriptionLabel.Location = [System.Drawing.Point]::new(205, $top)
    $descriptionLabel.Size = [System.Drawing.Size]::new(585, 72)
    $form.Controls.Add($descriptionLabel)

    $combo = [System.Windows.Forms.ComboBox]::new()
    $combo.DropDownStyle = [System.Windows.Forms.ComboBoxStyle]::DropDownList
    $combo.Font = $font
    $combo.Location = [System.Drawing.Point]::new(820, ($top + 2))
    $combo.Size = [System.Drawing.Size]::new(250, 34)
    [void]$combo.Items.AddRange([object[]]$scoreOptions)
    $combo.SelectedIndex = 0
    $form.Controls.Add($combo)
    $combos[$dimension.Name] = $combo

    $top += 112
}

$statusLabel = [System.Windows.Forms.Label]::new()
$statusLabel.Text = '請完成五個面向後按「確認」。'
$statusLabel.Location = [System.Drawing.Point]::new(32, 922)
$statusLabel.Size = [System.Drawing.Size]::new(640, 30)
$statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(71, 85, 105)
$form.Controls.Add($statusLabel)

$confirmButton = [System.Windows.Forms.Button]::new()
$confirmButton.Text = '確認'
$confirmButton.Font = $font
$confirmButton.Location = [System.Drawing.Point]::new(854, 914)
$confirmButton.Size = [System.Drawing.Size]::new(104, 40)
$confirmButton.Enabled = $false
$confirmButton.DialogResult = [System.Windows.Forms.DialogResult]::OK
$form.Controls.Add($confirmButton)

$cancelButton = [System.Windows.Forms.Button]::new()
$cancelButton.Text = '取消'
$cancelButton.Font = $font
$cancelButton.Location = [System.Drawing.Point]::new(970, 914)
$cancelButton.Size = [System.Drawing.Size]::new(104, 40)
$cancelButton.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
$form.Controls.Add($cancelButton)

$updateState = {
    $complete = @($combos.Values | Where-Object { $_.SelectedIndex -gt 0 }).Count -eq $dimensions.Count
    $confirmButton.Enabled = $complete
    $statusLabel.Text = if ($complete) { '五個面向皆已完成，可以按「確認」。' } else { '請完成五個面向後按「確認」。' }
}

foreach ($combo in $combos.Values) {
    $combo.Add_SelectedIndexChanged($updateState)
}

$form.AcceptButton = $confirmButton
$form.CancelButton = $cancelButton
$dialogResult = $form.ShowDialog()

if ($dialogResult -ne [System.Windows.Forms.DialogResult]::OK) {
    Write-Error 'Self-rating collection was cancelled; no output file was created.'
    exit 2
}

$items = foreach ($dimension in $dimensions) {
    $selected = [string]$combos[$dimension.Name].SelectedItem
    $score = if ($selected.StartsWith('N/A')) {
        'N/A'
    } else {
        [int]$selected.Substring(0, 1)
    }
    [ordered]@{
        name = $dimension.Name
        selfScore = $score
    }
}

$payload = [ordered]@{
    schemaVersion = '1.0'
    collectedAt = [DateTimeOffset]::Now.ToString('o')
    inputMode = 'windows-drop-down-list'
    items = @($items)
}

$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
$parent = [System.IO.Path]::GetDirectoryName($resolvedOutput)
if (-not [string]::IsNullOrWhiteSpace($parent)) {
    [System.IO.Directory]::CreateDirectory($parent) | Out-Null
}
$json = $payload | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($resolvedOutput, "$json`n", [System.Text.UTF8Encoding]::new($false))
Write-Output $resolvedOutput

[CmdletBinding()]
param(
    [string]$DestinationRoot = (Join-Path ([Environment]::GetFolderPath('UserProfile')) '.agents\skills')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$skillName = 'codex-ai-usage-report'
$repoRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $repoRoot ".agents\skills\$skillName"

function Get-SkillManifestHash {
    param([Parameter(Mandatory = $true)][string]$Root)

    $rootFull = [IO.Path]::GetFullPath($Root).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
    $lines = Get-ChildItem -LiteralPath $rootFull -Recurse -File |
        Sort-Object FullName |
        ForEach-Object {
            $relative = $_.FullName.Substring($rootFull.Length).TrimStart('\', '/').Replace('\', '/')
            $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
            "$relative=$hash"
        }

    $payload = [Text.Encoding]::UTF8.GetBytes(($lines -join "`n"))
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($sha.ComputeHash($payload))).Replace('-', '')
    }
    finally {
        $sha.Dispose()
    }
}

$required = @(
    'SKILL.md',
    'agents\openai.yaml',
    'assets\rd-codex-ai-usage-report-template.pptx',
    'assets\template.sha256',
    'references\report-standard.md',
    'references\comprehensive-observation.md',
    'scripts\extract_codex_usage.mjs',
    'scripts\build_report.mjs',
    'scripts\validate_report.mjs',
    'scripts\collect_self_rating.ps1'
)

foreach ($relative in $required) {
    $requiredPath = Join-Path $source $relative
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
        throw "Skill source is incomplete. Missing: $requiredPath"
    }
}

$sourceFull = (Resolve-Path -LiteralPath $source).Path
$repoFull = (Resolve-Path -LiteralPath $repoRoot).Path.TrimEnd('\', '/')
if (-not $sourceFull.StartsWith("$repoFull\", [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The Skill source resolved outside the Repository root.'
}

$expectedTemplateHash = ((Get-Content -LiteralPath (Join-Path $sourceFull 'assets\template.sha256') -Encoding UTF8) -split '\s+')[0]
$actualTemplateHash = (Get-FileHash -LiteralPath (Join-Path $sourceFull 'assets\rd-codex-ai-usage-report-template.pptx') -Algorithm SHA256).Hash
if ($expectedTemplateHash -ne $actualTemplateHash) {
    throw 'The bundled PowerPoint template did not pass the SHA256 integrity check.'
}

New-Item -ItemType Directory -Path $DestinationRoot -Force | Out-Null
$destinationRootFull = (Resolve-Path -LiteralPath $DestinationRoot).Path.TrimEnd('\', '/')
$destination = Join-Path $destinationRootFull $skillName
$destinationFull = [IO.Path]::GetFullPath($destination)
if (-not $destinationFull.StartsWith("$destinationRootFull\", [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The destination resolved outside the requested Skill directory.'
}

$sourceManifest = Get-SkillManifestHash -Root $sourceFull
$status = 'installed'
$backupPath = $null

if (Test-Path -LiteralPath $destinationFull) {
    $destinationManifest = Get-SkillManifestHash -Root $destinationFull
    if ($destinationManifest -eq $sourceManifest) {
        Write-Output 'STATUS=already-current'
        Write-Output "DESTINATION=$destinationFull"
        Write-Output "MANIFEST_SHA256=$sourceManifest"
        return
    }

    $backupRoot = Join-Path (Split-Path -Parent $destinationRootFull) 'skill-backups'
    New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backupPath = Join-Path $backupRoot "$skillName-$timestamp"
    Move-Item -LiteralPath $destinationFull -Destination $backupPath
    $status = 'updated'
}

Copy-Item -LiteralPath $sourceFull -Destination $destinationFull -Recurse
$installedManifest = Get-SkillManifestHash -Root $destinationFull
if ($installedManifest -ne $sourceManifest) {
    throw 'The installed Skill failed the manifest integrity check. The previous version, if any, remains in the backup directory.'
}

Write-Output "STATUS=$status"
Write-Output "DESTINATION=$destinationFull"
if ($backupPath) {
    Write-Output "BACKUP=$backupPath"
}
Write-Output "MANIFEST_SHA256=$installedManifest"

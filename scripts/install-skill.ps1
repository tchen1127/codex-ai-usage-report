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
    'references\antigravity-integration.md',
    'scripts\extract_codex_usage.mjs',
    'scripts\extract_antigravity_usage.py',
    'scripts\summarize_usage_sources.py',
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

$sourceManifest = Get-SkillManifestHash -Root $sourceFull

function Install-SkillCopy {
    param(
        [Parameter(Mandatory = $true)][string]$TargetRoot,
        [Parameter(Mandatory = $true)][string]$BackupRoot,
        [Parameter(Mandatory = $true)][string]$StatusPrefix
    )

    New-Item -ItemType Directory -Path $TargetRoot -Force | Out-Null
    $targetRootFull = (Resolve-Path -LiteralPath $TargetRoot).Path.TrimEnd('\', '/')
    $destinationFull = [IO.Path]::GetFullPath((Join-Path $targetRootFull $skillName))
    if (-not $destinationFull.StartsWith("$targetRootFull\", [StringComparison]::OrdinalIgnoreCase)) {
        throw "The $StatusPrefix destination resolved outside the requested Skill directory."
    }

    $status = 'installed'
    $backupPath = $null
    if (Test-Path -LiteralPath $destinationFull) {
        $destinationManifest = Get-SkillManifestHash -Root $destinationFull
        if ($destinationManifest -eq $sourceManifest) {
            $status = 'already-current'
        }
        else {
            New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
            $backupRootFull = (Resolve-Path -LiteralPath $BackupRoot).Path.TrimEnd('\', '/')
            $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
            $backupPath = [IO.Path]::GetFullPath((Join-Path $backupRootFull "$skillName-$timestamp"))
            if (-not $backupPath.StartsWith("$backupRootFull\", [StringComparison]::OrdinalIgnoreCase)) {
                throw "The $StatusPrefix backup resolved outside the requested backup directory."
            }
            Move-Item -LiteralPath $destinationFull -Destination $backupPath
            $status = 'updated'
        }
    }

    if ($status -ne 'already-current') {
        Copy-Item -LiteralPath $sourceFull -Destination $destinationFull -Recurse
    }
    $installedManifest = Get-SkillManifestHash -Root $destinationFull
    if ($installedManifest -ne $sourceManifest) {
        throw "The $StatusPrefix Skill installation failed the manifest integrity check."
    }

    Write-Output "$($StatusPrefix)_STATUS=$status"
    Write-Output "$($StatusPrefix)_DESTINATION=$destinationFull"
    if ($backupPath) {
        Write-Output "$($StatusPrefix)_BACKUP=$backupPath"
    }
    Write-Output "$($StatusPrefix)_MANIFEST_SHA256=$installedManifest"
}

$codexBackupRoot = Join-Path (Split-Path -Parent ([IO.Path]::GetFullPath($DestinationRoot))) 'skill-backups'
Install-SkillCopy -TargetRoot $DestinationRoot -BackupRoot $codexBackupRoot -StatusPrefix 'CODEX'

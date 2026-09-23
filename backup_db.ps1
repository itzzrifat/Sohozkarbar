# Automated SQLite Database Backup Script for SohozKarbar Central Server
$BackupDir = Join-Path $PSScriptRoot "backups"
if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$SourceDb = Join-Path $PSScriptRoot "sohozkarbar_master.db"
$TargetDb = Join-Path $BackupDir "sohozkarbar_backup_$Timestamp.db"

if (Test-Path $SourceDb) {
    Copy-Item -Path $SourceDb -Destination $TargetDb -Force
    Write-Host "✅ [Backup Success] Database backed up to: $TargetDb" -ForegroundColor Green
} else {
    Write-Host "❌ [Backup Error] Database file not found at: $SourceDb" -ForegroundColor Red
}

# SohozKarbar — 178871 (v237) Windows PowerShell Deploy Script
Set-Location $PSScriptRoot

Write-Host "== ১) surge আছে কি না =="
if (-not (Get-Command surge -ErrorAction SilentlyContinue)) {
  Write-Host "surge নেই — ইনস্টল করছি..."
  npm install -g surge
}

Write-Host "== ২) লগইন চেক =="
surge whoami

Write-Host "== ৩) তিন ডোমেইনে deploy =="
Set-Content -Path CNAME -Value "www.sohozkarbar.pro.bd"
surge . www.sohozkarbar.pro.bd

Set-Content -Path CNAME -Value "sohozkarbar.pro.bd"
surge . sohozkarbar.pro.bd

Set-Content -Path CNAME -Value "sohozkarbar.surge.sh"
surge . sohozkarbar.surge.sh

Set-Content -Path CNAME -Value "www.sohozkarbar.pro.bd"

Write-Host ""
Write-Host "============================================"
Write-Host "✅ DEPLOY সম্পূর্ণ — এখন লাইভ হওয়ার কথা 178871"
Write-Host "যাচাই: https://www.sohozkarbar.pro.bd/version.json"
Write-Host "============================================"

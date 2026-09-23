@echo off
chcp 65001 >nul
title GitHub Cloud Deployment - SohozKarbar Central Server

echo ========================================================
echo   SohozKarbar Central Multi-Tenant Server - GitHub Push
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/3] Checking Git status...
git add .
git commit -m "feat: production ready cloud server deployment" 2>nul

echo.
echo [2/3] Setting Remote Origin...
git remote remove origin 2>nul
git remote add origin https://github.com/itzzrifat/sohozkarbar-central-server.git

echo.
echo [3/3] Pushing to GitHub (main branch)...
echo.
echo NOTE: If you haven't created the repository yet, please create a PRIVATE or PUBLIC repo:
echo       https://github.com/new (Repository Name: sohozkarbar-central-server)
echo.
git push -u origin main

echo.
echo ========================================================
echo  Ready for 1-Click Cloud Deployment!
echo  Deploy options:
echo  1. Render: https://dashboard.render.com/select-repo?type=web
echo  2. Koyeb:  https://app.koyeb.com/services/deploy
echo ========================================================
pause

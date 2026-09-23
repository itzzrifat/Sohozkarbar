@echo off
title SohozKarbar ERP Central Server
color 0A
echo =======================================================
echo    SOHOZKARBAR ERP CENTRAL MULTI-TENANT CLOUD SERVER
echo    Owner: Rifat Uddin (Sohoz Karbar Tech Solutions)
echo =======================================================
cd /d "%~dp0"
node server.js
pause

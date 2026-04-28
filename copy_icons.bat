@echo off
set SRC=C:\Users\arune\.gemini\antigravity\brain\c458945b-11db-4d7d-ad0f-bbebae87efbf\favicon_recreation_1777366346281.png
set DEST_DIR=c:\Users\arune\.gemini\antigravity\scratch\material-request-app\frontend\assets

if not exist "%DEST_DIR%" mkdir "%DEST_DIR%"

copy /Y "%SRC%" "%DEST_DIR%\favicon.png"
copy /Y "%SRC%" "%DEST_DIR%\icon.png"
copy /Y "%SRC%" "%DEST_DIR%\adaptive-icon.png"
copy /Y "%SRC%" "%DEST_DIR%\splash.png"

echo Favicon and Icons copied successfully!
pause

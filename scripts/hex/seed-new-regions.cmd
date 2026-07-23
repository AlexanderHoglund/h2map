@echo off
rem World-view + regional coverage for the newer regions, runnable in
rem parallel with the main seed-queue (both cool down politely on 429).
rem Logs to hex-seed-new.log at the repo root. Idempotent.
cd /d %~dp0..\..
echo ==== new-regions queue started %date% %time% ==== >> hex-seed-new.log
call npm run hex:seed -- poland 2 >> hex-seed-new.log 2>&1
call npm run hex:seed -- baltics 2 >> hex-seed-new.log 2>&1
call npm run hex:seed -- poland 3 >> hex-seed-new.log 2>&1
call npm run hex:seed -- baltics 3 >> hex-seed-new.log 2>&1
call npm run hex:seed -- poland 4 >> hex-seed-new.log 2>&1
call npm run hex:seed -- baltics 4 >> hex-seed-new.log 2>&1
call npm run hex:seed -- india 2 >> hex-seed-new.log 2>&1
call npm run hex:seed -- australia 2 >> hex-seed-new.log 2>&1
call npm run hex:seed -- india 3 >> hex-seed-new.log 2>&1
call npm run hex:seed -- australia 3 >> hex-seed-new.log 2>&1
echo ==== new-regions queue complete %date% %time% ==== >> hex-seed-new.log

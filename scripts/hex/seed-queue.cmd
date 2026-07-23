@echo off
rem Runs the full hex-seeding queue sequentially, logging to hex-seed.log at
rem the repo root. Idempotent - re-run anytime; ready cells are skipped.
rem Launch detached:  start /min scripts\hex\seed-queue.cmd
cd /d %~dp0..\..
echo ==== seed queue started %date% %time% ==== >> hex-seed.log
call npm run hex:seed -- chile-central 3 >> hex-seed.log 2>&1
call npm run hex:seed -- scandinavia 2 >> hex-seed.log 2>&1
call npm run hex:seed -- scandinavia 3 >> hex-seed.log 2>&1
call npm run hex:seed -- chile-south 4 >> hex-seed.log 2>&1
call npm run hex:seed -- chile-central 4 >> hex-seed.log 2>&1
call npm run hex:seed -- chile-north 4 >> hex-seed.log 2>&1
call npm run hex:seed -- namibia 4 >> hex-seed.log 2>&1
call npm run hex:seed -- scandinavia 4 >> hex-seed.log 2>&1
call npm run hex:seed -- south-korea 2 >> hex-seed.log 2>&1
call npm run hex:seed -- south-korea 3 >> hex-seed.log 2>&1
call npm run hex:seed -- south-korea 4 >> hex-seed.log 2>&1
rem Healing sweep: transient failures (rate limits) get retried; ready
rem cells are skipped, so these passes are fast.
call npm run hex:seed >> hex-seed.log 2>&1
call npm run hex:seed -- chile-north 3 >> hex-seed.log 2>&1
call npm run hex:seed -- chile-central 3 >> hex-seed.log 2>&1
call npm run hex:seed -- chile-south 3 >> hex-seed.log 2>&1
call npm run hex:seed -- namibia 3 >> hex-seed.log 2>&1
call npm run hex:seed -- scandinavia 3 >> hex-seed.log 2>&1
echo ==== seed queue complete %date% %time% ==== >> hex-seed.log

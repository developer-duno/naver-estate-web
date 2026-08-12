# 세션 359: DB 연결 장애(4연속 확인) 대응 — release.md §3 절차 답습
# Step 1: 옛 orchestrator 종료 (python.exe·pythonw.exe 둘 다)
$procs = Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='pythonw.exe'" |
    Where-Object { $_.CommandLine -like '*startup_orchestrator*' }
$procs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Write-Output "=== Step 1: orchestrator 종료 시도 완료 ($($procs.Count)개) ==="

Start-Sleep -Seconds 2

# Step 1-b: 사멸 확인
$remaining = (Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='pythonw.exe'" |
    Where-Object { $_.CommandLine -like '*startup_orchestrator*' } | Measure-Object).Count
Write-Output "=== Step 1-b: 잔존 orchestrator 프로세스 수: $remaining (기대: 0) ==="

# Step 2: uvicorn 자식 좀비 정리 (port 8002)
$pids = (Get-NetTCPConnection -LocalPort 8002 -ErrorAction SilentlyContinue).OwningProcess
if ($pids) {
    $pids | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    Write-Output "=== Step 2: port 8002 점유 프로세스 종료 완료 ==="
} else {
    Write-Output "=== Step 2: port 8002 점유 프로세스 없음 ==="
}

Start-Sleep -Seconds 3

# Step 4: schtasks 경유 세션 독립 재기동
schtasks /Create /TN naver-orch-restart-S359 /SC ONCE /ST 23:59 /F /TR "C:\Users\user\AppData\Local\Programs\Python\Python312\pythonw.exe D:\naver-estate-web\scripts\startup_orchestrator.py"
schtasks /Run /TN naver-orch-restart-S359
Start-Sleep -Seconds 2
schtasks /Delete /TN naver-orch-restart-S359 /F
Write-Output "=== Step 4: schtasks 재기동 완료 ==="

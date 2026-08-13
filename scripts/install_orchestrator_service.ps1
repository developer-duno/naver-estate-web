# install_orchestrator_service.ps1 — naver-estate orchestrator 를 Windows 서비스(nssm)로 등록
#
# 목적: 로그인 없이 "부팅만으로" 서버 자동 시작.
#   2026-08-12 Windows Update(KB5120249) 야간 자동 재부팅 후 로그인 화면에서 13시간
#   대기하며 backend 가 통째로 다운된 사고(세션 363 규명)의 재발 방지.
#   기존 방식(사용자 Startup 폴더 BAT)은 "로그인 시"에만 실행되는 구조적 한계가 원인.
#
# 실행(관리자 PowerShell):
#   powershell -NoProfile -ExecutionPolicy Bypass -File D:\naver-estate-web\scripts\install_orchestrator_service.ps1
#
# 효과:
#   - 부팅 즉시(지연 자동 시작) orchestrator 가동 — 로그인 불필요
#   - orchestrator 프로세스가 죽으면 nssm 이 60초 후 자동 재기동
#     (→ 앞으로 zombie 재시작은 "프로세스 kill" 만으로 nssm 이 되살림. release.md §3 간소화)

$ErrorActionPreference = 'Stop'
$nssm   = 'C:\Users\user\AppData\Local\Microsoft\WinGet\Packages\NSSM.NSSM_Microsoft.Winget.Source_8wekyb3d8bbwe\nssm-2.24-101-g897c7ad\win32\nssm.exe'
$svc    = 'naver-orchestrator'
$py     = 'C:\Users\user\AppData\Local\Programs\Python\Python312\pythonw.exe'
$target = 'D:\naver-estate-web\scripts\startup_orchestrator.py'

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw '관리자 PowerShell 에서 실행해야 합니다. (시작 메뉴 > PowerShell 우클릭 > 관리자 권한으로 실행)'
}
if (-not (Test-Path $nssm))   { throw "nssm 을 찾을 수 없습니다: $nssm" }
if (-not (Test-Path $target)) { throw "orchestrator 스크립트를 찾을 수 없습니다: $target" }
if (Get-Service $svc -ErrorAction SilentlyContinue) {
    throw "$svc 서비스가 이미 존재합니다. 재설치하려면 먼저:  & '$nssm' remove $svc confirm"
}

Write-Host '== 1/5 서비스 등록 + 설정 =='
& $nssm install $svc $py $target
& $nssm set $svc AppDirectory 'D:\naver-estate-web\scripts'
& $nssm set $svc DisplayName 'naver-estate orchestrator'
& $nssm set $svc Description 'naver-estate-web backend 자동시작+watchdog. 부팅 시 자동(로그인 불필요). 세션 363 신설.'
& $nssm set $svc Start SERVICE_DELAYED_AUTO_START   # 부팅 직후 CPU 혼잡(세션 360 실측) 회피
& $nssm set $svc AppRestartDelay 60000              # 종료 시 60초 후 자동 재기동 (health 실패도 자동 재시도)

Write-Host '== 1-b/5 서비스 제어 권한: 사용자 계정에 시작/중지 허용 =='
# 세션 363 훈련 실측: 서비스 프로세스는 UAC 필터링 없는 전체 토큰으로 돌아 비관리자
# 셸의 Stop-Process 가 "액세스 거부"로 실패한다. 비관리자 세션의 zombie 재시작
# (release.md §3)은 Restart-Service 경유가 유일 — 그 권한(조회·시작·중지만, 설정
# 변경·삭제 제외)을 서비스 DACL 에 등록한다. 기본 SD + 사용자 ACE 1개.
$sid = ([System.Security.Principal.NTAccount]"$env:COMPUTERNAME\user").Translate([System.Security.Principal.SecurityIdentifier]).Value
& sc.exe sdset $svc "D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCLCSWLOCRRC;;;IU)(A;;CCLCSWLOCRRC;;;SU)(A;;CCLCSWRPWPDTLOCRRC;;;$sid)"

Write-Host '== 2/5 실행 계정 설정 (사용자 계정 권장) =='
# 사용자 계정으로 돌려야 Claude 세션들이 관리자 승격 없이 프로세스를 종료하고
# nssm 자동재기동으로 되살리는 기존 재시작 워크플로가 유지된다.
$cred = Get-Credential -UserName "$env:COMPUTERNAME\user" -Message 'Windows 로그인 비밀번호 입력 (서비스 실행 계정 설정)'
& $nssm set $svc ObjectName $cred.UserName $cred.GetNetworkCredential().Password
# ⚠ 계정 비밀번호가 없거나 위 단계가 실패하면 SYSTEM 폴백 (단, 이후 backend 재시작에 관리자 권한 필요):
#     & $nssm set naver-orchestrator ObjectName LocalSystem

Write-Host '== 3/5 기존 orchestrator/backend 정리 (서비스가 이어받음) =='
Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='pythonw.exe'" |
    Where-Object { $_.CommandLine -like '*startup_orchestrator*' } |
    ForEach-Object { Write-Host "  기존 orchestrator 종료: PID $($_.ProcessId)"; Stop-Process -Id $_.ProcessId -Force }
$pids = (Get-NetTCPConnection -LocalPort 8002 -ErrorAction SilentlyContinue).OwningProcess | Select-Object -Unique
if ($pids) { $pids | ForEach-Object { Write-Host "  기존 backend 종료: PID $_"; Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }
Start-Sleep -Seconds 3

Write-Host '== 4/5 서비스 시작 + 검증 (약 1분 소요) =='
& $nssm start $svc
Start-Sleep -Seconds 50
Get-Content D:\naver-estate-web\scripts\startup.log -Tail 8
try {
    $health = (Invoke-WebRequest -Uri 'https://api.2u.pe.kr/health/db' -UseBasicParsing).Content
    Write-Host "  외부 health check: $health"       # 기대: {"status":"ok","db":"ok"}
} catch {
    Write-Host "  ⚠ health check 실패(부팅 지연일 수 있음 — nssm 이 60초 간격 자동 재시도): $($_.Exception.Message)"
}

Write-Host '== 5/5 로그인 Startup BAT 비활성화 (중복 기동 방지) =='
$bat = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\startup-server.bat"
if (Test-Path $bat) { Rename-Item $bat 'startup-server.bat.disabled'; Write-Host "  비활성화 완료: $bat.disabled" }
else { Write-Host '  BAT 없음(이미 처리됨)' }

Write-Host '== 설치 완료 =='
Get-Service $svc | Format-Table Name, Status, StartType -AutoSize
# 기대: Status=Running, StartType=Automatic (지연 시작)
# 되돌리기(원상복구):  & $nssm remove naver-orchestrator confirm  후 BAT 이름에서 .disabled 제거

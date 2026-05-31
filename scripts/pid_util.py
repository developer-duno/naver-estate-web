"""PID 생존 판정 유틸 (의존성 0, import 부작용 0).

startup_orchestrator.py 의 중복 실행 방지에서 분리 — 순수 함수라 부작용 없이
테스트 가능 (backend/tests/test_pid_util.py). FileHandler·telegram import 를
끌어오지 않으려 별도 모듈로 둔다.
"""

import csv
import io


def pid_is_live_orchestrator(tasklist_csv_stdout: str, pid: int) -> bool:
    """tasklist /FO CSV /NH 출력에서 pid 가 살아있는 python 오케스트레이터인지 판정.

    CSV 각 행 = "이미지명","PID","세션명","세션#","메모리". PID 컬럼(2번째 필드)을
    정확 비교한다 — `str(pid) in stdout` 부분 문자열 매칭은 메모리 컬럼("113,580 K"
    등)에 pid 숫자가 우연히 포함되면 오판하므로 금지.

    재부팅 후 OS 가 옛 PID 를 무관한 프로세스(예: 크롬 확장)에 재할당하는 PID 재활용
    함정을, 이미지명이 python.exe/pythonw.exe 인지까지 확인해 차단한다. pythonw 도
    허용 — 미래에 Startup BAT 가 콘솔 숨기려 pythonw 로 바꿔도 false-negative(중복
    오케스트레이터) 가 안 생기도록.

    매칭 행이 없으면(= "정보: ...일치하는 작업이 없습니다" 한국어 배너 포함) False.
    """
    for row in csv.reader(io.StringIO(tasklist_csv_stdout)):
        if len(row) >= 2 and row[1].strip() == str(pid):
            image = row[0].strip().lower()
            return image in ("python.exe", "pythonw.exe")
    return False

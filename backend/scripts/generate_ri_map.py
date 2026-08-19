# -*- coding: utf-8 -*-
"""리(里) 코드 맵 재생성 스크립트 — 공시가격 읍/면 확장(PR-E2, 세션 373).

`crawler/cortar_ri_map.py` 의 `RI_CODE_MAP` 을 이 스크립트로 다시 만들 수 있다.
prod DB 는 **읽기 전용 SELECT** 만 하고, 리 코드 원장은 행정표준코드관리시스템
(code.go.kr) 에서 네트워크로 받아온다. `generate_legacy_cortar_map.py` 와 같은
사이트·같은 세션 관례를 쓰되, 캐스케이드가 한 단계(읍면동→리) 더 깊다.

실행 (backend 를 cwd 로):
    cd backend && PYTHONUTF8=1 python scripts/generate_ri_map.py

옵션:
    --print-only   파일을 쓰지 않고 dict 본문만 표준출력에 찍는다.

## 대상 선정

전국 읍/면을 다 훑지 않는다 — 우리 DB 의 공시가격 무매칭 읍/면 동만 골라 그 안의
리 목록을 원장에서 받는다. 대상 조건(APT/JGC, cortar_no 有, 소속 단지 전원 미매칭,
주소 마지막 토큰이 "읍" 또는 "면")은 세션 373 표본조사가 확정한 것과 동일하다.

## 원장 소스

`crawler/cortar_ri_map.py` 모듈 docstring 참조 — riCodeIL.do 엔드포인트 실증 근거.
"""

from __future__ import annotations

import argparse
import re
import sys
import time
from pathlib import Path

import requests

BASE = "https://www.code.go.kr"
ENTRY_URL = BASE + "/stdcode/regCodeL.do"
UMD_URL = BASE + "/stdcode/umdCodeIL.do"
RI_URL = BASE + "/stdcode/riCodeIL.do"
CODESE_ID = "00002"

# 최소 해결 건수 게이트 — 이보다 적으면 파일을 건드리지 않는다. code.go.kr 마크업이
# 바뀌어 파서가 0행을 돌려줘도, 지금 잘 돌고 있는 맵을 빈 dict 로 덮어쓰고 성공
# (exit 0)처럼 끝나는 사고를 막는다(generate_legacy_cortar_map.py MIN_REFORM_ENTRIES
# 답습). 대상 561개 읍/면 중 절반도 못 채우면 원장 접속·파싱에 문제가 있다고 본다.
MIN_TARGET_COVERAGE = 280

TARGET = Path(__file__).resolve().parent.parent / "crawler" / "cortar_ri_map.py"
_MARK_BEGIN = "    # <<< GENERATED-RI-BEGIN (scripts/generate_ri_map.py) >>>"
_MARK_END = "    # <<< GENERATED-RI-END >>>"


def _session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": "Mozilla/5.0", "Referer": ENTRY_URL})
    s.get(ENTRY_URL, timeout=30)
    return s


def _js_arrays(text: str, name_var: str, code_var: str) -> list[tuple[str, str]]:
    """응답 HTML 의 JS 배열 리터럴에서 (코드, 이름) 쌍을 뽑는다.

    generate_legacy_cortar_map.py 의 동명 함수와 완전히 동일 — 파서 로직 중복을
    피하려면 그쪽을 import 하는 게 낫지만, 그 파일은 스크립트(모듈 아님)라 import
    하면 실행부(main)까지 딸려온다. 짧은 순수 함수라 복제 비용이 낮아 이 방식을
    택했다(oss-first 판단 근거 — 공유 모듈 분리는 세 번째 사용처가 생기면 검토).
    """
    nm = re.search(name_var + r'\s*=\s*"([^"]*)"', text)
    cd = re.search(code_var + r'\s*=\s*"([^"]*)"', text)
    names = [x for x in nm.group(1).split(",") if x] if nm else []
    codes = [x for x in cd.group(1).split(",") if x] if cd else []
    if len(names) != len(codes):
        raise RuntimeError(
            "원장 파싱 실패: 이름 %d개 vs 코드 %d개 (사이트 응답 형식이 바뀌었을 수 있다)"
            % (len(names), len(codes))
        )
    return list(zip(codes, names))


def fetch_umd_by_code(s: requests.Session, sido_cd: str, sgg_cd: str) -> list[tuple[str, str]]:
    r = s.post(UMD_URL, data={
        "sidoCd": sido_cd, "sggCd": sgg_cd, "searchOk": 0, "codeseId": CODESE_ID,
        "cPage": 1, "pageSize": 10, "disuseAt": "N",
    }, timeout=30)
    r.raise_for_status()
    return _js_arrays(r.text, "umdNm", "umdCd")


def fetch_ri(s: requests.Session, sido_cd: str, sgg_cd: str, umd_cd: str) -> list[tuple[str, str]]:
    """읍/면동에 따른 리 목록 — code.go.kr 4번째 캐스케이드 (cortar_ri_map.py 실증 근거)."""
    r = s.post(RI_URL, data={
        "sidoCd": sido_cd, "sggCd": sgg_cd, "umdCd": umd_cd, "searchOk": 0,
        "codeseId": CODESE_ID, "cPage": 1, "pageSize": 10, "disuseAt": "N",
    }, timeout=30)
    r.raise_for_status()
    return _js_arrays(r.text, "riNm", "riCd")


def load_target_umd_rows() -> list[dict]:
    """prod DB 에서 공시가격 무매칭 읍/면 동을 읽는다. **SELECT 전용**.

    세션 373 표본조사와 동일 조건: APT/JGC, cortar_no 有, 소속 단지 전원 미매칭,
    주소 마지막 토큰이 "읍"/"면".
    """
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from sqlalchemy import text

    from db.database import SessionLocal

    db = SessionLocal()
    try:
        rows = db.execute(text("""
            SELECT cortar_no, cortar_address, COUNT(*) AS n
            FROM complexes c
            WHERE real_estate_type_code IN ('APT', 'JGC')
              AND cortar_no IS NOT NULL
            GROUP BY cortar_no, cortar_address
            HAVING SUM(CASE WHEN EXISTS (
                SELECT 1 FROM complex_official_prices p WHERE p.complex_no = c.complex_no
            ) THEN 1 ELSE 0 END) = 0
        """)).fetchall()
    finally:
        db.close()

    out = []
    for code, addr, n in rows:
        tail = (addr or "").strip()[-1:] if addr else ""
        if tail in ("읍", "면"):
            out.append({"code": code, "addr": addr, "n": n})
    return out


def render_dict_body(resolved: dict[str, list[str]], rows: list[dict]) -> str:
    """시도별로 대충 묶어 사람이 읽을 수 있는 dict 본문을 만든다."""
    meta = {r["code"]: r for r in rows}
    lines: list[str] = []
    for code in sorted(resolved):
        r = meta[code]
        ri_codes = resolved[code]
        addr = (r["addr"] or "").strip()
        lines.append('    "%s": %s,  # %s (리 %d개)' % (code, ri_codes, addr, len(ri_codes)))
    return "\n".join(lines)


def _splice(src: str, begin: str, end: str, body: str) -> str:
    if begin not in src or end not in src:
        raise RuntimeError("대상 파일에 마커가 없다: %s" % begin)
    head, rest = src.split(begin, 1)
    _, tail = rest.split(end, 1)
    return head + begin + "\n" + body + "\n" + end + tail


def write_into_target(body: str) -> None:
    src = TARGET.read_text(encoding="utf-8")
    src = _splice(src, _MARK_BEGIN, _MARK_END, body)
    # newline="\n" 고정 — 레포 컨벤션이 LF (generate_legacy_cortar_map.py 답습).
    with TARGET.open("w", encoding="utf-8", newline="\n") as f:
        f.write(src)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--print-only", action="store_true",
                    help="파일을 쓰지 않고 dict 본문만 출력")
    args = ap.parse_args()

    print("[1/4] prod DB 에서 공시가격 무매칭 읍/면 동 조회 (읽기 전용)...")
    target_rows = load_target_umd_rows()
    print("      대상 읍/면 %d개 / 단지 %d개"
          % (len(target_rows), sum(r["n"] for r in target_rows)))

    if not target_rows:
        print("      대상 0건 — 무매칭 읍/면이 없다(모두 해소됐거나 조건 불일치). 종료.")
        return 0

    s = _session()

    print("[2/4] 대상 읍/면의 (시도, 시군구) 코드 원장 확보...")
    # sido/sgg 코드가 없으므로 cortar_no 앞자리에서 역산한다. 읍/면 자체 코드는
    # 이미 build_ledger() 형식(sido(2)+sgg(3)+umd(3)+"00")과 동일 — 여기서 다시
    # 캐스케이드를 타지 않고 코드 문자열을 직접 슬라이스한다(사이트 부하 절감).
    resolved: dict[str, list[str]] = {}
    unresolved: list[dict] = []

    print("[3/4] 읍/면동에 따른 리 목록 조회 (code.go.kr)...")
    for idx, row in enumerate(target_rows):
        code = row["code"]
        if len(code) != 10 or not code.isdigit():
            unresolved.append({**row, "reason": "코드 형식 예외"})
            continue
        sido_cd, sgg_cd, umd_cd = code[:2], code[2:5], code[5:8]
        try:
            ri_list = fetch_ri(s, sido_cd, sgg_cd, umd_cd)
        except Exception as e:  # noqa: BLE001 — 네트워크 예외는 미해결로만 남긴다
            unresolved.append({**row, "reason": "%s: %s" % (type(e).__name__, e)})
            continue
        time.sleep(0.15)  # 원장 사이트에 대한 예의 — 초당 폭주 방지

        if not ri_list:
            unresolved.append({**row, "reason": "리 원장에 없음(이미 폐지되었거나 리가 없는 동)"})
            continue

        ri_codes = sorted({cd for cd, _ in ri_list})
        resolved[code] = ri_codes

        if (idx + 1) % 50 == 0:
            print("      진행 %d/%d (해결 %d)" % (idx + 1, len(target_rows), len(resolved)),
                  flush=True)

    print("      해결 %d / 전체 %d" % (len(resolved), len(target_rows)))

    if unresolved:
        print("")
        print("!! 미해결 %d건 — 아래 동은 맵에서 제외된다(리 확장 없이 기존 동작 유지):"
              % len(unresolved))
        for u in sorted(unresolved, key=lambda x: -x["n"])[:30]:
            print("   %s | %s | 단지 %d개 | %s" % (u["code"], u["addr"], u["n"], u["reason"]))
        if len(unresolved) > 30:
            print("   ... 외 %d건" % (len(unresolved) - 30))
        print("")
    else:
        print("      미해결 0건")

    total_ri = sum(len(v) for v in resolved.values())
    print("      총 리 코드 %d개 (읍/면 %d개 평균 %.1f개)"
          % (total_ri, len(resolved), total_ri / len(resolved) if resolved else 0))

    # 무결성 자가검사 — 형식 위반이 파일로 새어나가지 않게.
    bad = [
        (k, v) for k, v in resolved.items()
        if not (len(k) == 10 and k.isdigit() and v and all(len(c) == 2 and c.isdigit() for c in v))
    ]
    if bad:
        print("!! 형식 위반 항목 발견 — 생성 중단: %s" % bad[:5])
        return 1

    if len(resolved) < MIN_TARGET_COVERAGE:
        print("!! 해결 %d건 < 최소 %d건 (원장 접속·파싱 실패 의심) — 기존 파일 유지, 생성 중단"
              % (len(resolved), MIN_TARGET_COVERAGE))
        return 1

    body = render_dict_body(resolved, target_rows)

    if args.print_only:
        print(body)
        return 0

    print("[4/4] %s 갱신..." % TARGET.name)
    write_into_target(body)
    print("      완료: 읍/면 %d개 / 리 %d개" % (len(resolved), total_ri))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

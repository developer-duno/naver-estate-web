# -*- coding: utf-8 -*-
"""LEGACY_CORTAR_MAP 재생성 스크립트 — 12-프리픽스 cortar_no → 표준 법정동코드.

`crawler/cortar_legacy.py` 의 매핑 dict 를 이 스크립트로 다시 만들 수 있다.
prod DB 는 **읽기 전용 SELECT** 만 하고, 표준 코드 원장은 행정표준코드관리시스템
(code.go.kr) 에서 네트워크로 받아온다.

실행 (backend 를 cwd 로):
    cd backend && PYTHONUTF8=1 python scripts/generate_legacy_cortar_map.py

옵션:
    --print-only   파일을 쓰지 않고 dict 본문만 표준출력에 찍는다.

## 원장 소스 (2026-08-09 실측 확정)

행정표준코드관리시스템 https://www.code.go.kr — 법정동코드의 **1차 원본**(행정안전부).
페이지의 시도→시군구→읍면동 캐스케이드 엔드포인트를 그대로 쓴다:

  · /stdcode/sggCodeIL.do  (sidoCd → 시군구 목록)
  · /stdcode/umdCodeIL.do  (sidoCd+sggCd → 읍면동 목록)

두 응답 모두 HTML 안에 `strSggNm/strSggCd`, `umdNm/umdCd` JS 배열로 값을 담아 보낸다.
`disuseAt=N` 을 넘겨 **폐지(말소)된 코드를 제외**한다.

⚠ 대안으로 검토했다가 쓰지 않은 소스 (oss-first 판단 근거):
  · data.go.kr 행정표준코드 법정동코드 오픈API(1741000/StanReginCd) — 우리 계정의
    PUBLIC_DATA_API_KEY 로는 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`(30). 이 API 는
    별도 활용신청이 필요해 지금 당장 못 쓴다. 승인받으면 이쪽이 더 안정적이다.
  · code.go.kr 의 "전체자료 다운로드"(/etc/codeFullDown.do, /stdcode/regCodeFileDown.do)
    — 서버 세션에 저장된 검색조건에 의존해 스크립트로는 빈 xlsx 만 떨어진다.
  · GitHub 미러(FinanceData gist 등) — 2017년 기준으로 낡아 채택하지 않았다.

## 왜 이 매핑이 필요한가 (배경)

`complexes.cortar_no` 는 네이버 응답(cortarNo)을 그대로 저장하는데, 광주광역시·전라남도
단지들은 **sido 코드 12(전남광주통합특별시)** 체계로 들어온다. 12 코드는 행정표준코드에
실재하는 정식 코드지만, V-WORLD 공시가격·국토교통부 실거래가 API 는 아직 옛 체계
(광주=29 / 전남=46)만 받아 12 코드로 조회하면 **0건**이 돌아온다.

매칭 규칙은 (시도, 시군구명, 읍면동명) 정확일치 하나뿐이다 — 코드 산술 변환은 하지
않는다. 12 체계와 29/46 체계는 시군구 코드가 서로 다르기 때문이다
(예: 북구 = 12체계 300 / 29체계 170).
"""

from __future__ import annotations

import argparse
import collections
import re
import sys
import time
from pathlib import Path

import requests

BASE = "https://www.code.go.kr"
SGG_URL = BASE + "/stdcode/sggCodeIL.do"
UMD_URL = BASE + "/stdcode/umdCodeIL.do"
ENTRY_URL = BASE + "/stdcode/regCodeL.do"

# 법정동코드 코드계 ID (행정표준코드관리시스템 내부값)
CODESE_ID = "00002"

# 레거시 체계(네이버가 주는 값) 와 표준 체계(공공 API 가 받는 값) 의 시도 코드
LEGACY_SIDO = "12"  # 전남광주통합특별시
SIDO_BY_NAME = {
    "광주광역시": "29",
    "전라남도": "46",
}

# 출력 파일 — 이 스크립트가 만들어 붙일 dict 본문의 목적지
TARGET = Path(__file__).resolve().parent.parent / "crawler" / "cortar_legacy.py"

_MARK_BEGIN = "    # <<< GENERATED-BEGIN (scripts/generate_legacy_cortar_map.py) >>>"
_MARK_END = "    # <<< GENERATED-END >>>"


def _session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": "Mozilla/5.0", "Referer": ENTRY_URL})
    s.get(ENTRY_URL, timeout=30)  # 세션 쿠키 확보
    return s


def _js_arrays(text: str, name_var: str, code_var: str) -> list[tuple[str, str]]:
    """응답 HTML 의 JS 배열 리터럴에서 (코드, 이름) 쌍을 뽑는다."""
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


def fetch_sigungu(s: requests.Session, sido_cd: str) -> list[tuple[str, str]]:
    r = s.post(SGG_URL, data={
        "sidoCd": sido_cd, "searchOk": 0, "codeseId": CODESE_ID,
        "cPage": 1, "pageSize": 10, "disuseAt": "N",
    }, timeout=30)
    r.raise_for_status()
    return _js_arrays(r.text, "strSggNm", "strSggCd")


def fetch_umd(s: requests.Session, sido_cd: str, sgg_cd: str) -> list[tuple[str, str]]:
    r = s.post(UMD_URL, data={
        "sidoCd": sido_cd, "sggCd": sgg_cd, "searchOk": 0, "codeseId": CODESE_ID,
        "cPage": 1, "pageSize": 10, "disuseAt": "N",
    }, timeout=30)
    r.raise_for_status()
    return _js_arrays(r.text, "umdNm", "umdCd")


def build_ledger(s: requests.Session, sido_cd: str) -> dict[tuple[str, str], list[str]]:
    """(시군구명, 읍면동명) → [10자리 법정동코드, ...] 원장을 만든다.

    같은 키에 코드가 2개 이상이면 **모호**로 보고 매핑에서 제외한다(값 리스트로 보존).
    """
    ledger: dict[tuple[str, str], list[str]] = collections.defaultdict(list)
    for sgg_cd, sgg_nm in fetch_sigungu(s, sido_cd):
        for umd_cd, umd_nm in fetch_umd(s, sido_cd, sgg_cd):
            ledger[(sgg_nm, umd_nm)].append(sido_cd + sgg_cd + umd_cd + "00")
        time.sleep(0.15)  # 원장 사이트에 대한 예의 — 초당 폭주 방지
    return ledger


def load_legacy_rows() -> list[dict]:
    """prod DB 에서 12-프리픽스 단지의 (코드, 시도, 시군구, 주소)를 읽는다. **SELECT 전용**."""
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from sqlalchemy import text

    from db.database import SessionLocal

    db = SessionLocal()
    try:
        rows = db.execute(text("""
            SELECT cortar_no, sido, sigungu, cortar_address, COUNT(*) AS n
            FROM complexes
            WHERE cortar_no LIKE :prefix
            GROUP BY cortar_no, sido, sigungu, cortar_address
            ORDER BY cortar_no
        """), {"prefix": LEGACY_SIDO + "%"}).fetchall()
    finally:
        db.close()

    out = []
    for code, sido, sigungu, addr, n in rows:
        out.append({"code": code, "sido": sido, "sigungu": sigungu, "addr": addr, "n": n})
    return out


def resolve(rows: list[dict], ledgers: dict[str, dict]) -> tuple[dict[str, str], list[dict]]:
    """(시도, 시군구, 읍면동) 정확일치로 표준코드를 찾는다.

    모호하거나(코드 2개 이상) 못 찾으면 **맵에 넣지 않고** 미해결 목록으로 돌려준다 —
    silent 제외 금지(호출부가 시끄럽게 출력한다).
    """
    resolved: dict[str, str] = {}
    unresolved: list[dict] = []

    for row in rows:
        std_sido = SIDO_BY_NAME.get(row["sido"])
        parts = (row["addr"] or "").split()
        if std_sido is None or len(parts) != 3:
            unresolved.append({**row, "reason": "시도 미상 또는 주소 형식 예외"})
            continue

        emd = parts[2]
        candidates = ledgers[std_sido].get((row["sigungu"], emd)) or []
        if len(candidates) == 1:
            resolved[row["code"]] = candidates[0]
        elif len(candidates) > 1:
            unresolved.append({**row, "reason": "모호(원장에 코드 %d개: %s)"
                               % (len(candidates), ",".join(candidates))})
        else:
            unresolved.append({**row, "reason": "원장에 없음 (%s %s)" % (row["sigungu"], emd)})

    return resolved, unresolved


def render_dict_body(resolved: dict[str, str], rows: list[dict]) -> str:
    """시군구별로 묶어 사람이 읽을 수 있는 dict 본문을 만든다."""
    meta = {r["code"]: r for r in rows}
    groups: dict[tuple[str, str], list[tuple[str, str, str]]] = collections.OrderedDict()
    for old in sorted(resolved):
        r = meta[old]
        key = (r["sido"], r["sigungu"])
        groups.setdefault(key, []).append((old, resolved[old], r["addr"].split()[2]))

    lines: list[str] = []
    for (sido, sgg), items in groups.items():
        lines.append("    # %s %s (%d)" % (sido, sgg, len(items)))
        for old, new, emd in items:
            lines.append('    "%s": "%s",  # %s' % (old, new, emd))
    return "\n".join(lines)


def write_into_target(body: str) -> None:
    """cortar_legacy.py 의 GENERATED 마커 사이를 새 본문으로 갈아끼운다."""
    src = TARGET.read_text(encoding="utf-8")
    if _MARK_BEGIN not in src or _MARK_END not in src:
        raise RuntimeError("대상 파일에 GENERATED 마커가 없다: %s" % TARGET)
    head, rest = src.split(_MARK_BEGIN, 1)
    _, tail = rest.split(_MARK_END, 1)
    # newline="\n" 고정 — 레포 컨벤션이 LF 라, 윈도우 기본 CRLF 로 쓰면 diff 가 전 줄로 번진다.
    with TARGET.open("w", encoding="utf-8", newline="\n") as f:
        f.write(head + _MARK_BEGIN + "\n" + body + "\n" + _MARK_END + tail)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--print-only", action="store_true",
                    help="파일을 쓰지 않고 dict 본문만 출력")
    args = ap.parse_args()

    print("[1/4] prod DB 에서 12-프리픽스 단지 조회 (읽기 전용)...")
    rows = load_legacy_rows()
    print("      법정동 %d개 / 단지 %d개" % (len(rows), sum(r["n"] for r in rows)))

    print("[2/4] 표준 법정동코드 원장 수집 (code.go.kr)...")
    s = _session()
    ledgers = {}
    for name, cd in SIDO_BY_NAME.items():
        ledgers[cd] = build_ledger(s, cd)
        print("      %s(%s): 읍면동 %d개" % (name, cd, len(ledgers[cd])))

    print("[3/4] (시도·시군구·읍면동) 정확일치 매칭...")
    resolved, unresolved = resolve(rows, ledgers)
    print("      해결 %d / 전체 %d" % (len(resolved), len(rows)))

    # 미해결은 절대 조용히 넘기지 않는다 — 목록을 전부 찍는다.
    if unresolved:
        print("")
        print("!! 미해결 %d건 — 아래 동은 맵에서 제외된다(원본 코드 그대로 통과):"
              % len(unresolved))
        for u in sorted(unresolved, key=lambda x: -x["n"]):
            print("   %s | %s %s | 단지 %d개 | %s"
                  % (u["code"], u["sido"], u["addr"], u["n"], u["reason"]))
        print("")
    else:
        print("      미해결 0건")

    # 무결성 자가검사 — 생성 단계에서 깨진 값이 파일로 새어나가지 않게.
    bad = [(k, v) for k, v in resolved.items()
           if not (len(k) == 10 and k.startswith(LEGACY_SIDO)
                   and len(v) == 10 and not v.startswith(LEGACY_SIDO))]
    if bad:
        print("!! 형식 위반 항목 발견 — 생성 중단: %s" % bad[:5])
        return 1
    collisions = {c: n for c, n in collections.Counter(resolved.values()).items() if n > 1}
    if collisions:
        print("!! 서로 다른 레거시 코드가 같은 표준코드로 수렴 — 확인 필요: %s" % collisions)
        return 1

    body = render_dict_body(resolved, rows)
    if args.print_only:
        print(body)
        return 0

    print("[4/4] %s 갱신..." % TARGET.name)
    write_into_target(body)
    print("      완료: %d개 항목" % len(resolved))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

# -*- coding: utf-8 -*-
"""cortar 번역맵 재생성 스크립트 — 코드 체계 불일치 → 공공 API 가 받는 코드.

`crawler/cortar_legacy.py` 의 매핑 dict 2개를 이 스크립트로 다시 만들 수 있다.
prod DB 는 **읽기 전용 SELECT** 만 하고, 표준 코드 원장은 행정표준코드관리시스템
(code.go.kr) 에서 네트워크로 받아온다.

생성 대상은 서로 **방향이 반대인 두 맵**이다:

  1. `LEGACY_CORTAR_MAP` — 광주·전남 12-프리픽스(신) → 옛 체계 29/46.
     V-WORLD 공시가격·국토부 실거래가 **양쪽 모두**에 적용된다.
  2. `VWORLD_REFORM_CORTAR_MAP` — 2026 행정구역 개편 신코드 → 폐지된 옛 코드.
     **V-WORLD 공시가격 전용**이다. 국토부 실거래가에 쓰면 안 된다 — 자세한 이유는
     `crawler/cortar_legacy.py` 의 모듈 docstring 참조(라이브 실측 근거 포함).

실행 (backend 를 cwd 로):
    cd backend && PYTHONUTF8=1 python scripts/generate_legacy_cortar_map.py

옵션:
    --print-only   파일을 쓰지 않고 dict 본문만 표준출력에 찍는다.

## 원장 소스 (2026-08-09 실측 확정 / 2026-08-16 개편분 보강)

행정표준코드관리시스템 https://www.code.go.kr — 법정동코드의 **1차 원본**(행정안전부).
페이지의 시도→시군구→읍면동 캐스케이드 엔드포인트를 그대로 쓴다:

  · /stdcode/sggCodeIL.do  (sidoCd → 시군구 목록)
  · /stdcode/umdCodeIL.do  (sidoCd+sggCd → 읍면동 목록)

두 응답 모두 HTML 안에 `strSggNm/strSggCd`, `umdNm/umdCd` JS 배열로 값을 담아 보낸다.
`disuseAt=N` 을 넘겨 **폐지(말소)된 코드를 제외**한다.

⚠ 이 캐스케이드는 **현존 코드만** 보여준다 — 2026 개편으로 폐지된 옛 코드는 여기서
안 나온다(2026-08-16 실측: 화성시 41590 의 읍면동 목록이 0건). 그래서 개편맵의
"옛 코드" 쪽은 아래 검색 엔드포인트를 쓴다:

  · /stdcode/regCodeL.do  (locataddNm 로 법정동명 **완전일치** 검색)

이 폼은 `disuseAt` 값이 캐스케이드와 **다르다** — `ALL`(전체) / `0`(현존) / `1`(폐지)
이다(캐스케이드의 `N`/`Y` 를 여기 넘기면 조용히 무시된다). 폐지 코드를 보려면
`disuseAt=ALL` 이어야 한다. 2026-08-16 실측:

    locataddNm="인천광역시 서구 석남동" → 2826011000 (폐지)
    locataddNm="경기도 화성시 반송동"   → 4159012700 (폐지)

⚠ 접두 검색이 아니라 **완전일치**다 — "경기도 화성시" 로 넣으면 시 자신 1건만 온다.
그래서 동 단위로 한 번씩 조회할 수밖에 없고, 그만큼 throttle 을 지킨다.

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

## 2026 행정구역 개편 (인천 3구 신설·화성 4구 신설)

2026-02-01 화성시가 만세/효행/병점/동탄 4구로, 2026-07-01 인천이 제물포/영종/검단구
신설(+서구→서해구 개편)로 바뀌었다. 네이버는 신 코드를 주는데 V-WORLD 공시가격은
아직 옛 코드에만 데이터가 붙어 있어 **조용히 0건**이 온다 — 광주·전남과 같은 결이다.

여기 매칭 규칙은 광주·전남과 다르다. 개편맵은 **같은 시도 안에서 읍면동명 정확일치가
유일할 때만** 채택한다. 신구의 모체가 어느 옛 시군구였는지는 코드에 하드코딩하지 않고
(그 지식 자체가 틀리기 쉽다) 이름으로 찾되, 같은 시도 안에 동명이 2개 이상이면
**맵에서 뺀다**(원본 통과 = 기존 동작 유지). 광주 선례의 보수 원칙 그대로다.

⚠ 개편맵은 **값 중복(N→1)을 허용**한다 — 광주·전남 맵과 다른 점이다. 옛 동 하나가
개편으로 두 구에 쪼개져 들어간 경우가 실재하기 때문이다(2026-08-16 실측: 옛 화성시
능동 4159011800 → 병점구 능동 4159510300 + 동탄구 능동 4159710100. 서동탄 쪽과
동탄신도시 쪽이 갈라졌다). 둘 다 같은 옛 코드를 조회하는 게 **맞는 동작**이라
충돌로 보고 막으면 안 된다. 키 중복만 불가하다(dict 특성상 자동).
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
# ENTRY_URL 은 세션 쿠키 프라이밍 겸 **법정동명 완전일치 검색** 엔드포인트다
# (폐지 코드까지 보려면 여기로 — 캐스케이드는 현존만 준다). 같은 URL 을 상수 2개로
# 나눠 두면 URL 이 바뀔 때 한쪽만 고쳐져 쿠키와 검색이 갈라지므로 하나로 둔다.
ENTRY_URL = BASE + "/stdcode/regCodeL.do"

# 법정동코드 코드계 ID (행정표준코드관리시스템 내부값)
CODESE_ID = "00002"

# 레거시 체계(네이버가 주는 값) 와 표준 체계(공공 API 가 받는 값) 의 시도 코드
LEGACY_SIDO = "12"  # 전남광주통합특별시
SIDO_BY_NAME = {
    "광주광역시": "29",
    "전라남도": "46",
}

# ── 2026 행정구역 개편 (신설 구) ──
# 네이버가 주는 신 시군구 코드(5자리). prod 실측으로 확정한 목록이다.
REFORM_SIGUNGU = {
    "28": ["28125", "28155", "28275", "28290"],  # 인천 제물포·영종·서해·검단구
    "41": ["41591", "41593", "41595", "41597"],  # 화성 만세·효행·병점·동탄구
}
# 옛 코드를 찾을 때 붙일 시도 표기 (code.go.kr 검색어 조립용)
REFORM_SIDO_NAME = {"28": "인천광역시", "41": "경기도"}
# 옛 코드가 소속됐을 수 있는 시군구 후보. 모체를 하나로 단정하지 않고 넓게 훑은 뒤
# "유일할 때만 채택" 규칙으로 좁힌다 (모체 하드코딩은 틀리기 쉬워 피한다).
REFORM_OLD_SIGUNGU = {
    "28": ["중구", "동구", "미추홀구", "연수구", "남동구", "부평구", "계양구", "서구"],
    "41": ["화성시"],
}
# 개편맵 최소 해결 건수 게이트. 이보다 적으면 **파일을 건드리지 않는다** —
# code.go.kr 마크업이 바뀌어 파서가 0행을 돌려줘도, 지금 잘 돌고 있는 맵을 빈 dict 로
# 덮어쓰고 성공(exit 0)처럼 끝나는 사고를 막는다. 실제 생성 결과는 84건이라 여유가 있다.
MIN_REFORM_ENTRIES = 75

# 출력 파일 — 이 스크립트가 만들어 붙일 dict 본문의 목적지
TARGET = Path(__file__).resolve().parent.parent / "crawler" / "cortar_legacy.py"

_MARK_BEGIN = "    # <<< GENERATED-BEGIN (scripts/generate_legacy_cortar_map.py) >>>"
_MARK_END = "    # <<< GENERATED-END >>>"
_MARK_REFORM_BEGIN = "    # <<< GENERATED-REFORM-BEGIN (scripts/generate_legacy_cortar_map.py) >>>"
_MARK_REFORM_END = "    # <<< GENERATED-REFORM-END >>>"


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


def search_by_name(s: requests.Session, locatadd_nm: str) -> list[tuple[str, str, str]]:
    """법정동명 **완전일치** 검색 → [(10자리코드, 법정동명, '현존'|'폐지'), ...].

    폐지 코드까지 보려면 `disuseAt=ALL` 이어야 한다 — 이 폼은 캐스케이드와 값 체계가
    달라서(`ALL`/`0`/`1`), 캐스케이드용 `N`/`Y` 를 넘기면 조용히 무시된다.
    """
    r = s.post(ENTRY_URL, data={
        "cPage": 1, "pageSize": 200, "codeseId": CODESE_ID, "searchOk": "1",
        "regionCd": "", "locataddNm": locatadd_nm, "disuseAt": "ALL",
    }, timeout=60)
    r.raise_for_status()
    time.sleep(0.15)  # 원장 사이트에 대한 예의 — 동 단위 반복 조회라 특히 지킨다

    out: list[tuple[str, str, str]] = []
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", r.text, re.S):
        cells = [
            re.sub(r"<[^>]+>", "", c).replace("&nbsp;", "").strip()
            for c in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
        ]
        if len(cells) >= 3 and re.fullmatch(r"\d{10}", cells[0] or ""):
            out.append((cells[0], cells[1], cells[2]))
    return out


def load_reform_rows() -> list[dict]:
    """prod DB 에서 2026 개편 신코드 단지를 **cortar_no 1행씩** 읽는다.

    **SELECT 전용**. 주의: `sigungu` 컬럼에는 네이버가 아직 **옛 구 이름**(중구·서구·
    화성시)을 담고 있고, 신 구 이름은 `cortar_address` 에만 들어 있다(2026-08-16 실측).
    그래서 아래 매칭은 sigungu 를 안 믿고 주소 **마지막 토큰**(읍면동명)만 쓴다.

    같은 cortar_no 가 주소 표기 변형(공백·시도명 축약 등)으로 여러 행이 될 수 있다.
    그대로 두면 dict 조립이 last-write-wins 라 **재생성 때마다 결과가 달라질 수** 있고,
    주소가 빈 행이 이기면 렌더러의 `parts[-1]` 이 IndexError 를 낸다. 그래서 여기서
    코드당 1행으로 합친다:

      · 주소가 있는 행을 우선, 그중 단지 수(n)가 많은 행을 대표로 (결정적 선택)
      · 변형끼리 **읍면동명(마지막 토큰)이 서로 다르면** 대표를 못 고른다 →
        `conflict` 로 표시해 호출부가 unresolved 로 보내게 한다(오매칭 방지)

    ⚠ 여기서 합치는 건 **같은 cortar_no 안**의 중복뿐이다. 서로 다른 신코드 2개가
    같은 옛 코드를 갖는 N→1(능동 사례)은 정상이라 손대지 않는다.
    """
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from sqlalchemy import text

    from db.database import SessionLocal

    codes = [c for v in REFORM_SIGUNGU.values() for c in v]
    db = SessionLocal()
    try:
        rows = db.execute(text("""
            SELECT cortar_no, sido, sigungu, cortar_address, COUNT(*) AS n
            FROM complexes
            WHERE LEFT(cortar_no, 5) = ANY(:codes)
            GROUP BY cortar_no, sido, sigungu, cortar_address
            ORDER BY cortar_no
        """), {"codes": codes}).fetchall()
    finally:
        db.close()

    variants: dict[str, list[dict]] = collections.OrderedDict()
    for code, sido, sigungu, addr, n in rows:
        variants.setdefault(code, []).append(
            {"code": code, "sido": sido, "sigungu": sigungu, "addr": addr, "n": n}
        )

    out: list[dict] = []
    for code, group in variants.items():
        total = sum(g["n"] for g in group)
        # 읍면동명(마지막 토큰) 집합 — 주소가 있는 변형만 본다
        emds = {(g["addr"] or "").split()[-1] for g in group if (g["addr"] or "").split()}
        if not emds:
            out.append({**group[0], "n": total, "conflict": "주소 없음"})
            continue
        if len(emds) > 1:
            out.append({**group[0], "n": total,
                        "conflict": "주소 변형 간 읍면동명 불일치(%s)" % ",".join(sorted(emds))})
            continue
        # 결정적 대표 선택: 주소 있는 것 우선 → 단지 수 많은 것 → 주소 문자열 순
        best = sorted(
            (g for g in group if (g["addr"] or "").split()),
            key=lambda g: (-g["n"], g["addr"]),
        )[0]
        out.append({**best, "n": total})

    return out


def resolve_reform(s: requests.Session, rows: list[dict]) -> tuple[dict[str, str], list[dict]]:
    """개편 신코드 → 폐지된 옛 코드. 같은 시도 안 읍면동명 **유일일치**만 채택.

    후보를 채택하기 전 두 겹으로 거른다:

      1. **폐지(disused) 코드만** 후보로 본다. 옛 시군구 후보 목록(REFORM_OLD_SIGUNGU)
         에는 개편과 무관하게 **존속하는 구**가 섞여 있다(인천 미추홀·연수·남동·부평·
         계양). 살아있는 남의 동 코드를 채택하면 **엉뚱한 지역의 공시가격**을 긁게 되는데,
         이건 0건보다 나쁘다 — 이 모듈의 원칙은 "틀린 값 < 값 없음"이다. 개편으로 대체된
         옛 코드는 정의상 폐지 상태이므로(2026-08-16 실측 확인) 현존 코드는 후보가 아니다.
      2. **에코 검증** — 응답의 법정동명 마지막 토큰이 조회한 동명과 실제로 같은지 본다.
         검색이 완전일치라 보통 같지만, 사이트가 유사일치로 바뀌거나 마크업이 밀려
         엉뚱한 셀을 읽으면 이 가드가 잡는다.

    미해결(모호·원장에 없음)은 맵에 넣지 않고 목록으로 돌려준다 — 원본 그대로 통과해
    기존 동작(0건)을 유지할 뿐 새로 깨지지는 않는다.
    """
    resolved: dict[str, str] = {}
    unresolved: list[dict] = []

    for row in rows:
        # load_reform_rows 가 대표를 못 고른 코드(주소 변형 충돌 등)는 즉시 제외
        if row.get("conflict"):
            unresolved.append({**row, "reason": "주소 변형 충돌 — %s" % row["conflict"]})
            continue

        sido_cd = row["code"][:2]
        parts = (row["addr"] or "").split()
        if sido_cd not in REFORM_OLD_SIGUNGU or not parts:
            unresolved.append({**row, "reason": "시도 미상 또는 주소 형식 예외"})
            continue

        emd = parts[-1]  # 신 구 이름이 주소 중간에 끼므로 **마지막 토큰**이 읍면동명
        hits: list[tuple[str, str, str]] = []
        skipped_alive = 0
        skipped_echo = 0
        for old_sgg in REFORM_OLD_SIGUNGU[sido_cd]:
            for hit in search_by_name(s, "%s %s %s" % (REFORM_SIDO_NAME[sido_cd], old_sgg, emd)):
                code, name, status = hit
                if code[:2] != sido_cd or code == row["code"]:
                    continue
                if status != "폐지":
                    skipped_alive += 1  # 존속 구의 현존 동 — 오매핑 방지로 후보 제외
                    continue
                if (name or "").split()[-1:] != [emd]:
                    skipped_echo += 1  # 응답 동명이 조회 동명과 다름 — 파서/사이트 이상
                    continue
                hits.append(hit)

        if len(hits) == 1:
            resolved[row["code"]] = hits[0][0]
        elif len(hits) > 1:
            unresolved.append({**row, "reason": "모호(폐지 원장에 코드 %d개: %s)"
                               % (len(hits), ",".join(h[0] for h in hits))})
        else:
            detail = "개편 후 신설 동일 수 있다"
            if skipped_alive or skipped_echo:
                detail = "현존코드 %d건·동명불일치 %d건 제외됨" % (skipped_alive, skipped_echo)
            unresolved.append({**row, "reason": "옛 폐지 원장에 없음 (%s) — %s" % (emd, detail)})

    return resolved, unresolved


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


def render_reform_dict_body(resolved: dict[str, str], rows: list[dict]) -> str:
    """개편맵 dict 본문 — 신 구 이름별로 묶는다(주소에서 뽑은 실제 구 이름 기준)."""
    meta = {r["code"]: r for r in rows}
    groups: dict[str, list[tuple[str, str, str]]] = collections.OrderedDict()
    for new in sorted(resolved):
        r = meta[new]
        parts = (r["addr"] or "").split()
        # 주소 마지막 토큰이 읍면동명, 그 앞이 신 구 이름 (없으면 DB sigungu 로 폴백)
        gu = parts[-2] if len(parts) >= 2 else (r["sigungu"] or "")
        groups.setdefault("%s %s" % (r["sido"], gu), []).append((new, resolved[new], parts[-1]))

    lines: list[str] = []
    for label, items in groups.items():
        lines.append("    # %s (%d)" % (label, len(items)))
        for new, old, emd in items:
            lines.append('    "%s": "%s",  # %s' % (new, old, emd))
    return "\n".join(lines)


def _splice(src: str, begin: str, end: str, body: str) -> str:
    """마커 사이를 새 본문으로 갈아끼운다."""
    if begin not in src or end not in src:
        raise RuntimeError("대상 파일에 마커가 없다: %s" % begin)
    head, rest = src.split(begin, 1)
    _, tail = rest.split(end, 1)
    return head + begin + "\n" + body + "\n" + end + tail


def write_into_target(body: str, reform_body: str | None = None) -> None:
    """cortar_legacy.py 의 GENERATED 마커 사이를 새 본문으로 갈아끼운다."""
    src = TARGET.read_text(encoding="utf-8")
    src = _splice(src, _MARK_BEGIN, _MARK_END, body)
    if reform_body is not None:
        src = _splice(src, _MARK_REFORM_BEGIN, _MARK_REFORM_END, reform_body)
    # newline="\n" 고정 — 레포 컨벤션이 LF 라, 윈도우 기본 CRLF 로 쓰면 diff 가 전 줄로 번진다.
    with TARGET.open("w", encoding="utf-8", newline="\n") as f:
        f.write(src)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--print-only", action="store_true",
                    help="파일을 쓰지 않고 dict 본문만 출력")
    args = ap.parse_args()

    print("[1/6] prod DB 에서 12-프리픽스 단지 조회 (읽기 전용)...")
    rows = load_legacy_rows()
    print("      법정동 %d개 / 단지 %d개" % (len(rows), sum(r["n"] for r in rows)))

    print("[2/6] 표준 법정동코드 원장 수집 (code.go.kr)...")
    s = _session()
    ledgers = {}
    for name, cd in SIDO_BY_NAME.items():
        ledgers[cd] = build_ledger(s, cd)
        print("      %s(%s): 읍면동 %d개" % (name, cd, len(ledgers[cd])))

    print("[3/6] (시도·시군구·읍면동) 정확일치 매칭...")
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

    # ── 2026 행정구역 개편 (V-WORLD 전용 맵) ──
    # ⚠ 여기서 나는 실패가 **위에서 이미 검증을 마친 레거시 결과를 인질로 잡으면 안 된다.**
    # [5/6] 은 동 단위로 수백 번 POST 하므로 1회 타임아웃 확률이 낮지 않은데, 그때 레거시
    # 결과까지 통째로 버리면 개편맵 도입 이전(레거시만 쓰던 시절)보다 오히려 후퇴한다.
    # 그래서 개편 단계는 통째로 예외 격리하고, 실패해도 레거시는 파일에 반영한다.
    # 다만 **종료 코드는 실패(1)** 로 남겨 CI·사람이 "반쪽만 갱신됐다"를 알아채게 한다.
    reform_body: str | None = None
    reform_failed_reason: str | None = None
    reform_resolved: dict[str, str] = {}
    try:
        print("[4/6] prod DB 에서 2026 개편 신코드 단지 조회 (읽기 전용)...")
        reform_rows = load_reform_rows()
        print("      법정동 %d개 / 단지 %d개"
              % (len(reform_rows), sum(r["n"] for r in reform_rows)))

        print("[5/6] 폐지 원장에서 옛 코드 역추적 (code.go.kr 완전일치 검색)...")
        reform_resolved, reform_unresolved = resolve_reform(s, reform_rows)
        print("      해결 %d / 전체 %d" % (len(reform_resolved), len(reform_rows)))

        if reform_unresolved:
            print("")
            print("!! 개편맵 미해결 %d건 — 아래 동은 맵에서 제외된다(원본 그대로 통과):"
                  % len(reform_unresolved))
            for u in sorted(reform_unresolved, key=lambda x: -x["n"]):
                print("   %s | %s | 단지 %d개 | %s" % (u["code"], u["addr"], u["n"], u["reason"]))
            print("")

        # 개편맵 무결성 자가검사 — 키/값 10자리, 자기참조 없음.
        # ⚠ 값 중복은 **검사하지 않는다** — 옛 동 하나가 두 신 구로 쪼개진 정상 사례가
        #   있다(모듈 docstring 의 능동 사례). 광주·전남 맵과 다른 점이다.
        reform_bad = [
            (k, v) for k, v in reform_resolved.items()
            if not (len(k) == 10 and k.isdigit() and len(v) == 10 and v.isdigit() and k != v)
        ]
        if reform_bad:
            reform_failed_reason = "형식 위반 항목 %s" % (reform_bad[:5],)
        elif len(reform_resolved) < MIN_REFORM_ENTRIES:
            # 최소 건수 게이트 — 빈/반쪽 맵으로 기존 맵을 덮는 사고 차단.
            reform_failed_reason = (
                "해결 %d건 < 최소 %d건 (파서가 원장을 못 읽었을 가능성 — "
                "code.go.kr 마크업 변경 의심)" % (len(reform_resolved), MIN_REFORM_ENTRIES)
            )
        else:
            reform_body = render_reform_dict_body(reform_resolved, reform_rows)
    except Exception as e:  # noqa: BLE001 — 어떤 실패든 레거시 쓰기는 살린다
        reform_failed_reason = "%s: %s" % (type(e).__name__, e)

    if reform_failed_reason:
        print("")
        print("!! 개편맵 생성 실패 — %s" % reform_failed_reason)
        print("   → 개편맵은 **건드리지 않는다**(기존 값 유지). 레거시 맵만 갱신하고"
              " 종료 코드는 실패(1)로 남긴다.")
        print("")

    if args.print_only:
        print(body)
        print("")
        print("# ── 개편맵 ──")
        print(reform_body if reform_body is not None else "# (생성 실패 — 기존 값 유지)")
        return 1 if reform_failed_reason else 0

    print("[6/6] %s 갱신..." % TARGET.name)
    write_into_target(body, reform_body)
    print("      완료: 레거시 %d개 / 개편 %s"
          % (len(resolved),
             "%d개 항목" % len(reform_resolved) if reform_body is not None else "미갱신(기존 유지)"))
    return 1 if reform_failed_reason else 0


if __name__ == "__main__":
    raise SystemExit(main())

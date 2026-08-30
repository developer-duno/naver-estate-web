"""K-apt 관리비 수집 — 단지 매칭(월 1회) + 월별 관리비 수집(매일).

잡 2개:
  match_kapt_complexes()  전국 K-apt 목록 ↔ 우리 단지 매칭 → kapt_complex_map
  collect_kapt_costs()    매칭된 단지의 월별 관리비 수집 → kapt_management_costs

매칭 3중 게이트 (보수 원칙 — 오매칭은 "남의 단지 관리비"를 보여주는 치명적 결함):
  ① 법정동 일치   kapt bjdCode(10자리) == complexes.cortar_no
  ② 이름 유사도   분류 꼬리표(주상복합·도시형·민간임대…) 제거 후 difflib ratio,
                  같은 법정동 최고점 1개만, 최고점 동률이 둘 이상이면 탈락
  ③ 세대수 근사   양쪽 세대수 보유 시 |차이|/max <= 0.15 (임계 0.6),
                  **끝내** 대조 불가면 임계를 0.85 로 강화(한쪽이 다른 쪽을 통째로
                  품는 포함 관계면 0.6) + 차수 정보가 한쪽에 치우치면 모호로 탈락
                  ⚠ 세대수 게이트도, 그 "대조 불가 강화 규칙"도 실제 발동 지점은
                  pick_best_match 가 아니라 **basis(getAphusBassInfoV5) 수신 직후**다
                  — 목록 API(getTotalAptList4)는 kaptdaCnt 를 안 주므로 후보 선별
                  단계에선 **모든 단지**가 "아직 모름"이고, 거기서 강화 규칙을 걸면
                  basis 를 받으면 통과했을 정답까지 잘려나간다(2026-08-31 prod 실측
                  746건 오탈락). 세대수를 실제로 아는 건 확정분에 basis 를 부른
                  뒤뿐이다(라이브 실측: 목록 응답 키 = kaptCode/kaptName/bjdCode/as1~as4).
  ④ 차수 모순     양쪽 차수(N차·N단지·N블록)가 서로 부분집합이 아니면 점수·세대수
                  불문 탈락 — 형제 단지는 세대수까지 비슷해 ③으로는 못 거른다.
                  부분집합({2} ⊂ {2,7})은 "한쪽이 시공 차수를 더 적은 것"이라
                  모순이 아니므로 ③의 세대수 게이트가 결정한다.

세 게이트 모두 "애매하면 버린다"는 방향으로 설계했다 — 놓친 단지는 관리비가
안 보일 뿐이지만, 잘못 붙인 단지는 틀린 금액을 사실처럼 보여준다.
"""

import logging
import re
from datetime import date, datetime, timezone
from difflib import SequenceMatcher

from crawler.env_common import _complete_job, _fail_job, _record_job
from crawler.kapt_api import (
    KaptApiError,
    fetch_apt_basis_info,
    fetch_apt_list_page,
    fetch_common_cost,
    fetch_individual_cost,
)
from db.database import SessionLocal
from db.models import Complex, KaptComplexMap, KaptManagementCost
from services.upsert import _do_upsert
from utils import utcnow

logger = logging.getLogger(__name__)

# ── 매칭 게이트 임계 ──
_NAME_RATIO_MIN = 0.6
# 세대수를 대조할 수 없을 때(한쪽이 NULL) 쓰는 강화 임계 — 이름만으로 판단해야
# 하므로 더 엄격하게 본다.
#
# ⚠ 0.75 → 0.85 상향(2026-08-29). prod 실측에서 K-apt 세대수가 0/NULL 이라 이름만으로
# 붙은 533건 중 점수 0.9 미만 165건에 오매칭이 다수 섞여 있었다("엠시티(주상복합)" ↔
# "포시티주상복합" 0.857, "성신2차" ↔ "신한2차아파트" 0.75, "우아효성" ↔ "우아우성" 0.75).
# 0.75~0.85 구간은 "글자 몇 개만 다른 남남"이 사는 구간이라 이름만으로는 못 가른다.
_NAME_RATIO_MIN_NO_HOUSEHOLD = 0.85
# 대조 불가 + 임계 미달이어도, **한쪽이 다른 쪽을 통째로 품으면** 이 완화 임계를 쓴다.
# 지역·동명 접두어가 붙은 같은 단지("강릉송정신원아침도시" ↔ "신원아침도시")는 글자 수
# 차이 때문에 difflib 점수가 0.75 언저리로 낮게 나오는데, 포함 관계 자체가 강한 증거다.
# 포함이라는 구조적 조건이 이미 서 있으므로 점수 문턱은 기본값(0.6)까지 내린다.
_NAME_RATIO_MIN_SUBSTRING = _NAME_RATIO_MIN
# 부분포함 최소 길이 — 짧은 쪽이 이보다 짧으면 아무 이름에나 걸려 폭발한다
# (자매 수집기 service_official_price._PARTIAL_MIN_LEN 과 같은 취지·같은 값).
_SUBSTRING_MIN_LEN = 3
_HOUSEHOLD_TOLERANCE = 0.15

# 차수 신호 — "2차 / 2단지 / 2블록 / 2BL". 형제 단지를 가르는 결정적 축이라
# 이름 유사도와 별개로 본다(`ordinal_tokens`).
_ORDINAL_RE = re.compile(r"(\d+)\s*(?:차|단지|블록|블럭|bl)", re.IGNORECASE)

_LIST_PAGE_SIZE = 1000
# 페이지네이션 폭주 방지 상한. 전국 22,288단지 / 1000 = 23페이지라 넉넉하다
# (API 가 totalCount 를 잘못 주거나 items 가 끝없이 반복될 때의 안전핀).
_MAX_LIST_PAGES = 100

# 관리비 공개까지의 지연(개월). 2026-08-27 라이브 실측 = 202605 가 최신
# (당월-3). 스펙 초안의 "2개월"보다 한 달 더 늦어, 여유를 둬 3개월 전부터
# 거꾸로 훑는다.
_COST_LAG_MONTHS = 3
# 최신 공개월을 못 찾을 때 거슬러 올라가며 시도할 개월 수.
_COST_MONTH_TRIES = 3

# 매칭 중간 저장 주기(단지 수). 매칭 확정분마다 basis 1콜(0.3s throttle)이 나가
# 전체가 1~2h+ 도는데, 끝에서 한 번만 commit 하면 크래시·재시작 sweep 한 방에
# 전량이 날아간다. upsert 라 재실행이 안전해 부분 저장에 부작용이 없다.
_MATCH_COMMIT_EVERY = 200

# "대상 전량이 빈 응답" 을 API 장애로 판정하기 위한 최소 표본 수.
# 이보다 적으면 개별 단지의 정상적인 미공개와 구분되지 않아 판정을 보류한다
# (정상 배치는 500 이라 실제 장애는 이 임계를 여유 있게 넘는다).
_ALL_EMPTY_MIN_TARGETS = 10

# "연속 N단지 전 op 실패" 조기 중단 임계.
# 쿼터 초과(22)는 `is_quota` 로 즉시 중단되지만, data.go.kr 은 **에러를 XML 로 주는
# 엔드포인트가 있어** 그 경우 `resp.json()` 이 터져 call_api 가 None → 코드 미상 실패로
# 도착한다(kapt_api._body_or_raise docstring). 즉 진짜 한도 초과·서비스 전면 장애인데도
# is_quota 가 안 서서, 남은 단지(최대 250)에 22콜씩 헛호출을 끝까지 하게 된다.
# 무결성은 유지되지만(실패는 저장 안 함) 시간·재시도 예산이 통째로 낭비된다.
# 개별 단지의 일시적 실패와 구분하려고 "연속" 으로 세고, 한 건이라도 성공하면 리셋한다.
_CONSECUTIVE_FAILURE_LIMIT = 5

_MATCH_JOB_TYPE = "kapt_match"
_COST_JOB_TYPE = "kapt_costs"

# 이름 정규화에서 제거할 것들 — 괄호 기호, 공백, 흔한 접미사.
# ⚠ 괄호 "안의 내용"을 통째로 지우면 안 된다 — K-apt 가 "경희궁의아침(4단지)" 처럼
# 차수를 괄호 안에 넣어 표기해서, 내용을 지우면 1단지·4단지가 같은 정규형이 되어
# 형제 단지 오매칭이 난다(구현 중 테스트로 발견). 괄호 기호만 떼고 안의 글자는 남긴다.
_PAREN_RE = re.compile(r"[()（）\[\]]")
_NON_NAME_RE = re.compile(r"[\s\-·,.]")
_APT_SUFFIX_RE = re.compile(r"(아파트|APT)$", re.IGNORECASE)

# ── 분류 꼬리표(내용째 제거) ──
# 우리 DB 이름에만 붙는 **건물 종류 분류**다. K-apt 이름엔 없어서, 남겨두면 같은
# 단지인데도 유사도가 통째로 깎인다(실측: "빌리브라디체(주상복합)" ↔ "빌리브라디체"
# = 0.75 로 경계까지 추락, "보령더포레젠(민간임대)" ↔ "보령 더포레젠" 도 0.75).
# 그 낮은 점수대에 진짜 오매칭("공간라움(주상복합)" ↔ "더라움엠주상복합아파트" 0.75)이
# 섞여 있어 임계만으로는 정답과 오답을 가를 수 없었다 — 꼬리표를 걷어내야 정답이
# 0.9+ 로 올라가고 바닥에 오답만 남는다.
#
# 목록은 **prod 실측으로 확정한 닫힌 집합**이다(2026-08-29):
#   우리 이름(complexes APT·JGC 48,202건) — 전부 괄호 안에만 등장한다
#     주상복합 6,341 / 도시형 6,020 / 민간임대 479 / 주거복합 15 / 실버주택 10
#   K-apt 이름(kapt_complex_map 11,803건) — 전부 **괄호 없이** 본문에 붙어 온다
#     주상복합 52 / 도시형생활주택 13 / 도시형 14
# ⚠ 그래서 "괄호 안만" 지우면 안 된다 — 우리 쪽만 지워지고 K-apt 쪽은 남아 오히려
# 격차가 벌어진다(드라이런 실측: "대산(주상복합)" ↔ "대산주상복합아파트" 가 1.000
# → 0.500 으로 추락. 세대수 130/131 로 같은 단지인데 오탈락). **괄호 유무와 무관하게
# 분류어 자체를 양쪽에서 제거**해야 두 표기가 같은 축에 놓인다.
#
# 나머지 괄호 내용(동 101동·A동, 차수 2차, 번지 69-1)은 그대로 **보존**한다 —
# 지우면 형제 단지가 같은 정규형이 된다(위 경고 참조).
# 긴 것부터 지운다 — "도시형생활주택" 을 "도시형" 이 먼저 먹으면 "생활주택" 이 남는다.
_CATEGORY_TAGS = (
    "도시형생활주택",
    "주상복합",
    "주거복합",
    "실버주택",
    "민간임대",
    "도시형",
)
_CATEGORY_TAG_RE = re.compile("|".join(_CATEGORY_TAGS))


def _strip_category_tags(name: str) -> str:
    """분류 꼬리표를 괄호 유무와 무관하게 제거 — 동·차수 등 나머지는 보존.

    "빌리브라디체(주상복합)"      → "빌리브라디체()"        (뒤이어 괄호 기호가 제거됨)
    "대산주상복합아파트"           → "대산아파트"            (K-apt 무괄호 표기)
    "루체스타 도시형생활주택"       → "루체스타 "
    "래미안(101동,주상복합)"      → "래미안(101동,)"        (동은 남는다)
    "경희궁의아침(4단지)"         → "경희궁의아침(4단지)"   (무변경)

    빈 괄호·잔여 콤마는 뒤따르는 `_PAREN_RE`·`_NON_NAME_RE` 가 정리하므로
    여기서 따로 다듬지 않는다(정규화 단계 하나가 한 가지 일만 하게 둔다).
    """
    return _CATEGORY_TAG_RE.sub("", name)


def normalize_complex_name(name: str | None) -> str:
    """단지명 비교용 정규형 — 분류 꼬리표·괄호 기호·공백·'아파트' 접미사 제거.

    K-apt 와 네이버가 같은 단지를 "경희궁의아침4단지" / "경희궁의아침(4단지)"
    처럼 다르게 표기하므로, 표기 차이를 걷어낸 뒤 유사도를 잰다.

    두 가지를 **다르게** 다룬다:
      · 분류 꼬리표(주상복합·도시형생활주택·민간임대…)는 **괄호 유무와 무관하게
        제거** — 우리는 "(주상복합)", K-apt 는 "주상복합" 으로 같은 뜻을 다르게
        표기해서, 한쪽만 지우면 격차가 오히려 벌어진다.
      · 그 외 괄호 내용(차수 "(4단지)", 동 "(101동)")은 기호만 떼고 **내용 보존** —
        차수 숫자는 형제 단지를 가르는 결정적 신호라 지우면 1단지와 4단지가
        100% 일치해버린다.
    """
    if not name:
        return ""
    text = _strip_category_tags(name)
    text = _PAREN_RE.sub("", text)
    text = _NON_NAME_RE.sub("", text)
    text = _APT_SUFFIX_RE.sub("", text)
    return text.strip().lower()


def name_similarity(a: str | None, b: str | None) -> float:
    """정규화 후 difflib 유사도 0~1. 한쪽이 비면 0."""
    na, nb = normalize_complex_name(a), normalize_complex_name(b)
    if not na or not nb:
        return 0.0
    return SequenceMatcher(None, na, nb).ratio()


def ordinal_tokens(name: str | None) -> set[str]:
    """이름에서 차수 신호를 뽑는다 — {"1","2"} 같은 숫자 집합. 없으면 빈 집합.

    차수 = "N차 / N단지 / N블록 / NBL". 형제 단지를 가르는 결정적 신호라
    이름 유사도와 **별개의 축**으로 본다(자매 수집기 service_official_price 의
    "형제 단지 신호(잉여 숫자) 배제"와 같은 취지지만, 거기가 부분포함 잉여
    문자열의 숫자 유무를 보는 휴리스틱인 데 반해 여기선 차수 토큰을 명시적으로
    뽑아 값끼리 비교한다 — 이 수집기는 양쪽 이름 전체를 늘 갖고 있어 더 정확한
    판정이 가능하다).

    정규화된 문자열에서 뽑는다 — 원문 "제 2 차"·"(2단지)" 의 공백·괄호를 이미
    걷어낸 뒤라야 같은 패턴 하나로 잡힌다.
    """
    text = normalize_complex_name(name)
    if not text:
        return set()
    return {m.group(1).lstrip("0") or "0" for m in _ORDINAL_RE.finditer(text)}


def ordinal_conflict(a: str | None, b: str | None) -> bool:
    """양쪽 차수가 **서로 모순**이면 True(= 형제 단지라 탈락).

    "모순"은 값이 다른 것과 다르다 — 한쪽이 다른 쪽의 부분집합이면 모순이 아니라
    **한쪽이 차수를 더 적어놓은 것**이다:

      {1} vs {3}      → 충돌   1단지와 3단지는 양립 불가한 형제 단지
      {2} vs {2,7}    → 무충돌 "분성마을2단지부영" ↔ "…부영(북부부영7차)" — 단지
                              차수 2 는 일치하고, 7 은 시공 차수라는 별개 축이다
      {6,1} vs {1}    → 무충돌 "현대아이파크홈타운6차1단지" ↔ "…1단지" — 같은 이유
      {} vs {1}       → 무충돌 정보 부족 (`ordinal_ambiguous` 소관)

    부분집합 관계는 "차수가 다르다"가 아니라 "한쪽이 정보를 더 갖고 있다"이므로,
    충돌로 단정하지 않고 `ordinal_ambiguous` 를 거쳐 **세대수 게이트가 결정**하게
    넘긴다(대조 가능·±15% 통과면 채택, 대조 불가면 탈락).

    ⚠ 모순인 경우엔 세대수가 일치해도 탈락시킨다 — 같은 브랜드 1단지/2단지가
    비슷한 세대수로 지어지는 게 흔해서, 세대수 게이트가 형제 단지를 못 거른다
    (실측: "방주기픈샘2차" ↔ "방주기픈샘1차아파트" ratio 0.857 로 통과했었다).
    """
    ta, tb = ordinal_tokens(a), ordinal_tokens(b)
    if not ta or not tb:
        return False
    # 부분집합(같은 집합 포함)이면 모순이 아니다.
    return not (ta <= tb or tb <= ta)


def ordinal_ambiguous(a: str | None, b: str | None) -> bool:
    """차수 정보가 한쪽에 치우쳐 있으면 True — 세대수 없이는 못 가르는 모호 신호.

    두 경우를 함께 잡는다:
      · 한쪽에만 차수가 있음    "동익파크" vs "동익파크1차"
      · 한쪽이 차수를 더 가짐   "분성마을2단지부영" vs "…부영(북부부영7차)"({2} ⊂ {2,7})

    둘 다 "이름만으로는 같은 단지인지 형제인지 알 수 없다"는 같은 상태다. 호출부는
    세대수를 대조할 수 있으면 그 판정에 맡기고, 대조 불가면 보수적으로 버린다.
    양쪽 차수가 완전히 같으면(예: {2} vs {2}) 모호하지 않다 — False.
    """
    ta, tb = ordinal_tokens(a), ordinal_tokens(b)
    return ta != tb and (ta <= tb or tb <= ta)


def _substring_related(a: str | None, b: str | None) -> bool:
    """정규화 후 한쪽이 다른 쪽을 통째로 품는가 — 지역·동명 프리픽스 회수용.

    실측 패턴: 우리 "강릉송정신원아침도시" ↔ K-apt "신원아침도시아파트"(지역
    접두어), 우리 "현대4차" ↔ K-apt "상계현대4차아파트". 글자 수 차이가 커서
    difflib 점수는 0.75~0.8 로 낮지만 포함 관계가 명확한 같은 단지다.

    ⚠ 짧은 쪽이 _SUBSTRING_MIN_LEN 미만이면 포함으로 치지 않는다 — "한신아파트"는
    접미사 제거 후 "한신"(2글자)이라 "한신더휴"·"한신休"·"한신플러스" 아무 데나
    걸려 완화 임계가 폭발한다(자매 수집기 service_official_price._PARTIAL_MIN_LEN
    과 같은 취지·같은 값). 브랜드명 두 글자는 서로 다른 단지의 공통 접두어일 뿐
    같은 단지라는 증거가 못 된다.
    """
    na, nb = normalize_complex_name(a), normalize_complex_name(b)
    if not na or not nb:
        return False
    if min(len(na), len(nb)) < _SUBSTRING_MIN_LEN:
        return False
    return na in nb or nb in na


def household_within_tolerance(ours: int | None, theirs: int | None) -> bool | None:
    """세대수 게이트. 통과 True / 탈락 False / 대조 불가(한쪽 없음) None.

    None 을 별도로 돌려주는 이유: 호출부가 "대조 불가"일 때 이름 임계를
    강화하는 보완 규칙을 적용해야 하는데, False 와 뭉뚱그리면 그 분기를
    만들 수 없다.
    """
    if not ours or not theirs or ours <= 0 or theirs <= 0:
        return None
    return abs(ours - theirs) / max(ours, theirs) <= _HOUSEHOLD_TOLERANCE


def strict_name_gate_passes(ours: str | None, theirs: str | None, ratio: float) -> bool:
    """세대수를 **끝내 모를 때** 쓰는 엄격 이름 게이트 — 통과 True.

    두 규칙을 함께 본다(PR #433):
      · 차수 정보가 한쪽에 치우침(모호) → 탈락. "동익파크" 가 무차수 단지인지
        "동익파크1차" 의 축약인지 가릴 근거가 없다.
      · 이름 임계 0.85(한쪽이 다른 쪽을 통째로 품는 포함관계면 0.6).

    ⚠ 이 게이트는 "세대수를 **아직** 모르는" pass 1 이 아니라 "세대수를 **알 수
    없음이 확정된**" pass 2(basis 수신 후)에서만 발동해야 한다 — 아래
    `pick_best_match(strict_when_unknown=...)` 주석 참조.
    """
    if ordinal_ambiguous(ours, theirs):
        return False
    threshold = (
        _NAME_RATIO_MIN_SUBSTRING
        if _substring_related(ours, theirs)
        else _NAME_RATIO_MIN_NO_HOUSEHOLD
    )
    return ratio >= threshold


def pick_best_match(
    cpx, candidates: list[dict], *, strict_when_unknown: bool = True
) -> tuple[dict, float] | None:
    """같은 법정동 후보들 중 최적 1건. 게이트 미통과·동률이면 None.

    candidates 는 {"kaptCode","kaptName","kaptdaCnt"(선택)} 형태의 dict 목록.

    ⚠ **`strict_when_unknown` 이 이 함수의 핵심 구분**이다. 세대수가 없는 상태에는
    성격이 다른 두 가지가 있는데, 이걸 한 덩어리로 다루면 정답을 잘라낸다:

      · **아직 모름**(pass 1, `strict_when_unknown=False`) — 목록 API
        (getTotalAptList4)는 kaptdaCnt 를 아예 안 준다. 즉 후보 선별 단계에서는
        **모든 단지**가 예외 없이 "세대수 없음"이다. 여기서 엄격 규칙을 걸면
        basis 를 받으면 세대수가 일치했을 정답까지 전멸한다(2026-08-31 prod 실측:
        전국 재매칭에서 746건 오탈락 — 예: "분성마을2단지부영" ↔ "…(북부부영7차)"
        952/952). 그래서 pass 1 은 **느슨하게** 본다: 차수 **모순**만 탈락시키고
        이름 임계는 기본값 0.6.
      · **알 수 없음 확정**(pass 2, `strict_when_unknown=True`) — basis 를 부르고도
        세대수가 0/NULL 이면 이름 말고는 근거가 없다. 이때 비로소
        `strict_name_gate_passes` 의 엄격 규칙(0.85 / 차수 모호 탈락)이 정당하다.

    후보 하나가 통과하려면:
      (a) **차수 모순 탈락** — 양쪽 차수가 서로 부분집합이 아니면 점수·세대수 불문
          탈락({1} vs {3}). 세대수와 무관한 규칙이라 pass 1 에서 즉시 적용한다
          (형제 단지에 basis 쿼터를 태우지 않는 이득도 있다). 부분집합
          ({2} vs {2,7})은 모순이 아니라 모호라 (c) 로 넘긴다.
      (b) **세대수 게이트** — 대조 가능하고 ±15% 밖이면 탈락.
      (c) **이름 임계** — 대조 가능하면 0.6. 대조 불가면 `strict_when_unknown` 에
          따라 갈린다(True 면 엄격 게이트, False 면 기본 0.6).
    """
    scored: list[tuple[float, dict]] = []
    for cand in candidates:
        kapt_name = cand.get("kaptName")
        ratio = name_similarity(cpx.complex_name, kapt_name)
        household_ok = household_within_tolerance(
            cpx.total_household_count, cand.get("kaptdaCnt")
        )

        # (a) 차수 모순 — 항상 탈락. 세대수가 일치해도 예외 없다(형제 단지는
        #     세대수가 비슷하게 지어져 세대수 게이트로는 못 거른다).
        #     부분집합은 모순이 아니라 모호이므로 아래 (c) 로 흘려보낸다.
        if ordinal_conflict(cpx.complex_name, kapt_name):
            continue

        # (b) 세대수가 명백히 다르면 이름이 아무리 비슷해도 다른 단지다.
        if household_ok is False:
            continue

        # (c) 이름 임계
        if household_ok is None and strict_when_unknown:
            # 세대수를 알 수 없음이 **확정**된 상태 — 엄격 게이트.
            if not strict_name_gate_passes(cpx.complex_name, kapt_name, ratio):
                continue
        elif ratio < _NAME_RATIO_MIN:
            # 세대수 대조 통과, 또는 "아직 모름"(pass 1) — 기본 임계만 본다.
            continue
        scored.append((ratio, cand))

    if not scored:
        return None

    best_ratio = max(score for score, _ in scored)
    top = [cand for score, cand in scored if score == best_ratio]
    if len(top) > 1:
        # 동점이 여럿이면 어느 쪽인지 알 수 없다 — 찍지 않고 버린다.
        logger.info(
            "[kapt_match] 단지 %s(%s) 최고점 동률 %d건 — 탈락",
            cpx.complex_no, cpx.complex_name, len(top),
        )
        return None
    return top[0], best_ratio


def _fetch_all_kapt(limit_pages: int = _MAX_LIST_PAGES) -> tuple[list[dict], bool]:
    """전국 K-apt 목록 전량 페이지네이션. 반환 (rows, is_complete).

    is_complete=False 는 "중간에 끊긴 부분 목록"이라는 뜻이다. 부분 목록으로도
    매칭 자체는 안전하다(upsert 라 기존 매칭을 지우지 않는다) — 다만 그 회차의
    낮은 매칭 수가 '정상 완료'로 보고되면 조용한 퇴행이 되므로, 호출자가 이
    플래그로 job 에 경고를 남길 수 있게 분리해 돌려준다.
    """
    collected: list[dict] = []
    total_count = 0
    page = 1
    while page <= limit_pages:
        items, total = fetch_apt_list_page(page, _LIST_PAGE_SIZE)
        if total:
            total_count = total
        if not items:
            break
        collected.extend(items)
        if total_count and len(collected) >= total_count:
            break
        page += 1

    is_complete = bool(total_count) and len(collected) >= total_count
    if not is_complete:
        logger.warning(
            "[kapt_match] 목록 조기 종료 의심: %d/%s건만 수집",
            len(collected), total_count or "?",
        )
    return collected, is_complete


def _resolve_reverse_conflicts(proposals: list[tuple]) -> tuple[list[tuple], int]:
    """역방향 충돌 해소 — 한 kaptCode 를 노리는 우리 단지가 여럿이면 최고점 1개만.

    반환 (생존 목록, 탈락 수).

    ⚠ `pick_best_match` 는 **정방향**("우리 단지 1 vs kapt 후보 N")만 막는다.
    반대 방향("우리 단지 N vs kapt 후보 1")은 무방어였고, 라이브 스모크에서
    10그룹·21단지가 같은 kaptCode 에 중복 배정됐다(전부 1차/2차 형제 단지).
    complex_no 가 PK 라 upsert 로는 이 중복을 막을 수 없다 — 서로 다른 행이므로.

    동률이면 **전원 탈락**시킨다. `pick_best_match` 의 정방향 동률 규칙과 대칭인
    보수 원칙 — 오매칭(남의 단지 관리비를 사실처럼 표시)은 미매칭보다 훨씬 나쁘다.
    """
    by_code: dict[str, list[tuple]] = {}
    for item in proposals:
        by_code.setdefault(item[1]["kaptCode"], []).append(item)

    survivors: list[tuple] = []
    dropped = 0
    for kapt_code, group in by_code.items():
        if len(group) == 1:
            survivors.append(group[0])
            continue

        best_ratio = max(ratio for _, _, ratio in group)
        top = [item for item in group if item[2] == best_ratio]
        if len(top) > 1:
            logger.info(
                "[kapt_match] kaptCode %s 역방향 동률 %d단지(%s) — 전원 탈락",
                kapt_code, len(top), ", ".join(c.complex_no for c, _, _ in top),
            )
            dropped += len(group)
            continue

        logger.info(
            "[kapt_match] kaptCode %s 를 %d단지가 경합 — %s(%.4f) 채택, %d단지 탈락",
            kapt_code, len(group), top[0][0].complex_no, best_ratio, len(group) - 1,
        )
        survivors.append(top[0])
        dropped += len(group) - 1

    return survivors, dropped


def _clear_conflicting_mappings(db, complex_no: str, kapt_code: str) -> None:
    """이번 배정과 충돌하는 옛 매칭 정리 + 무효해진 관리비 삭제.

    두 가지 cross-run 오염을 함께 막는다:

    1. **다른 단지가 쥔 같은 kapt_code** (#1 cross-run) — 이번 실행이 kaptCode X 를
       단지 B 에 붙이는데 옛 실행이 X 를 단지 A 에 붙여뒀다면 두 행이 공존해 두
       단지가 같은 관리비를 보여준다. 이번 배정과 **충돌하는 행만** 지우므로 부분
       목록 실행에서도 안전하다(무관한 매칭은 건드리지 않는다).
    2. **이 단지의 kapt_code 가 바뀐 경우** (#3) — kapt_management_costs 는
       complex_no 로만 조인되므로(price_queries.get_latest_kapt_cost), 매칭만
       갈아끼우면 옛 K-apt 단지의 금액이 새 이름과 나란히 표시된다. 재수집될
       때까지 틀린 값이 사실처럼 보이므로 옛 코드 수집분을 무효화한다.
       (같은 kapt_code 재확인이면 지우지 않는다 — 매달 전량 재수집은 단지당
       22콜이라 쿼터가 터진다.)

    호출자의 upsert 와 같은 트랜잭션에서 돌아 중간 상태가 노출되지 않는다.
    """
    # 1. 다른 단지가 쥔 같은 kapt_code
    stale = (
        db.query(KaptComplexMap)
        .filter(
            KaptComplexMap.kapt_code == kapt_code,
            KaptComplexMap.complex_no != complex_no,
        )
        .all()
    )
    for row in stale:
        logger.info(
            "[kapt_match] 중복 배정 정리: kaptCode %s 를 쥐고 있던 단지 %s 매칭 삭제",
            kapt_code, row.complex_no,
        )
        db.query(KaptManagementCost).filter(
            KaptManagementCost.complex_no == row.complex_no
        ).delete(synchronize_session=False)
        db.delete(row)

    # 2. 이 단지의 kapt_code 가 바뀌었으면 옛 코드로 모은 관리비 무효화
    current = db.query(KaptComplexMap).filter(
        KaptComplexMap.complex_no == complex_no
    ).one_or_none()
    if current is not None and current.kapt_code != kapt_code:
        logger.info(
            "[kapt_match] 단지 %s 재매칭 %s → %s — 옛 코드 관리비 무효화",
            complex_no, current.kapt_code, kapt_code,
        )
        db.query(KaptManagementCost).filter(
            KaptManagementCost.complex_no == complex_no
        ).delete(synchronize_session=False)


def _purge_unconfirmed_mappings(db, run_started_at: datetime) -> int:
    """이번 전량 실행이 재확인하지 않은 옛 매칭 + 그 관리비 삭제. 반환 = 삭제 건수.

    ⚠ **전량 목록(list_complete=True) 실행에서만** 부른다. 전국 K-apt 목록을 다 받아
    전 단지를 다시 심사한 회차라면, 여기서 살아남지 못한 옛 행은 "새 규칙에서 통과하지
    못하는 짝"이라는 뜻이다. upsert 는 갱신만 하므로 그런 행은 손대지 않으면 옛
    (느슨한) 규칙 시절의 오매칭이 그대로 남아 남의 단지 관리비를 계속 보여준다.

    부분 목록(list_complete=False)에서는 절대 부르지 않는다 — 그 회차가 못 본 단지와
    "규칙에서 탈락한 단지"를 구분할 수 없어서, 전량 삭제 사고가 난다.

    판정 기준은 `matched_at < 실행 시작 시각` 이다. 이번 실행이 재확인한 행은 upsert 가
    matched_at 을 갱신하므로 반드시 실행 시작 이후 값을 갖는다.

    관리비도 함께 지운다 — kapt_management_costs 는 complex_no 로만 조인돼서
    (price_queries.get_latest_kapt_cost) 매칭만 지우면 금액이 고아로 남아, 다음
    매칭이 붙는 순간 옛 K-apt 단지의 금액이 새 이름과 나란히 표시된다.
    """
    stale = (
        db.query(KaptComplexMap)
        .filter(KaptComplexMap.matched_at < run_started_at)
        .all()
    )
    for row in stale:
        logger.info(
            "[kapt_match] 정리: 단지 %s ↔ %s(%s) 이 새 규칙에서 재확인 안 됨 — 매칭·관리비 삭제",
            row.complex_no, row.kapt_code, row.kapt_name,
        )
        db.query(KaptManagementCost).filter(
            KaptManagementCost.complex_no == row.complex_no
        ).delete(synchronize_session=False)
        db.delete(row)
    return len(stale)


def match_kapt_complexes(scheduler_job_id: str = "kapt_match") -> dict:
    """K-apt 단지 목록 ↔ 우리 단지 매칭 (월 1회).

    법정동(cortar_no)으로 후보를 좁힌 뒤 이름 유사도·세대수로 거른다.
    매칭 확정분만 getAphusBassInfoV5 를 한 번 더 호출해 복도유형·세대수를 채운다
    (확정 전에 부르면 후보 전량에 API 를 태워 쿼터가 터진다).
    """
    db = SessionLocal()
    job = _record_job(db, _MATCH_JOB_TYPE, scheduler_job_id)
    # 정리(reconciliation) 기준선 — 이 시각보다 오래된 matched_at 은 "이번 실행이
    # 재확인하지 않은 옛 행"이다. 목록 조회 전에 찍어야 실행 도중 갱신분을 안 놓친다.
    run_started_at = utcnow()
    try:
        kapt_rows, list_complete = _fetch_all_kapt()
        if not kapt_rows:
            _fail_job(db, job, "K-apt 목록 조회 실패 (0건)")
            logger.error("[kapt_match] 목록 0건 — API 실패로 판단")
            return {"matched": 0, "error": "kapt_list_empty"}

        # 법정동 → K-apt 후보 목록
        by_bjd: dict[str, list[dict]] = {}
        for row in kapt_rows:
            bjd = (row.get("bjdCode") or "").strip()[:10]
            if len(bjd) != 10:
                continue
            by_bjd.setdefault(bjd, []).append(row)

        targets = (
            db.query(Complex)
            .filter(
                Complex.real_estate_type_code.in_(("APT", "JGC")),
                Complex.cortar_no.isnot(None),
            )
            .all()
        )

        # ── pass 1: 후보 선별만 (API 호출 0) ──
        # 여기서 kaptCode 별로 모아 "한 K-apt 단지를 여러 우리 단지가 노리는"
        # 역방향 충돌을 먼저 해소한다. pass 2 에서야 생존자에만 basis 를 부른다.
        proposals: list[tuple] = []   # (cpx, cand, ratio)
        skipped = 0
        for cpx in targets:
            candidates = by_bjd.get((cpx.cortar_no or "").strip()[:10])
            if not candidates:
                skipped += 1
                continue
            # 목록 API 에는 kaptdaCnt 가 없어 여기선 세대수가 **아직 모름**이다
            # (알 수 없음 확정이 아니다) → 엄격 규칙은 pass 2 로 미룬다.
            best = pick_best_match(cpx, candidates, strict_when_unknown=False)
            if best is None:
                skipped += 1
                continue
            cand, ratio = best
            proposals.append((cpx, cand, ratio))

        survivors, dropped = _resolve_reverse_conflicts(proposals)
        skipped += dropped

        # ── pass 2: 생존자만 basis 보강 → 세대수 재게이트 → 저장 ──
        matched = 0
        for cpx, cand, ratio in survivors:
            # 확정분만 기본정보 보강 — 실패해도 매칭 자체는 저장한다.
            corridor, household = None, None
            basis = fetch_apt_basis_info(cand["kaptCode"])
            if basis:
                corridor = basis.get("codeHallNm")
                raw_cnt = basis.get("kaptdaCnt")
                try:
                    household = int(float(raw_cnt)) if raw_cnt is not None else None
                except (TypeError, ValueError):
                    household = None

            # ⚠ 세대수 게이트 재판정 — 여기가 게이트 ③이 실제로 발동하는 유일한 지점이다.
            # pick_best_match 는 **목록 API 후보**로 호출되는데 getTotalAptList4 응답에는
            # kaptdaCnt 가 없다 → 그 안의 household_within_tolerance 는 항상 None(대조 불가)
            # 이라 이름 임계 0.85(포함관계 시 0.6) 강화만 걸린다. 세대수를 실제로 아는
            # 시점은 방금 getAphusBassInfoV5 를 부른 지금뿐이므로, 여기서 다시 대조하지
            # 않으면 "법정동 같고 이름 0.85 이상이면 세대수가 3배 달라도 확정"이 되어
            # 3중 게이트가 사실상 2중으로 퇴화한다.
            # ⚠ 차수 **모순**(a)은 세대수와 무관한 규칙이라 pass 1 에서 이미 걸렀다
            # (basis 쿼터 절약). 여기서 재판정하지 않는다.
            household_ok = household_within_tolerance(
                cpx.total_household_count, household
            )
            if household_ok is False:
                logger.info(
                    "[kapt_match] 세대수 게이트 탈락: %s(%s) 우리 %s vs kapt %s(%s)",
                    cpx.complex_no, cpx.complex_name,
                    cpx.total_household_count, household, cand.get("kaptName"),
                )
                skipped += 1
                continue

            # basis 를 부르고도 세대수를 모르면(0/NULL, 또는 우리 쪽 세대수 없음)
            # 그때가 "알 수 없음 **확정**" 이다 — 이름 말고 근거가 없으므로 여기서
            # 비로소 엄격 게이트(0.85 / 차수 모호 탈락)를 적용한다. pass 1 에서
            # 걸면 목록 API 에 세대수가 없다는 이유만으로 전 단지가 엄격 규칙을
            # 맞아 정답까지 잘려나간다(2026-08-31 prod 실측 746건 오탈락).
            if household_ok is None and not strict_name_gate_passes(
                cpx.complex_name, cand.get("kaptName"), ratio
            ):
                logger.info(
                    "[kapt_match] 대조 불가 확정 — 엄격 이름 게이트 탈락: %s(%s) vs %s (%.4f)",
                    cpx.complex_no, cpx.complex_name, cand.get("kaptName"), ratio,
                )
                skipped += 1
                continue

            _clear_conflicting_mappings(db, cpx.complex_no, cand["kaptCode"])

            _do_upsert(
                db,
                KaptComplexMap,
                {
                    "complex_no": cpx.complex_no,
                    "kapt_code": cand["kaptCode"],
                    "kapt_name": cand.get("kaptName"),
                    "match_score": round(ratio, 4),
                    "corridor_type": corridor,
                    "kapt_household_count": household,
                    "matched_at": utcnow(),
                },
                "complex_no",
            )
            matched += 1

            # 중간 저장 — 이 잡은 basis 호출(0.3s throttle)로 1~2h+ 돌기 때문에,
            # 끝에서 한 번만 commit 하면 크래시·재시작 sweep 한 방에 전량이 날아간다.
            # upsert 라 재실행이 안전해 부분 저장에 부작용이 없다.
            if matched % _MATCH_COMMIT_EVERY == 0:
                db.commit()
                logger.info("[kapt_match] 중간 저장: %d건 매칭", matched)

        db.commit()

        # silent failure 가드 (env_air.py 세션 280 패턴 답습): 대상 단지가 있는데
        # 한 건도 못 붙였으면 '완료(0)' 위장 대신 failed 로 알린다.
        if matched == 0 and targets:
            _fail_job(db, job, f"대상 단지 {len(targets)}개 전부 매칭 실패 (매칭 0건)")
            logger.error("[kapt_match] silent failure 감지: 대상 %d개 전부 실패", len(targets))
            return {"matched": 0, "skipped": skipped, "error": "no_match"}

        # 전량 실행 정리 — 이번에 재확인되지 않은 옛 매칭은 새 규칙 탈락분이므로 지운다.
        # 부분 목록 회차에서는 "못 본 단지"와 구분이 안 되므로 절대 지우지 않는다.
        # 위 silent failure 가드를 통과한 뒤라야 안전하다(매칭 0건 회차가 전량을
        # 쓸어버리는 사고 차단).
        purged = 0
        if list_complete:
            purged = _purge_unconfirmed_mappings(db, run_started_at)
            db.commit()
            if purged:
                logger.warning("[kapt_match] 새 규칙 미통과 옛 매칭 %d건 정리 완료", purged)

        # ⚠ 2번째 인자는 _complete_job 규약상 **failed** 다(total = processed + failed).
        # 미매칭(skipped)은 실패가 아니라 정상적인 '해당 없음'이므로 0 을 넘긴다 —
        # skipped 를 넘기면 total 이 46,373건만큼 부풀어(라이브 실측 47,606) 실패율
        # 지표가 통째로 망가진다. skipped 는 아래 로그·error_message 로만 관찰한다.
        _complete_job(db, job, matched, 0)
        if not list_complete:
            # 부분 목록으로 돈 회차임을 job 에 남긴다 — 매칭 수가 평소보다 낮아도
            # '정상 완료'로만 보이면 조용한 퇴행이 된다(관측 가능성 확보).
            job.error_message = (
                f"부분 목록으로 매칭 (K-apt {len(kapt_rows)}건만 수집) — 다음 회차 재시도 필요"
            )[:500]
            db.commit()
        logger.info(
            "[kapt_match] 완료: %d 매칭, %d 미매칭, %d 정리 (대상 %d, K-apt %d건, 목록완전=%s)",
            matched, skipped, purged, len(targets), len(kapt_rows), list_complete,
        )
        return {
            "matched": matched,
            "skipped": skipped,
            "purged": purged,
            "list_complete": list_complete,
        }
    except Exception as exc:
        _fail_job(db, job, str(exc))
        logger.exception("[kapt_match] 매칭 실패")
        return {"matched": 0, "error": str(exc)}
    finally:
        db.close()


def candidate_cost_months(today: date | None = None) -> list[str]:
    """수집 시도할 YYYYMM 후보 — 최신(당월-3)부터 거꾸로 _COST_MONTH_TRIES 개.

    K-apt 는 약 3개월 지연 공개라(2026-08-27 실측: 202605 가 최신), 당월-3 을
    먼저 시도하고 없으면 더 과거로 물러난다.
    """
    base = today or datetime.now(timezone.utc).date()
    months = []
    year, month = base.year, base.month
    for offset in range(_COST_LAG_MONTHS, _COST_LAG_MONTHS + _COST_MONTH_TRIES):
        total = (year * 12 + (month - 1)) - offset
        months.append(f"{total // 12:04d}{total % 12 + 1:02d}")
    return months


def _fetch_costs_for_month(kapt_code: str, month: str) -> dict[str, int]:
    """한 달치 22개 오퍼레이션 호출 → {op: 금액} 병합. 전부 미공개면 빈 dict.

    ⚠ 호출 실패(`KaptApiError`)는 잡지 않고 그대로 올린다. 여기서 삼키면 공용(V3)
    17콜이 통째로 실패하고 개별(V2) 5콜만 성공한 회차에 "공용관리비 0원" 인 반쪽
    breakdown 이 만들어지고, 호출자가 그걸 진짜 값으로 저장해버린다.
    """
    breakdown = dict(fetch_common_cost(kapt_code, month))
    breakdown.update(fetch_individual_cost(kapt_code, month))
    return breakdown


def _summarize(breakdown: dict[str, int], household: int | None) -> dict:
    """항목별 원값 → 공용/개별/총액/세대당 요약.

    공용·개별 구분은 오퍼레이션 접미사(V3=공용, V2=개별)로 판정한다 —
    두 서비스의 op 이름이 각각 V3/V2 로 끝나 안정적인 구분자다.
    """
    common = sum(v for k, v in breakdown.items() if k.endswith("V3"))
    individual = sum(v for k, v in breakdown.items() if k.endswith("V2"))
    total = common + individual
    per_household = (
        int(round(total / household)) if household and household > 0 else None
    )
    return {
        "common_cost": common,
        "individual_cost": individual,
        "total_cost": total,
        "cost_per_household": per_household,
    }


def collect_kapt_costs(batch_size: int = 500, scheduler_job_id: str = "kapt_costs") -> dict:
    """매칭된 단지의 월별 관리비 수집 (매일).

    "이번 수집월 행이 아직 없는 단지"를 오래된 매칭 순으로 batch_size 만큼 처리한다.
    ⚠ 단지 하나에 22콜이 나가므로 batch_size 가 곧 쿼터 소모량(×22)이다.
    관리비 V2/V3 는 개발계정 = 서비스당 5,000/일(오퍼레이션 합산)이라 배치 500 이면
    V3(17콜)만 8,500 으로 넘친다 → 운영 `KAPT_COST_BATCH_SIZE=250`.

    실패 처리 계약:
      · (b) 정상 미공개 → 행을 만들지 않고 `empty` 계수, 잡은 completed (정상)
      · (c) 호출 실패   → **저장하지 않고** `failed` 계수. 그 달 행이 없으므로
                          다음 회차에 자동 재시도된다(위 `done` 셋에 안 걸림).
      · (c) 중 쿼터 초과(22) → 남은 대상 호출 없이 즉시 중단 + 잡 failed
      · (c) 가 **연속 5단지** → API 장애/한도 의심으로 중단 + 잡 failed
    부분 저장을 절대 하지 않는 것이 핵심이다 — 공용(V3) 실패 + 개별(V2) 성공으로
    "공용 0원" 총액을 저장하면 틀린 값이 사실처럼 화면에 뜨고, 그 달 행이 생겨
    다음 달까지 고쳐지지도 않는다.

    ⚠ 조기 중단 2종의 관계 (둘 다 "남은 단지에 헛호출하지 않기" 가 목적):
      ① `is_quota` 즉시 중단 — 한도 초과(22)가 **JSON 으로 와서** 코드가 잡힌 경우.
         원인이 확정적이라 1건만으로 바로 멈춘다.
      ② 연속 실패 중단(본 PR) — 같은 한도 초과라도 **에러가 XML 로 오면** call_api 가
         `resp.json()` 에서 터져 코드 미상 실패로 도착해 ①이 안 선다. 그 사각을
         "연속 N건" 이라는 정황으로 메운다. 개별 단지의 일시 실패와 구분하려고
         연속으로 세고, 성공·정상 미공개가 한 건이라도 끼면 리셋한다.
    """
    db = SessionLocal()
    job = _record_job(db, _COST_JOB_TYPE, scheduler_job_id)
    try:
        months = candidate_cost_months()
        target_month = months[0]

        # 후보월 중 **아무 달이라도** 이미 수집한 단지는 제외.
        # ⚠ target_month 만 보면 안 된다 — 폴백으로 더 과거 달(months[1:])을 받은 단지는
        # target_month 행이 영영 안 생겨서 매일 22콜 × 3개월을 무한 재조회한다(쿼터 소진).
        done = {
            row[0]
            for row in db.query(KaptManagementCost.complex_no)
            .filter(KaptManagementCost.cost_month.in_(months))
            .all()
        }
        rows = (
            db.query(KaptComplexMap)
            .order_by(KaptComplexMap.matched_at.asc())
            .all()
        )
        targets = [r for r in rows if r.complex_no not in done][:batch_size]

        collected, failed, empty = 0, 0, 0
        quota_exhausted: KaptApiError | None = None
        # 연속 전 op 실패 카운터 — 한 단지라도 성공(또는 정상 미공개)하면 리셋한다.
        consecutive_failures = 0
        api_down: KaptApiError | None = None
        processed = 0
        for mapping in targets:
            processed += 1
            try:
                breakdown, used_month = {}, None
                for month in months:
                    # ⚠ 월 폴백은 (b) "그 달은 아직 미공개" 일 때만 의미가 있다.
                    # (c) 호출 실패 때 이전 달로 내려가면, 이미 죽은 API 에 22콜을
                    # 한 번 더 태워 쿼터만 갉아먹고 결과도 같다 → 예외는 즉시 전파.
                    breakdown = _fetch_costs_for_month(mapping.kapt_code, month)
                    if breakdown:
                        used_month = month
                        break
                if not breakdown or used_month is None:
                    # 미공개 단지 — 실패가 아니라 정상적인 '데이터 없음'.
                    # ⚠ 호출 자체는 성공했으므로(200 + 빈 body) API 는 살아있다 →
                    #   연속 실패 카운터를 리셋한다. 여기서 리셋을 빠뜨리면
                    #   "미공개가 드문드문 섞인 정상 회차" 가 조기 중단될 수 있다.
                    consecutive_failures = 0
                    empty += 1
                    continue

                household = mapping.kapt_household_count
                summary = _summarize(breakdown, household)
                _do_upsert(
                    db,
                    KaptManagementCost,
                    {
                        "complex_no": mapping.complex_no,
                        "cost_month": used_month,
                        "household_count": household,
                        "breakdown": breakdown,
                        "fetched_at": utcnow(),
                        **summary,
                    },
                    ["complex_no", "cost_month"],
                )
                collected += 1
                consecutive_failures = 0
            except KaptApiError as exc:
                # (c) 호출 실패 — 이 단지는 **저장하지 않는다**. 그 달 행이 안 생기므로
                # 다음 회차(내일)에 자동으로 다시 대상이 된다(done 셋에 안 걸림).
                logger.warning(
                    "[kapt_costs] 단지 %s 호출 실패 — 저장 건너뜀 (%s)",
                    mapping.complex_no, exc,
                )
                failed += 1
                consecutive_failures += 1
                if exc.is_quota:
                    # 일일 한도 초과 — 남은 대상에 호출해봐야 전부 같은 에러다.
                    # 헛호출로 다음 날 쿼터까지 태우지 않도록 배치를 즉시 중단한다.
                    quota_exhausted = exc
                    break
                if consecutive_failures >= _CONSECUTIVE_FAILURE_LIMIT:
                    # 코드 미상 실패가 연달아 N건 — 개별 단지 문제가 아니라 API 장애·
                    # 한도 초과(XML 에러라 is_quota 가 안 선 경우)로 본다. 위 quota 중단이
                    # 못 잡는 경로를 메우는 2차 방어선이다.
                    api_down = exc
                    break
            except Exception:
                logger.exception("[kapt_costs] 단지 %s 처리 실패", mapping.complex_no)
                failed += 1
                # ⚠ 여기(예상 못 한 예외)는 연속 카운터를 올리지 않는다 — API 생사
                #   신호가 아니라 우리 쪽 처리 버그일 수 있어, 조기 중단의 근거로는
                #   약하다. 이 경우는 아래 `failed > 0` silent failure 가드가 잡는다.

        # 중단 여부와 무관하게 **여기까지 저장한 정상 단지는 지킨다** — 아래 _fail_job
        # 은 별도 트랜잭션이 아니라 같은 세션이라, 먼저 commit 해두지 않으면 쿼터 중단
        # 시 그날 수집분이 통째로 롤백될 수 있다.
        db.commit()

        # 쿼터 초과로 조기 중단 — monitor 가 알아채도록 잡을 failed 로 마감한다.
        # (completed 로 두면 "오늘도 정상 수집" 으로 위장돼 며칠씩 방치된다.)
        if quota_exhausted is not None:
            remaining = len(targets) - processed
            message = (
                f"쿼터 초과(22) — {processed}단지 처리 후 중단, 잔여 {remaining} "
                f"(수집 {collected}, 실패 {failed}, 미공개 {empty})"
            )
            _fail_job(db, job, message)
            logger.error("[kapt_costs] %s", message)
            return {
                "collected": collected, "failed": failed, "empty": empty,
                "remaining": remaining, "error": "quota_exceeded",
            }

        # 연속 전 op 실패로 조기 중단 — 쿼터 중단과 같은 이유로 잡을 failed 로 마감한다.
        # (쿼터 중단과 별개 분기인 이유: 원인이 확정된 22 와 달리 이쪽은 "코드 미상 실패가
        #  연달아 났다"는 정황 판단이라, 사람이 로그를 보고 원인을 가려야 한다.)
        if api_down is not None:
            remaining = len(targets) - processed
            message = (
                f"연속 {_CONSECUTIVE_FAILURE_LIMIT}단지 호출 실패 — API 장애/한도 의심, "
                f"잔여 {remaining} (수집 {collected}, 실패 {failed}, 미공개 {empty}, "
                f"마지막 오류: {api_down})"
            )
            _fail_job(db, job, message)
            logger.error("[kapt_costs] %s", message)
            return {
                "collected": collected, "failed": failed, "empty": empty,
                "remaining": remaining, "error": "api_down",
            }

        # ── silent failure 가드 2종의 관계 ──
        # 아래 두 가드는 "수집 0건" 을 서로 다른 원인으로 잡는다. 이 PR 로 (c) 호출
        # 실패가 예외 → `failed` 로 잡히게 되면서, 1번 가드가 담당하는 범위가 넓어졌다:
        #   ① 아래 `failed > 0` 가드  — 예외로 죽은 회차. 이제 API 호출 실패(쿼터·키·
        #      점검·파싱)가 전부 여기 잡힌다. 예전엔 이것들이 조용한 None → 빈 dict →
        #      `empty` 로 새어 ②에만 의존했다.
        #   ② `empty == len(targets)` 가드 — 예외는 없는데 전량 빈 응답. 이제는
        #      "진짜로 전부 미공개" 이거나, API 가 200 + 빈 body 로 무응답화한 경우다.
        #      표본이 작으면(임계 미만) 정상 미공개와 구분이 안 돼 판정을 보류한다.
        # 즉 ①이 1차 방어선이고 ②는 ①을 빠져나가는 무증상 장애용 그물이다.
        #
        # silent failure 가드: 대상이 있는데 한 건도 저장 못 했고 그 원인이
        # '미공개'가 아니라 실패라면 '완료(0)' 위장 대신 failed 로 알린다.
        # (일부만 미공개인 경우는 정상이므로 completed 로 둔다 — 오탐 방지)
        if collected == 0 and targets and failed > 0:
            _fail_job(
                db, job,
                f"대상 {len(targets)}개 중 수집 0건 (실패 {failed}, 미공개 {empty})",
            )
            logger.error(
                "[kapt_costs] silent failure 감지: 대상 %d개 수집 0건 (실패 %d)",
                len(targets), failed,
            )
            return {"collected": 0, "failed": failed, "empty": empty, "error": "no_collect"}

        # ⚠ 전량 빈 응답도 silent failure 다 — 위 가드만으로는 안 잡힌다.
        # (예전엔 `_body` 가 호출 실패·비정상 resultCode 에도 None 을 줘서 breakdown 이
        # 빈 dict 가 되어 `empty` 로 새어들었고, 그 경로가 이 가드의 주 표적이었다.
        # 지금은 그것들이 `KaptApiError` → `failed` 로 잡히므로 위 ① 가드가 먼저 발동한다.)
        # 그래도 이 가드는 남는다 — API 가 HTTP 200 + 정상 구조 + 빈 body 로 무응답화하는
        # 경우는 여전히 예외 없이 `empty` 로만 나타나기 때문이다.
        #
        # 단 "전량 빈 응답"만으로는 부족하고 **표본이 충분할 때만** 판정한다.
        # 개별 단지의 미공개는 흔한 정상 상태라, 대상이 1~2개뿐인 회차(수집이
        # 거의 끝나 잔여분만 남은 날·수동 소량 트리거)에서는 "전량 미공개"가
        # 정상적으로 자주 발생한다 — 그걸 failed 로 올리면 official_price 오탐
        # sweep(세션 369)과 같은 종류의 가짜 경보가 매일 울린다. 임계 미만이면
        # 판정을 보류하고 completed 로 두되, 아래 로그로 관찰은 남긴다.
        if collected == 0 and targets and empty == len(targets):
            if len(targets) < _ALL_EMPTY_MIN_TARGETS:
                logger.warning(
                    "[kapt_costs] 대상 %d개 전량 미공개 — 표본이 작아 장애 판정 보류",
                    len(targets),
                )
            else:
                _fail_job(
                    db, job,
                    f"대상 {len(targets)}개 전부 빈 응답 — API 폐기/키 만료 의심",
                )
                logger.error(
                    "[kapt_costs] 전량 빈 응답 감지: 대상 %d개 (API 폐기/키 만료 의심)",
                    len(targets),
                )
                return {
                    "collected": 0, "failed": failed, "empty": empty, "error": "all_empty",
                }

        # ⚠ total_items 는 **대상 수** 여야 한다. collected+failed 로 두면 전량
        # 미공개일 때 total=0 이 되어, freshness 의 헛바퀴 감지(processed==0 AND
        # total>0, routers/admin/freshness.py)가 영영 발동하지 않는다.
        _complete_job(db, job, collected, len(targets) - collected)
        logger.info(
            "[kapt_costs] 완료: %d 수집, %d 실패, %d 미공개 (대상 %d, 기준월 %s)",
            collected, failed, empty, len(targets), target_month,
        )
        return {
            "collected": collected,
            "failed": failed,
            "empty": empty,
            "cost_month": target_month,
        }
    except Exception as exc:
        _fail_job(db, job, str(exc))
        logger.exception("[kapt_costs] 수집 실패")
        return {"collected": 0, "error": str(exc)}
    finally:
        db.close()

"""법정 비율 상수 — 한국은행 기준금리와 주택임대차 전월세 전환율 상한 (세션 473, 사장님 결정 ③A 2026-10-18).

⚠ 기준금리는 손으로 적는 상수다. **한국은행 금융통화위원회(연 8회) 뒤 사람이 고친다**(날짜 달력 project_watch_calendar.md).
   고칠 때 BOK_BASE_RATE 와 BOK_BASE_RATE_DATE 를 같이 바꾼다 — 관리자 신선도 화면에 "기준금리 N%(날짜)" 로 보인다.

출처
  * 한국은행 기준금리 추이: https://www.bok.or.kr/portal/singl/baseRate/list.do?dataSeCd=01&menuNo=200643
    (2026-10-18 읽음: 3.00% 2026-08-27 · 직전 2.75% 2026-07-16 · 그 전 2.50% 2025-05-29)
  * 주택임대차보호법 제7조의2(월차임 전환 시 산정률의 제한) — 보증금을 월세로 바꿀 때 두 비율 중 낮은 쪽을 넘지 못한다:
    https://www.law.go.kr/법령/주택임대차보호법
  * 같은 법 시행령 제9조 — 두 비율 = "연 1할" · 한국은행 기준금리 + "연 2퍼센트":
    https://www.law.go.kr/법령/주택임대차보호법시행령
"""

BOK_BASE_RATE = 3.00                 # 한국은행 기준금리(%)
BOK_BASE_RATE_DATE = "2026-08-27"    # 위 금리가 정해진 날(금통위 결정일)
RENT_CONVERSION_CAP_SPREAD = 2.0     # 시행령 §9 ② "연 2퍼센트"(기준금리에 더하는 이율, %p)
RENT_CONVERSION_CAP_ALT = 10.0       # 시행령 §9 ① "연 1할"(%)


def legal_rent_conversion_cap() -> float:
    """법정 전월세 전환율 상한(%) = min(기준금리 + 2%p, 10%) — 법 §7조의2 "낮은 비율"."""
    return round(min(BOK_BASE_RATE + RENT_CONVERSION_CAP_SPREAD, RENT_CONVERSION_CAP_ALT), 2)

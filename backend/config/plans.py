"""유료 구독 요금제 상수 — 결제 prepare/complete 가 금액·기간을 서버에서 결정 (PR3).

⚠ amount(원) 는 placeholder — 정식 가격 확정 시 amount 1줄만 교체 (사장님).
FE 가 보낸 금액은 절대 신뢰하지 않는다 (위변조 방지). prepare 가 plan 키로 본 dict 에서
amount 를 조회해 Payment 행에 박고, complete 가 PortOne 응답 금액과 이 값을 대조한다.
"""

# plan 키 → {amount(원, 서버 결정값), days(이용권 일수), order_name(PortOne 주문명)}
PLAN_PRICES: dict[str, dict] = {
    "basic_30d": {"amount": 49000, "days": 30, "order_name": "기본 플랜 30일"},
    "pro_30d": {"amount": 99000, "days": 30, "order_name": "프로 플랜 30일"},
    "pro_365d": {"amount": 990000, "days": 365, "order_name": "프로 플랜 1년"},
}

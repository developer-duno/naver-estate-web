"""유료 구독 요금제 상수 — 결제 prepare/complete 가 금액·기간을 서버에서 결정 (PR3).

⚠ amount(원) 는 placeholder — 정식 가격 확정 시 amount 1줄만 교체 (사장님).
FE 가 보낸 금액은 절대 신뢰하지 않는다 (위변조 방지). prepare 가 plan 키로 본 dict 에서
amount 를 조회해 Payment 행에 박고, complete 가 PortOne 응답 금액과 이 값을 대조한다.
"""

# plan 키 → {amount(원, 서버 결정값), days(이용권 일수), order_name(PortOne 주문명)}
# 가격(세션 326 사장님 확정): 월 10,000원(원가 100,000 90%할인) / 연 100,000원(원가 1,000,000 90%할인).
# 무료체험(기본)은 결제(prepare)를 타지 않으므로 PLAN_PRICES 에 없다 — FE 무료체험 버튼이 /signup 으로 분기.
# ⚠ FE 표시 할인가(PlanCards.tsx)는 이 amount 와 일치해야 한다 (사용자가 보는 가격=실제 청구가, 정합 가드).
PLAN_PRICES: dict[str, dict] = {
    "pro_30d": {"amount": 10000, "days": 30, "order_name": "월간 이용권 30일"},
    "pro_365d": {"amount": 100000, "days": 365, "order_name": "연간 이용권 1년"},
}

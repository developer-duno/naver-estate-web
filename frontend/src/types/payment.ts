/**
 * 유료 구독 결제 타입 — PortOne(포트원) V2 연동 (PR4).
 * BE routers/payment.py 응답과 동기화 (필드 변경 시 양쪽 갱신 — 루트 CLAUDE.md 양쪽 영향 체크리스트).
 */

/** PLAN_PRICES(BE config/plans.py) 의 plan 키 — FE 가 prepare 에 보내는 식별자 (금액은 서버 결정). */
export type PlanKey = "basic_30d" | "pro_30d" | "pro_365d";

/** POST /api/payment/prepare 응답 — FE 가 PortOne.requestPayment 에 그대로 넘긴다. */
export interface PreparePaymentResponse {
  paymentId: string;
  storeId: string;
  channelKey: string;
  orderName: string;
  amount: number; // 원 단위 (서버 결정값) — requestPayment 의 totalAmount 로 전달
  currency: string; // "KRW" (BE 응답). SDK totalAmount 와 별개로 표시·검증용
}

/** POST /api/payment/complete 응답 — 서버가 PortOne 재검증 후 paid_until 연장. */
export interface CompletePaymentResponse {
  paid_until: string | null; // ISO8601 (UTC) — 유료 이용권 만료일
  plan: string;
  already_paid: boolean; // 멱등 재시도로 이미 처리된 경우 true
}

// ── 빌링키 자동결제(정기결제) — BE routers/billing.py 와 동기화 (PR5) ──

/** POST /api/payment/billing/prepare 응답 — FE 가 PortOne.requestIssueBillingKey 에 넘긴다. */
export interface BillingPrepareResponse {
  issueId: string; // 가맹점 생성 발급 고유 ID (BE 생성)
  storeId: string;
  channelKey: string;
  issueName: string; // 발급 화면 표시명 (= 플랜 주문명)
  customer: { name: string; phone: string | null }; // KPN 빌링키 발급 필수 (대표자명·연락처)
}

/** POST /api/payment/billing/register 응답 — 카드 저장 + 첫 결제 후 paid_until 연장. */
export interface BillingRegisterResponse {
  paid_until: string | null;
  plan: string;
  billing_registered: boolean;
}

/** GET /api/payment/billing/list 의 카드 1건. */
export interface BillingCard {
  id: number;
  plan: string;
  card_name: string | null; // 카드사명
  card_last4: string | null; // 마지막 4자리
  is_default: boolean; // 자동결제에 쓰이는 기본 카드
  next_charge_at: string | null; // ISO8601 — 다음 자동결제 예정일
}

/** GET /api/payment/billing/list 응답. */
export interface BillingListResponse {
  cards: BillingCard[];
}

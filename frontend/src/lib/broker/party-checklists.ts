/**
 * 「계약 체크 목록」(/checklist/<type>) — 거래 당사자(세입자·집주인)용 자료. **손으로 관리한다**(세션 514).
 *
 * - 규칙은 checklists.ts 머리 주석과 같다: 조문 주소는 열어 본 뒤에만(law-urls.ts) · 항목 id 는 체크 저장 키라 바꾸지 않는다
 *   (`<type>.<영문 소문자-하이픈>` 꼴 · 순번 금지) · 법이 바뀌면 checkedAt 을 고친다.
 * - 항목 글자는 사장님이 승인한 그림(세션 514) 그대로다 — 고칠 땐 다시 여쭙는다.
 * - 이 파일은 checklists.ts 에서 **타입만** 가져온다(런타임에 서로 부르지 않게). 레지스트리 CHECKLISTS 는 checklists.ts 에 있다.
 * 시험 = `src/lib/broker/__tests__/party-checklists.test.ts` · `checklists.test.ts`(조문 글자↔주소 짝은 세 목록 전부).
 */
import type { DealChecklist } from "./checklists";
import { A25, A26, A30, A32, D21, H3, H3_2, H3_3, H3_6, H3_7, H4, H6, H6_2, H6_3, H7, H8, L6, R29_2, RD4_3, RT6_2, RT6_5, T109 } from "./law-urls";

const FEE_CALC = { label: "중개수수료 계산기", href: "/tools/brokerage-fee" };
const NOT_COVERED = ["전세보증(HUG 등) 가입 요건", "전세대출 조건", "개별 특약 문구"];

export const JEONSE_TENANT: DealChecklist = {
  type: "jeonse-tenant",
  audience: "party",
  name: "세입자용",
  h1: "전세 계약 체크리스트 — 세입자용",
  description:
    "아파트 전세 계약에서 세입자(임차인)가 계약 전·계약·이사·만기 때 챙길 일을 법 조문과 함께 정리했습니다.",
  checkedAt: "2026-11-16",
  stages: [
    {
      id: "before",
      title: "계약 전 — 집과 집주인 확인",
      items: [
        {
          id: "jeonse-tenant.registry-explain",
          title: "중개사에게 등기사항증명서·건축물대장을 보여 달라고 하고 근저당·압류·신탁 설명 듣기",
          laws: [
            { label: "공인중개사법 제25조 제1항", url: A25 },
            { label: "공인중개사법 시행령 제21조 제1항", url: D21 },
          ],
        },
        {
          id: "jeonse-tenant.landlord-info",
          title:
            "집주인에게 확정일자 현황과 국세·지방세 납세증명서 받기(계약 전에 열람에 동의했으면 그것으로 갈음)",
          detail: "법은 집주인이 계약할 때 세입자에게 보여 주도록 정합니다.",
          laws: [{ label: "주택임대차보호법 제3조의7", url: H3_7 }],
        },
        {
          id: "jeonse-tenant.fixed-date-info",
          title: "집주인 동의를 받아 주민센터 등에 그 집의 확정일자·보증금 정보 요청",
          laws: [{ label: "주택임대차보호법 제3조의6 제4항", url: H3_6 }],
        },
        {
          id: "jeonse-tenant.unpaid-tax",
          title:
            "집주인이 안 낸 세금 열람 신청(동의 필요 · 보증금이 시행령 금액을 넘으면 임대차 시작일까지 동의 없이도)",
          laws: [
            { label: "국세징수법 제109조", url: T109 },
            { label: "지방세징수법 제6조", url: L6 },
          ],
        },
        {
          id: "jeonse-tenant.move-in-households",
          title: "전입세대확인서로 그 집에 먼저 전입한 사람이 있는지 확인",
          laws: [{ label: "주민등록법 제29조의2", url: R29_2 }],
        },
      ],
    },
    {
      id: "contract",
      title: "계약",
      items: [
        {
          id: "jeonse-tenant.contract-docs",
          title: "거래계약서와 확인·설명서를 받기(중개사 서명·날인 확인)",
          laws: [
            { label: "공인중개사법 제25조 제3항·제4항", url: A25 },
            { label: "공인중개사법 제26조 제1항·제2항", url: A26 },
          ],
        },
        {
          id: "jeonse-tenant.guarantee",
          title: "중개사 손해배상 보증 증서 사본 받기(보장금액·기관·기간)",
          laws: [{ label: "공인중개사법 제30조 제5항", url: A30 }],
        },
        {
          id: "jeonse-tenant.fee",
          title: "중개보수 금액 확인 → 중개수수료 계산기로 상한 비교",
          laws: [{ label: "공인중개사법 제32조", url: A32 }],
          links: [FEE_CALC],
        },
      ],
    },
    {
      id: "after",
      title: "계약 뒤 — 이사 날까지",
      items: [
        {
          id: "jeonse-tenant.lease-report",
          title:
            "임대차 신고: 계약일부터 30일 안(전입신고를 하면 신고한 것으로 보고, 계약서를 내고 신고하면 확정일자도 받은 것으로 봄)",
          detail: "보증금 6천만원 초과 또는 월 차임 30만원 초과 계약이 대상입니다.",
          laws: [
            { label: "부동산거래신고법 제6조의2", url: RT6_2 },
            { label: "부동산거래신고법 제6조의5", url: RT6_5 },
            { label: "부동산거래신고법 시행령 제4조의3", url: RD4_3 },
          ],
        },
        {
          id: "jeonse-tenant.opposability",
          title: "이사·전입신고 → 다음 날부터 대항력, 확정일자까지 갖추면 우선변제권",
          laws: [
            { label: "주택임대차보호법 제3조 제1항", url: H3 },
            { label: "주택임대차보호법 제3조의2 제2항", url: H3_2 },
          ],
        },
        {
          id: "jeonse-tenant.small-deposit",
          title: "보증금 중 일정액 보호(최우선변제) 대상인지 확인 — 경매신청 등기 전에 이사·전입을 마쳐야 함",
          laws: [{ label: "주택임대차보호법 제8조", url: H8 }],
        },
      ],
    },
    {
      id: "expiry",
      title: "만기 때",
      items: [
        {
          id: "jeonse-tenant.renewal-request",
          title: "계약갱신 요구는 끝나기 6개월 전 ~ 2개월 전에(1번만 · 갱신되면 2년)",
          laws: [{ label: "주택임대차보호법 제6조의3 제1항·제2항", url: H6_3 }],
        },
        {
          id: "jeonse-tenant.increase-cap",
          title: "갱신 때 보증금 인상은 5% 이내(시·도 조례로 더 낮을 수 있음)",
          laws: [
            { label: "주택임대차보호법 제6조의3 제3항", url: H6_3 },
            { label: "주택임대차보호법 제7조 제2항", url: H7 },
          ],
        },
        {
          id: "jeonse-tenant.implied-renewal-exit",
          title: "아무도 통지 안 해서 자동 연장됐으면 세입자는 언제든 해지 통지 가능 — 3개월 뒤 효력",
          laws: [
            { label: "주택임대차보호법 제6조", url: H6 },
            { label: "주택임대차보호법 제6조의2", url: H6_2 },
            { label: "주택임대차보호법 제6조의3 제4항", url: H6_3 },
          ],
        },
        {
          id: "jeonse-tenant.lease-registration",
          title: "끝났는데 보증금을 못 받으면 임차권등기명령 신청 → 등기를 마치면 이사해도 대항력·우선변제권 유지",
          laws: [{ label: "주택임대차보호법 제3조의3 제1항·제5항", url: H3_3 }],
        },
      ],
    },
  ],
  notCovered: NOT_COVERED,
};

export const JEONSE_LANDLORD: DealChecklist = {
  type: "jeonse-landlord",
  audience: "party",
  name: "집주인용",
  h1: "전세 계약 체크리스트 — 집주인용",
  description:
    "아파트 전세 계약에서 집주인(임대인)이 계약 전·계약·만기 때 지킬 일과 챙길 일을 법 조문과 함께 정리했습니다.",
  checkedAt: "2026-11-16",
  stages: [
    {
      id: "contract",
      title: "계약 전·계약",
      items: [
        {
          id: "jeonse-landlord.show-info",
          title: "세입자에게 확정일자 현황과 국세·지방세 납세증명서 보여 주기(또는 계약 전 열람 동의) — 의무",
          laws: [{ label: "주택임대차보호법 제3조의7", url: H3_7 }],
        },
        {
          id: "jeonse-landlord.condition-docs",
          title: "중개사가 집·시설 상태 자료를 달라고 하면 주기 — 안 주면 그 사실이 확인·설명서에 적힘",
          laws: [
            { label: "공인중개사법 제25조 제2항", url: A25 },
            { label: "공인중개사법 시행령 제21조 제2항", url: D21 },
          ],
        },
        {
          id: "jeonse-landlord.contract-docs",
          title: "거래계약서와 확인·설명서 받기",
          laws: [
            { label: "공인중개사법 제25조 제3항", url: A25 },
            { label: "공인중개사법 제26조 제1항", url: A26 },
          ],
        },
        {
          id: "jeonse-landlord.fee",
          title: "중개보수 금액 확인 → 계산기로 상한 비교",
          laws: [{ label: "공인중개사법 제32조", url: A32 }],
          links: [FEE_CALC],
        },
      ],
    },
    {
      id: "after",
      title: "계약 뒤",
      items: [
        {
          id: "jeonse-landlord.lease-report",
          title: "임대차 신고: 계약일부터 30일 안, 세입자와 함께",
          detail: "한쪽이 신고를 거부하면 다른 쪽이 혼자 신고할 수 있습니다.",
          laws: [{ label: "부동산거래신고법 제6조의2", url: RT6_2 }],
        },
        {
          id: "jeonse-landlord.minimum-term",
          title: "기간을 2년보다 짧게 정해도 2년으로 봄(세입자는 짧은 기간을 주장할 수 있음)",
          laws: [{ label: "주택임대차보호법 제4조 제1항", url: H4 }],
        },
      ],
    },
    {
      id: "expiry",
      title: "만기 때",
      items: [
        {
          id: "jeonse-landlord.renewal-notice",
          title: "갱신 거절·조건 변경은 끝나기 6개월 전 ~ 2개월 전에 통지 — 안 하면 같은 조건으로 2년 자동 연장",
          laws: [{ label: "주택임대차보호법 제6조 제1항·제2항", url: H6 }],
        },
        {
          id: "jeonse-landlord.renewal-refusal",
          title:
            "세입자 갱신 요구는 정해진 사유(2기 차임 연체·직접 거주 등 9가지)가 없으면 거절 못 함 — 직접 거주로 거절하고 남에게 세를 주면 손해배상",
          detail: "손해배상은 정당한 사유 없이, 원래 갱신됐을 기간이 끝나기 전에 남에게 세를 준 경우입니다.",
          laws: [{ label: "주택임대차보호법 제6조의3 제1항·제5항", url: H6_3 }],
        },
        {
          id: "jeonse-landlord.increase-cap",
          title:
            "계약 중이거나 세입자 요구로 갱신할 때 보증금 인상은 5% 이내(시·도 조례로 더 낮을 수 있음), 계약하거나 올린 뒤 1년 안에는 못 올림",
          laws: [
            { label: "주택임대차보호법 제6조의3 제3항", url: H6_3 },
            { label: "주택임대차보호법 제7조 제1항·제2항", url: H7 },
          ],
        },
        {
          id: "jeonse-landlord.deposit-return",
          title:
            "보증금을 돌려줄 때까지 임대차는 이어진 것으로 봄 · 못 돌려주면 세입자가 임차권등기를 할 수 있고 그 비용도 청구할 수 있음",
          laws: [
            { label: "주택임대차보호법 제4조 제2항", url: H4 },
            { label: "주택임대차보호법 제3조의3 제1항·제8항", url: H3_3 },
          ],
        },
      ],
    },
  ],
  notCovered: NOT_COVERED,
};

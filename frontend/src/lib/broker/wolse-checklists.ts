/**
 * 아파트 월세 체크 목록 세 장의 자료 — 중개사용 `/broker/wolse` · 세입자용 `/checklist/wolse-tenant` · 집주인용 `/checklist/wolse-landlord`.
 * **손으로 관리한다**(세션 517).
 *
 * - 규칙은 checklists.ts 머리 주석과 같다: 조문 주소는 law-urls.ts · 항목 id 는 체크 저장 키라 바꾸지 않는다
 *   (`<type>.<영문 소문자-하이픈>` 꼴 · 순번 금지) · 법이 바뀌면 checkedAt 을 고친다.
 * - 항목 글자는 사장님이 승인한 그림(세션 517) 그대로다 — 고칠 땐 다시 여쭙는다.
 * - 월세도 임대차라 전세 목록과 같은 항목이 많다. 그 항목은 전세 자료(checklists.ts JEONSE · party-checklists.ts)의
 *   title·detail·laws·links 를 **글자 그대로 옮겨 적고** id 접두어만 바꿨다(`jeonse.registry` → `wolse.registry`).
 *   전세 쪽 글자를 고치면 여기도 같이 고친다 — 시험(wolse-checklists.test.ts 「같은 항목」)이 어긋남을 잡는다.
 *   예외 = 집주인 「만기 때」 renewal-notice(제목만 같고 설명·근거에 월세 연체 줄을 더함).
 * - 보증금 → 월세 전환 상한은 법 글자 그대로 「연 10%와 「한국은행 기준금리 + 연 2%」 중 낮은 비율」로 적는다
 *   (그날 기준금리로 계산한 숫자는 적지 않는다 — 사장님 결정 ⓐ). 「금리」 낱말은 이 법 글자에만.
 * - 월세 세액공제 항목은 숫자 0(소득·%·한도 금액 없음 — 결정 ⓑ). 금융위 등록 전이라 상담·제휴 같은 말도 넣지 않는다.
 * - 이 파일은 checklists.ts 에서 **타입만** 가져온다(런타임에 서로 부르지 않게). 레지스트리 CHECKLISTS 는 checklists.ts 에 있다.
 * 시험 = `src/lib/broker/__tests__/wolse-checklists.test.ts` · `checklists.test.ts`(조문 글자↔주소 짝은 아홉 목록 전부).
 */
import type { DealChecklist } from "./checklists";
import {
  A25,
  A25_3,
  A26,
  A30,
  A32,
  CV640,
  D21,
  D22,
  H10_2,
  H3,
  H3_2,
  H3_3,
  H3_6,
  H3_7,
  H4,
  H6,
  H6_2,
  H6_3,
  H7,
  H7_2,
  H8,
  HD9,
  L6,
  R29_2,
  RD4_3,
  RT6_2,
  RT6_5,
  T109,
  TS95_2,
} from "./law-urls";

const FEE_CALC = { label: "중개수수료 계산기", href: "/tools/brokerage-fee" };
/** 보증금 → 월세 전환 상한(주택임대차보호법 제7조의2 · 시행령 제9조) — 법 글자 그대로(결정 ⓐ) */
const CONVERSION_CAP = "보증금을 월세로 바꿀 때 월세 상한 = 바꾸는 금액 × (연 10%와 「한국은행 기준금리 + 연 2%」 중 낮은 비율) ÷ 12";

export const WOLSE: DealChecklist = {
  type: "wolse",
  audience: "broker",
  partyTypes: ["wolse-tenant", "wolse-landlord"],
  name: "월세",
  h1: "월세 중개 체크 목록 — 공인중개사용",
  description:
    "아파트 월세 중개에서 계약 전·계약·계약 뒤에 할 일을 법 조문 순서로 정리했습니다. 항목마다 근거 조문 원문으로 이어집니다.",
  checkedAt: "2026-11-16",
  stages: [
    {
      id: "before-property",
      title: "계약 전 — 물건 확인",
      items: [
        {
          id: "wolse.registry",
          title: "등기사항증명서로 권리관계 확인",
          detail: "소유자, 근저당·전세권·압류·가등기, 신탁등기 여부. 설명할 때 근거자료로 보여 줍니다.",
          laws: [
            { label: "공인중개사법 제25조 제1항", url: A25 },
            { label: "공인중개사법 시행령 제21조 제1항 제2호", url: D21 },
          ],
        },
        {
          id: "wolse.trust",
          title: "신탁등기가 있으면 신탁원부 확인",
          detail: "신탁원부도 설명의 근거자료로 보여 줍니다(2025. 8. 14. 개정으로 추가).",
          laws: [{ label: "공인중개사법 제25조 제1항", url: A25 }],
        },
        {
          id: "wolse.building",
          title: "건축물대장으로 용도·면적·구조·건축연도 확인",
          laws: [
            { label: "공인중개사법 제25조 제1항", url: A25 },
            { label: "공인중개사법 시행령 제21조 제1항 제1호", url: D21 },
          ],
        },
        {
          id: "wolse.land-use",
          title: "토지이용계획·공법상 이용제한 확인",
          laws: [{ label: "공인중개사법 시행령 제21조 제1항 제4호", url: D21 }],
        },
        {
          id: "wolse.maintenance",
          title: "관리비 금액과 산출내역 확인",
          detail: "주택 임대차 중개에만 적용되는 항목입니다.",
          laws: [{ label: "공인중개사법 시행령 제21조 제1항 제3호의2", url: D21 }],
        },
        {
          id: "wolse.condition",
          title: "시설물·벽면·바닥·도배 상태, 일조·소음 등 환경, 입지 확인",
          laws: [{ label: "공인중개사법 시행령 제21조 제1항 제5호~제8호", url: D21 }],
        },
        {
          id: "wolse.refused-docs",
          title: "집주인이 자료를 안 주면 그 사실을 설명하고 확인·설명서에 적기",
          detail:
            "집이나 시설의 상태에 관한 자료를 임대인에게 요구했는데 주지 않으면, 그 사실을 임차인에게 설명하고 확인·설명서에 적습니다.",
          laws: [
            { label: "공인중개사법 제25조 제2항", url: A25 },
            { label: "공인중개사법 시행령 제21조 제2항", url: D21 },
          ],
        },
      ],
    },
    {
      id: "before-parties",
      title: "계약 전 — 임대인 정보와 임차인 권리",
      items: [
        {
          id: "wolse.landlord-info",
          title: "임대인이 확정일자 현황과 국세·지방세 납세증명서를 보여 주는지 확인",
          detail:
            "임대인은 계약 때 이 두 가지를 임차인에게 보여 줘야 합니다. 계약 전에 열람에 동의하면 그것으로 갈음합니다.",
          laws: [
            { label: "주택임대차보호법 제3조의7", url: H3_7 },
            { label: "공인중개사법 시행령 제21조 제1항 제10호", url: D21 },
          ],
        },
        {
          id: "wolse.explain-rights",
          title: "임차인에게 두 가지 신청을 설명",
          detail:
            "ⓐ 임대인 동의를 받아 확정일자 부여기관에 그 집의 확정일자·보증금·차임 정보를 요청할 수 있다. ⓑ 임대인 동의를 받아 임대인이 내지 않은 국세·지방세 열람을 신청할 수 있다(보증금이 시행령 금액을 넘으면 임대차 시작일까지 동의 없이도).",
          laws: [
            { label: "공인중개사법 제25조의3", url: A25_3 },
            { label: "주택임대차보호법 제3조의6", url: H3_6 },
            { label: "국세징수법 제109조", url: T109 },
            { label: "지방세징수법 제6조", url: L6 },
          ],
        },
        {
          id: "wolse.move-in-households",
          title: "전입세대확인서 열람·교부 안내",
          detail:
            "그 주소에 전입한 세대주·동거인과 전입일을 보는 서류. 임대차계약자 본인이나 위임받은 사람이 신청합니다.",
          laws: [
            { label: "공인중개사법 시행령 제21조 제1항 제11호", url: D21 },
            { label: "주민등록법 제29조의2", url: R29_2 },
          ],
        },
        {
          id: "wolse.small-deposit",
          title: "보증금 중 일정액 보호(최우선변제) 설명",
          detail: "경매신청 등기 전에 이사(인도)와 주민등록을 마쳐야 받을 수 있습니다.",
          laws: [
            { label: "주택임대차보호법 제8조", url: H8 },
            { label: "공인중개사법 시행령 제21조 제1항 제10호", url: D21 },
          ],
        },
        {
          id: "wolse.private-rental",
          title: "민간임대주택이면 임대보증금 보증 설명",
          laws: [{ label: "공인중개사법 시행령 제21조 제1항 제12호", url: D21 }],
        },
      ],
    },
    {
      id: "contract",
      title: "계약",
      items: [
        {
          id: "wolse.fee",
          title: "중개보수·실비 금액과 산출내역 설명",
          laws: [{ label: "공인중개사법 시행령 제21조 제1항 제3호", url: D21 }],
          links: [{ label: "중개수수료 계산기", href: "/tools/brokerage-fee" }],
        },
        {
          id: "wolse.confirm-doc",
          title: "확인·설명서 작성·교부, 3년 보존",
          detail:
            "별지 제20호서식. 개업공인중개사가 서명 및 날인(중개한 소속공인중개사가 있으면 함께). 거래계약서를 쓸 때 교부합니다.",
          laws: [
            { label: "공인중개사법 제25조 제3항·제4항", url: A25 },
            { label: "공인중개사법 시행령 제21조 제3항·제4항", url: D21 },
          ],
          links: [
            {
              label: "서식 원문(법제처)",
              href: "https://www.law.go.kr/법령별표서식/(공인중개사법시행규칙,서식20)",
            },
          ],
        },
        {
          id: "wolse.contract",
          title: "거래계약서 작성·교부, 5년 보존",
          detail:
            "꼭 적을 9가지: 당사자 인적사항 · 물건 표시 · 계약일 · 금액과 지급일자 · 인도일시 · 권리이전 내용 · 조건이나 기한 · 확인·설명서 교부일자 · 그 밖의 약정. 금액을 거짓으로 적거나 계약서를 두 개 쓰면 안 됩니다.",
          laws: [
            { label: "공인중개사법 제26조", url: A26 },
            { label: "공인중개사법 시행령 제22조", url: D22 },
          ],
          links: [
            {
              label: "주택임대차 표준계약서(법무부)",
              href: "https://www.moj.go.kr/bbs/moj/118/575868/artclView.do",
            },
          ],
        },
        {
          id: "wolse.guarantee",
          title: "손해배상책임 보장 설명과 증서 사본 교부",
          detail: "보장금액 · 보증기관과 소재지 · 보장기간.",
          laws: [{ label: "공인중개사법 제30조 제5항", url: A30 }],
        },
      ],
    },
    {
      id: "after",
      title: "계약 뒤 — 손님에게 안내",
      items: [
        {
          id: "wolse.lease-report",
          title: "임대차 신고: 계약일부터 30일 안",
          detail:
            "보증금 6천만원 초과 또는 월 차임 30만원 초과(금액 변동 없이 기간만 늘리는 갱신은 제외). 임대인·임차인이 함께 신고합니다. 대상 지역 = 특별자치시·특별자치도·시·구, 군은 광역시·경기도의 군만. 임차인이 전입신고를 하면 신고한 것으로 보고, 계약서를 내고 신고가 접수되면 확정일자를 받은 것으로 봅니다.",
          laws: [
            { label: "부동산거래신고법 제6조의2", url: RT6_2 },
            { label: "부동산거래신고법 제6조의5", url: RT6_5 },
            { label: "부동산거래신고법 시행령 제4조의3", url: RD4_3 },
          ],
        },
        {
          id: "wolse.opposability",
          title: "이사·전입신고 → 다음 날부터 대항력, 확정일자까지 갖추면 우선변제권",
          laws: [
            { label: "주택임대차보호법 제3조 제1항", url: H3 },
            { label: "주택임대차보호법 제3조의2 제2항", url: H3_2 },
          ],
        },
        {
          id: "wolse.rent-arrears-notice",
          title: "월세를 2기분 밀리면 집주인이 계약을 해지할 수 있고, 갱신 요구 거절·자동 연장 제외 사유도 된다고 안내",
          laws: [
            { label: "민법 제640조", url: CV640 },
            { label: "주택임대차보호법 제6조 제3항", url: H6 },
            { label: "주택임대차보호법 제6조의3 제1항 제1호", url: H6_3 },
          ],
        },
        {
          id: "wolse.rent-caps-notice",
          title: "월세·보증금 인상 상한(5%)과 보증금을 월세로 바꿀 때의 상한을 안내 — 넘게 낸 돈은 돌려받을 수 있음",
          detail: `${CONVERSION_CAP}.`,
          laws: [
            { label: "주택임대차보호법 제6조의3 제3항", url: H6_3 },
            { label: "주택임대차보호법 제7조", url: H7 },
            { label: "주택임대차보호법 제7조의2", url: H7_2 },
            { label: "주택임대차보호법 시행령 제9조", url: HD9 },
            { label: "주택임대차보호법 제10조의2", url: H10_2 },
          ],
        },
      ],
    },
  ],
  notCovered: ["보증금 반환보증(HUG 등) 가입 요건", "월세 세액공제 조건", "개별 특약 문구"],
};

export const WOLSE_TENANT: DealChecklist = {
  type: "wolse-tenant",
  audience: "party",
  name: "세입자용",
  h1: "월세 계약 체크리스트 — 세입자용",
  description:
    "아파트 월세 계약에서 세입자(임차인)가 계약 전·계약·사는 동안·만기 때 챙길 일을 법 조문과 함께 정리했습니다.",
  checkedAt: "2026-11-16",
  stages: [
    {
      id: "before",
      title: "계약 전 — 집과 집주인 확인",
      items: [
        {
          id: "wolse-tenant.registry-explain",
          title: "중개사에게 등기사항증명서·건축물대장을 보여 달라고 하고 근저당·압류·신탁 설명 듣기",
          laws: [
            { label: "공인중개사법 제25조 제1항", url: A25 },
            { label: "공인중개사법 시행령 제21조 제1항", url: D21 },
          ],
        },
        {
          id: "wolse-tenant.landlord-info",
          title:
            "집주인에게 확정일자 현황과 국세·지방세 납세증명서 받기(계약 전에 열람에 동의했으면 그것으로 갈음)",
          detail: "법은 집주인이 계약할 때 세입자에게 보여 주도록 정합니다.",
          laws: [{ label: "주택임대차보호법 제3조의7", url: H3_7 }],
        },
        {
          id: "wolse-tenant.fixed-date-info",
          title: "집주인 동의를 받아 주민센터 등에 그 집의 확정일자·보증금 정보 요청",
          laws: [{ label: "주택임대차보호법 제3조의6 제4항", url: H3_6 }],
        },
        {
          id: "wolse-tenant.unpaid-tax",
          title:
            "집주인이 안 낸 세금 열람 신청(동의 필요 · 보증금이 시행령 금액을 넘으면 임대차 시작일까지 동의 없이도)",
          laws: [
            { label: "국세징수법 제109조", url: T109 },
            { label: "지방세징수법 제6조", url: L6 },
          ],
        },
        {
          id: "wolse-tenant.move-in-households",
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
          id: "wolse-tenant.contract-docs",
          title: "거래계약서와 확인·설명서를 받기(중개사 서명·날인 확인)",
          laws: [
            { label: "공인중개사법 제25조 제3항·제4항", url: A25 },
            { label: "공인중개사법 제26조 제1항·제2항", url: A26 },
          ],
        },
        {
          id: "wolse-tenant.guarantee",
          title: "중개사 손해배상 보증 증서 사본 받기(보장금액·기관·기간)",
          laws: [{ label: "공인중개사법 제30조 제5항", url: A30 }],
        },
        {
          id: "wolse-tenant.fee",
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
          id: "wolse-tenant.lease-report",
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
          id: "wolse-tenant.opposability",
          title: "이사·전입신고 → 다음 날부터 대항력, 확정일자까지 갖추면 우선변제권",
          laws: [
            { label: "주택임대차보호법 제3조 제1항", url: H3 },
            { label: "주택임대차보호법 제3조의2 제2항", url: H3_2 },
          ],
        },
        {
          id: "wolse-tenant.small-deposit",
          title: "보증금 중 일정액 보호(최우선변제) 대상인지 확인 — 경매신청 등기 전에 이사·전입을 마쳐야 함",
          laws: [{ label: "주택임대차보호법 제8조", url: H8 }],
        },
      ],
    },
    {
      id: "during",
      title: "사는 동안 — 월세",
      items: [
        {
          id: "wolse-tenant.rent-arrears",
          title:
            "월세를 2기분 밀리면 집주인이 계약을 해지할 수 있음 — 갱신 요구를 거절당하거나 자동 연장이 안 되는 사유도 됨",
          laws: [
            { label: "민법 제640조", url: CV640 },
            { label: "주택임대차보호법 제6조 제3항", url: H6 },
            { label: "주택임대차보호법 제6조의3 제1항 제1호", url: H6_3 },
          ],
        },
        {
          id: "wolse-tenant.increase-cap",
          title:
            "계약 중이거나 갱신을 요구해 연장할 때 월세·보증금 인상은 5% 이내(시·도 조례로 더 낮을 수 있음), 계약하거나 올린 뒤 1년 안에는 못 올림",
          laws: [
            { label: "주택임대차보호법 제6조의3 제3항", url: H6_3 },
            { label: "주택임대차보호법 제7조 제1항·제2항", url: H7 },
          ],
        },
        {
          id: "wolse-tenant.conversion-cap",
          title: CONVERSION_CAP,
          laws: [
            { label: "주택임대차보호법 제7조의2", url: H7_2 },
            { label: "주택임대차보호법 시행령 제9조", url: HD9 },
          ],
        },
        {
          id: "wolse-tenant.overpaid-refund",
          title: "법 상한보다 더 낸 월세·보증금은 돌려 달라고 할 수 있음",
          laws: [{ label: "주택임대차보호법 제10조의2", url: H10_2 }],
        },
        {
          id: "wolse-tenant.rent-tax-credit",
          title: "집 없는 세대주인 근로자 등이 조건에 맞으면 신청해서 월세 세액공제를 받을 수 있음",
          detail: "소득·집 조건은 조문 원문으로 확인합니다.",
          laws: [{ label: "조세특례제한법 제95조의2", url: TS95_2 }],
        },
      ],
    },
    {
      id: "expiry",
      title: "만기 때",
      items: [
        {
          id: "wolse-tenant.renewal-request",
          title: "계약갱신 요구는 끝나기 6개월 전 ~ 2개월 전에(1번만 · 갱신되면 2년)",
          laws: [{ label: "주택임대차보호법 제6조의3 제1항·제2항", url: H6_3 }],
        },
        {
          id: "wolse-tenant.implied-renewal-exit",
          title: "아무도 통지 안 해서 자동 연장됐으면 세입자는 언제든 해지 통지 가능 — 3개월 뒤 효력",
          laws: [
            { label: "주택임대차보호법 제6조", url: H6 },
            { label: "주택임대차보호법 제6조의2", url: H6_2 },
            { label: "주택임대차보호법 제6조의3 제4항", url: H6_3 },
          ],
        },
        {
          id: "wolse-tenant.lease-registration",
          title: "끝났는데 보증금을 못 받으면 임차권등기명령 신청 → 등기를 마치면 이사해도 대항력·우선변제권 유지",
          laws: [{ label: "주택임대차보호법 제3조의3 제1항·제5항", url: H3_3 }],
        },
      ],
    },
  ],
  notCovered: ["보증금 반환보증(HUG 등) 가입 요건", "개별 특약 문구"],
};

export const WOLSE_LANDLORD: DealChecklist = {
  type: "wolse-landlord",
  audience: "party",
  name: "집주인용",
  h1: "월세 계약 체크리스트 — 집주인용",
  description:
    "아파트 월세 계약에서 집주인(임대인)이 계약 전·계약·사는 동안·만기 때 지킬 일과 챙길 일을 법 조문과 함께 정리했습니다.",
  checkedAt: "2026-11-16",
  stages: [
    {
      id: "contract",
      title: "계약 전·계약",
      items: [
        {
          id: "wolse-landlord.show-info",
          title: "세입자에게 확정일자 현황과 국세·지방세 납세증명서 보여 주기(또는 계약 전 열람 동의) — 의무",
          laws: [{ label: "주택임대차보호법 제3조의7", url: H3_7 }],
        },
        {
          id: "wolse-landlord.condition-docs",
          title: "중개사가 집·시설 상태 자료를 달라고 하면 주기 — 안 주면 그 사실이 확인·설명서에 적힘",
          laws: [
            { label: "공인중개사법 제25조 제2항", url: A25 },
            { label: "공인중개사법 시행령 제21조 제2항", url: D21 },
          ],
        },
        {
          id: "wolse-landlord.contract-docs",
          title: "거래계약서와 확인·설명서 받기",
          laws: [
            { label: "공인중개사법 제25조 제3항", url: A25 },
            { label: "공인중개사법 제26조 제1항", url: A26 },
          ],
        },
        {
          id: "wolse-landlord.fee",
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
          id: "wolse-landlord.lease-report",
          title: "임대차 신고: 계약일부터 30일 안, 세입자와 함께",
          detail: "한쪽이 신고를 거부하면 다른 쪽이 혼자 신고할 수 있습니다.",
          laws: [{ label: "부동산거래신고법 제6조의2", url: RT6_2 }],
        },
        {
          id: "wolse-landlord.minimum-term",
          title: "기간을 2년보다 짧게 정해도 2년으로 봄(세입자는 짧은 기간을 주장할 수 있음)",
          laws: [{ label: "주택임대차보호법 제4조 제1항", url: H4 }],
        },
      ],
    },
    {
      id: "during",
      title: "사는 동안 — 월세",
      items: [
        {
          id: "wolse-landlord.rent-arrears-terminate",
          title: "세입자가 월세를 2기분 밀리면 계약을 해지할 수 있음",
          laws: [{ label: "민법 제640조", url: CV640 }],
        },
        {
          id: "wolse-landlord.increase-cap",
          title:
            "계약 중이거나 세입자 요구로 갱신할 때 월세·보증금 인상은 5% 이내(시·도 조례로 더 낮을 수 있음), 계약하거나 올린 뒤 1년 안에는 못 올림",
          laws: [
            { label: "주택임대차보호법 제6조의3 제3항", url: H6_3 },
            { label: "주택임대차보호법 제7조 제1항·제2항", url: H7 },
          ],
        },
        {
          id: "wolse-landlord.conversion-cap",
          title: `${CONVERSION_CAP} — 넘게 받은 돈은 세입자가 돌려 달라고 할 수 있음`,
          laws: [
            { label: "주택임대차보호법 제7조의2", url: H7_2 },
            { label: "주택임대차보호법 시행령 제9조", url: HD9 },
            { label: "주택임대차보호법 제10조의2", url: H10_2 },
          ],
        },
      ],
    },
    {
      id: "expiry",
      title: "만기 때",
      items: [
        {
          id: "wolse-landlord.renewal-notice",
          title: "갱신 거절·조건 변경은 끝나기 6개월 전 ~ 2개월 전에 통지 — 안 하면 같은 조건으로 2년 자동 연장",
          detail: "월세를 2기분 밀린 세입자에게는 자동 연장이 적용되지 않습니다.",
          laws: [
            { label: "주택임대차보호법 제6조 제1항·제2항", url: H6 },
            { label: "주택임대차보호법 제6조 제3항", url: H6 },
          ],
        },
        {
          id: "wolse-landlord.renewal-refusal",
          title:
            "세입자 갱신 요구는 정해진 사유(2기 차임 연체·직접 거주 등 9가지)가 없으면 거절 못 함 — 직접 거주로 거절하고 남에게 세를 주면 손해배상",
          detail: "손해배상은 정당한 사유 없이, 원래 갱신됐을 기간이 끝나기 전에 남에게 세를 준 경우입니다.",
          laws: [{ label: "주택임대차보호법 제6조의3 제1항·제5항", url: H6_3 }],
        },
        {
          id: "wolse-landlord.deposit-return",
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
  notCovered: ["월세 임대소득 세금", "보증금 반환보증(HUG 등) 가입 요건", "개별 특약 문구"],
};

/**
 * 아파트 매매 체크 목록 세 장의 자료 — 중개사용 `/broker/sale` · 매수인용 `/checklist/sale-buyer` · 매도인용 `/checklist/sale-seller`.
 * **손으로 관리한다**(세션 516).
 *
 * - 규칙은 checklists.ts 머리 주석과 같다: 조문 주소는 law-urls.ts · 항목 id 는 체크 저장 키라 바꾸지 않는다
 *   (`<type>.<영문 소문자-하이픈>` 꼴 · 순번 금지) · 법이 바뀌면 checkedAt 을 고친다.
 * - 항목 글자는 사장님이 승인한 그림(세션 516) 그대로다 — 고칠 땐 다시 여쭙는다.
 * - 금융위 등록 전이라 대출은 「계산 링크」까지만 — 비율·금액 숫자와 상담·금리·제휴 같은 말을 넣지 않는다
 *   (홈 `components/home/HomeLoanPanel.tsx` 머리 주석의 금지 목록 · 시험이 막는다).
 * - 토지거래허가구역은 구역 이름·목록을 적지 않는다(바뀌는 공고를 손으로 옮기지 않기).
 * - 이 파일은 checklists.ts 에서 **타입만** 가져온다(런타임에 서로 부르지 않게). 레지스트리 CHECKLISTS 는 checklists.ts 에 있다.
 * 시험 = `src/lib/broker/__tests__/sale-checklists.test.ts` · `checklists.test.ts`(조문 글자↔주소 짝은 여섯 목록 전부).
 */
import type { DealChecklist } from "./checklists";
import {
  A25,
  A26,
  A30,
  A32,
  CV565,
  D21,
  D22,
  H3,
  IT105,
  IT89,
  LT20,
  R16,
  RD3,
  RG23,
  RGS2,
  RT11,
  RT17,
  RT3,
  RT3_2,
} from "./law-urls";

const FEE_CALC = { label: "중개수수료 계산기", href: "/tools/brokerage-fee" };
const ACQ_TAX_CALC = { label: "취득세 계산기", href: "/tools/acquisition-tax" };

export const SALE: DealChecklist = {
  type: "sale",
  audience: "broker",
  partyTypes: ["sale-buyer", "sale-seller"],
  name: "매매",
  h1: "매매 중개 체크 목록 — 공인중개사용",
  description:
    "아파트 매매 중개에서 계약 전·계약·계약 뒤에 할 일을 법 조문 순서로 정리했습니다. 항목마다 근거 조문 원문으로 이어집니다.",
  checkedAt: "2026-11-16",
  stages: [
    {
      id: "before-property",
      title: "계약 전 — 물건 확인",
      items: [
        {
          id: "sale.registry",
          title: "등기사항증명서로 권리관계 확인",
          detail: "소유자, 근저당·압류·가등기, 신탁등기 여부. 설명할 때 근거자료로 보여 줍니다.",
          laws: [
            { label: "공인중개사법 제25조 제1항", url: A25 },
            { label: "공인중개사법 시행령 제21조 제1항 제2호", url: D21 },
          ],
        },
        {
          id: "sale.trust",
          title: "신탁등기가 있으면 신탁원부 확인",
          laws: [{ label: "공인중개사법 제25조 제1항", url: A25 }],
        },
        {
          id: "sale.building",
          title: "건축물대장으로 용도·면적·구조·건축연도 확인",
          laws: [{ label: "공인중개사법 시행령 제21조 제1항 제1호", url: D21 }],
        },
        {
          id: "sale.land-use",
          title: "토지이용계획·공법상 거래규제 확인 — 토지거래허가구역이면 계약 전에 허가가 필요함을 설명",
          detail: "허가구역 여부는 토지이용계획확인서에 나옵니다.",
          laws: [
            { label: "공인중개사법 시행령 제21조 제1항 제4호", url: D21 },
            { label: "부동산거래신고법 제11조", url: RT11 },
          ],
        },
        {
          id: "sale.condition",
          title: "시설물·벽면·바닥·도배 상태, 일조·소음 등 환경, 입지 확인",
          laws: [{ label: "공인중개사법 시행령 제21조 제1항 제5호~제8호", url: D21 }],
        },
        {
          id: "sale.refused-docs",
          title: "매도인이 상태 자료를 안 주면 그 사실을 설명하고 확인·설명서에 적기",
          laws: [
            { label: "공인중개사법 제25조 제2항", url: A25 },
            { label: "공인중개사법 시행령 제21조 제2항", url: D21 },
          ],
        },
      ],
    },
    {
      id: "before-money",
      title: "계약 전 — 금액과 세금",
      items: [
        {
          id: "sale.price-fee",
          title: "거래예정금액·중개보수·실비와 산출내역 설명",
          laws: [{ label: "공인중개사법 시행령 제21조 제1항 제3호", url: D21 }],
          links: [FEE_CALC],
        },
        {
          id: "sale.buyer-tax",
          title: "사는 사람이 내야 할 세금의 종류와 세율 설명",
          laws: [{ label: "공인중개사법 시행령 제21조 제1항 제9호", url: D21 }],
          links: [ACQ_TAX_CALC],
        },
        {
          id: "sale.funding-plan",
          title: "자금조달·입주계획서를 내야 하는 거래인지 안내",
          detail:
            "집값이 일정 금액 이상이거나 규제지역에 있는 주택, 법인이 사는 주택 등이 대상입니다. 대상은 시행령 별표 1 원문으로 확인합니다.",
          laws: [
            { label: "부동산거래신고법 제3조 제1항", url: RT3 },
            { label: "부동산거래신고법 시행령 제3조", url: RD3 },
          ],
        },
      ],
    },
    {
      id: "contract",
      title: "계약",
      items: [
        {
          id: "sale.confirm-doc",
          title: "확인·설명서 작성·교부, 3년 보존",
          laws: [{ label: "공인중개사법 제25조 제3항·제4항", url: A25 }],
          links: [
            {
              label: "서식 원문(법제처)",
              href: "https://www.law.go.kr/법령별표서식/(공인중개사법시행규칙,서식20)",
            },
          ],
        },
        {
          id: "sale.contract",
          title: "거래계약서 작성·교부, 5년 보존",
          detail: "꼭 적을 9가지. 금액을 거짓으로 적거나 계약서를 두 개 쓰면 안 됩니다.",
          laws: [
            { label: "공인중개사법 제26조", url: A26 },
            { label: "공인중개사법 시행령 제22조", url: D22 },
          ],
        },
        {
          id: "sale.guarantee",
          title: "손해배상책임 보장 설명과 증서 사본 교부",
          laws: [{ label: "공인중개사법 제30조 제5항", url: A30 }],
        },
      ],
    },
    {
      id: "after",
      title: "계약 뒤",
      items: [
        {
          id: "sale.deal-report",
          title: "부동산 거래신고: 계약일부터 30일 안 — 중개한 거래는 개업공인중개사가 신고",
          laws: [{ label: "부동산거래신고법 제3조 제1항·제3항", url: RT3 }],
        },
        {
          id: "sale.cancel-report",
          title: "계약이 해제되면 해제가 확정된 날부터 30일 안에 해제 신고",
          laws: [{ label: "부동산거래신고법 제3조의2", url: RT3_2 }],
        },
        {
          id: "sale.registration-tax-notice",
          title: "손님에게 안내: 잔금을 치른 날부터 60일 안 소유권이전등기 · 취득일부터 60일 안 취득세",
          laws: [
            { label: "부동산등기 특별조치법 제2조", url: RGS2 },
            { label: "지방세법 제20조", url: LT20 },
          ],
        },
      ],
    },
  ],
  notCovered: ["주택 구입 대출 조건", "양도세 비과세 판정", "개별 특약 문구"],
};

export const SALE_BUYER: DealChecklist = {
  type: "sale-buyer",
  audience: "party",
  name: "매수인용 (집 살 때)",
  h1: "집 살 때 체크리스트 — 매수인용",
  description: "아파트를 살 때 계약 전·계약·잔금 뒤에 챙길 일을 법 조문과 함께 정리했습니다.",
  checkedAt: "2026-11-16",
  stages: [
    {
      id: "before",
      title: "계약 전 — 집과 자금",
      items: [
        {
          id: "sale-buyer.registry-explain",
          title: "중개사에게 등기사항증명서·건축물대장을 보여 달라고 하고 근저당·압류·신탁 설명 듣기",
          laws: [
            { label: "공인중개사법 제25조 제1항", url: A25 },
            { label: "공인중개사법 시행령 제21조 제1항", url: D21 },
          ],
        },
        {
          id: "sale-buyer.land-permit",
          title:
            "토지거래허가구역인지 확인 — 허가구역이면 계약 전에 허가를 받고, 허가받은 목적대로 정해진 기간 써야 함(실거주 등)",
          laws: [
            { label: "부동산거래신고법 제11조", url: RT11 },
            { label: "부동산거래신고법 제17조", url: RT17 },
          ],
        },
        {
          id: "sale-buyer.funding-plan",
          title: "자금조달·입주계획서를 내야 하는 거래인지 확인",
          laws: [
            { label: "부동산거래신고법 제3조 제1항", url: RT3 },
            { label: "부동산거래신고법 시행령 제3조", url: RD3 },
          ],
        },
        {
          id: "sale-buyer.loan-calc",
          title: "살 단지 화면에서 구입 대출 한도를 먼저 계산해 보기",
          detail: "단지 화면의 「내 조건으로 계산하기 → 이 집을 사려고」에서 계산합니다.",
          laws: [],
          links: [{ label: "단지 찾기", href: "/search" }],
        },
        {
          id: "sale-buyer.tenant-succession",
          title: "전입신고를 하고 사는 세입자가 있으면 산 사람이 집주인 자리를 이어받음 — 보증금을 돌려줄 의무도 함께",
          laws: [{ label: "주택임대차보호법 제3조 제4항", url: H3 }],
        },
      ],
    },
    {
      id: "contract",
      title: "계약",
      items: [
        {
          id: "sale-buyer.deposit-release",
          title:
            "따로 정한 약정이 없으면, 계약금만 오간 단계에서는 사는 사람은 계약금을 포기하고, 파는 사람은 두 배를 돌려주고 계약을 풀 수 있음 — 상대가 이행에 들어가기 전까지",
          laws: [{ label: "민법 제565조", url: CV565 }],
        },
        {
          id: "sale-buyer.contract-docs",
          title: "거래계약서와 확인·설명서 받기(중개사 서명·날인 확인)",
          laws: [
            { label: "공인중개사법 제25조 제3항·제4항", url: A25 },
            { label: "공인중개사법 제26조 제1항", url: A26 },
          ],
        },
        {
          id: "sale-buyer.guarantee",
          title: "중개사 손해배상 보증 증서 사본 받기(보장금액·기관·기간)",
          laws: [{ label: "공인중개사법 제30조 제5항", url: A30 }],
        },
        {
          id: "sale-buyer.fee",
          title: "중개보수 금액 확인 → 계산기로 상한 비교",
          laws: [{ label: "공인중개사법 제32조", url: A32 }],
          links: [FEE_CALC],
        },
      ],
    },
    {
      id: "after",
      title: "계약 뒤 — 잔금과 이사",
      items: [
        {
          id: "sale-buyer.deal-report",
          title: "거래 신고: 계약일부터 30일 안(중개한 거래면 중개사가 신고)",
          laws: [{ label: "부동산거래신고법 제3조", url: RT3 }],
        },
        {
          id: "sale-buyer.ownership-registration",
          title: "잔금을 치른 날부터 60일 안에 소유권이전등기 신청",
          laws: [{ label: "부동산등기 특별조치법 제2조 제1항", url: RGS2 }],
        },
        {
          id: "sale-buyer.acquisition-tax",
          title: "취득일부터 60일 안에 취득세 신고·납부",
          laws: [{ label: "지방세법 제20조 제1항", url: LT20 }],
          links: [ACQ_TAX_CALC],
        },
        {
          id: "sale-buyer.move-in-report",
          title: "이사한 날부터 14일 안에 전입신고",
          laws: [{ label: "주민등록법 제16조 제1항", url: R16 }],
        },
      ],
    },
  ],
  notCovered: ["주택 구입 대출 조건", "개별 특약 문구"],
};

export const SALE_SELLER: DealChecklist = {
  type: "sale-seller",
  audience: "party",
  name: "매도인용 (집 팔 때)",
  h1: "집 팔 때 체크리스트 — 매도인용",
  description: "아파트를 팔 때 계약 전·계약·잔금 뒤에 지킬 일과 챙길 일을 법 조문과 함께 정리했습니다.",
  checkedAt: "2026-11-16",
  stages: [
    {
      id: "contract",
      title: "계약 전·계약",
      items: [
        {
          id: "sale-seller.condition-docs",
          title: "중개사가 집·시설 상태 자료를 달라고 하면 주기 — 안 주면 그 사실이 확인·설명서에 적힘",
          laws: [
            { label: "공인중개사법 제25조 제2항", url: A25 },
            { label: "공인중개사법 시행령 제21조 제2항", url: D21 },
          ],
        },
        {
          id: "sale-seller.tenant-succession",
          title: "전입신고를 하고 사는 세입자가 있으면 집주인 자리(보증금을 돌려줄 의무 포함)가 사는 사람에게 넘어감",
          laws: [{ label: "주택임대차보호법 제3조 제4항", url: H3 }],
        },
        {
          id: "sale-seller.deposit-release",
          title:
            "따로 정한 약정이 없으면, 계약금만 오간 단계에서 계약을 풀려면 받은 계약금의 두 배를 돌려줌 — 상대가 이행에 들어가기 전까지",
          laws: [{ label: "민법 제565조", url: CV565 }],
        },
        {
          id: "sale-seller.contract-docs",
          title: "거래계약서와 확인·설명서 받기",
          laws: [
            { label: "공인중개사법 제25조 제3항", url: A25 },
            { label: "공인중개사법 제26조 제1항", url: A26 },
          ],
        },
        {
          id: "sale-seller.fee",
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
          id: "sale-seller.deal-report",
          title: "거래 신고: 계약일부터 30일 안(중개한 거래면 중개사, 직접 거래면 둘이 함께)",
          laws: [{ label: "부동산거래신고법 제3조", url: RT3 }],
        },
        {
          id: "sale-seller.cancel-report",
          title: "계약이 해제되면 해제가 확정된 날부터 30일 안에 해제 신고",
          laws: [{ label: "부동산거래신고법 제3조의2", url: RT3_2 }],
        },
        {
          id: "sale-seller.registration-docs",
          title: "잔금을 받을 때 등기 서류 넘기기 — 소유권이전등기는 사는 사람과 함께 신청",
          laws: [{ label: "부동산등기법 제23조 제1항", url: RG23 }],
        },
        {
          id: "sale-seller.transfer-tax",
          title:
            "양도소득세: 양도일이 속한 달의 말일부터 2개월 안에 예정신고 — 1세대 1주택 비과세인지 계산기로 먼저 확인",
          laws: [
            { label: "소득세법 제105조 제1항", url: IT105 },
            { label: "소득세법 제89조 제1항", url: IT89 },
          ],
          links: [{ label: "양도소득세 계산기", href: "/tools/transfer-tax" }],
        },
      ],
    },
  ],
  notCovered: ["양도세 비과세 판정", "개별 특약 문구"],
};

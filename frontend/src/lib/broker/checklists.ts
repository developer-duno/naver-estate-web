/**
 * 「중개 실무」 거래 유형별 체크 목록(/broker/<type>)의 자료 — **손으로 관리한다**(세션 513).
 *
 * - 출처·조문 주소는 열어 그 조문이 맞는지 본 뒤에만 적는다(법제처 한글 주소 `https://www.law.go.kr/법령/<법령명>/제X조`).
 * - 항목 id 는 바꾸지 않는다 — 다음 PR 에서 체크 저장 키가 된다(순번 금지 · `<type>.<영문 소문자-하이픈>` 꼴).
 * - 법이 바뀌어 항목을 고치면 그 목록의 checkedAt(법령 기준일, YYYY-MM-DD)을 고친다 — 사이트맵 lastmod 도 이 값을 쓴다.
 * - 장(/broker/[type])·허브 버튼·사이트맵이 모두 CHECKLISTS / CHECKLIST_TYPES 한 목록에서 나온다.
 * 시험 = `src/lib/broker/__tests__/checklists.test.ts`.
 */
export type LawRef = {
  /** 화면 글자(예: 「공인중개사법 제25조 제1항」) */
  label: string;
  /** 법제처 조문 주소(https) */
  url: string;
};

export type ChecklistItem = {
  /** 바꾸지 않는 키(예: `jeonse.registry`) */
  id: string;
  title: string;
  detail?: string;
  laws: LawRef[];
  /** 사이트 안 장(`/…`) 또는 공식 원문(https) */
  links?: { label: string; href: string }[];
};

export type ChecklistStage = {
  id: string;
  title: string;
  items: ChecklistItem[];
};

export type DealChecklist = {
  type: string;
  /** 허브 버튼 글자(예: 「전세」) */
  name: string;
  h1: string;
  description: string;
  /** 법령 기준일(YYYY-MM-DD) */
  checkedAt: string;
  stages: ChecklistStage[];
  notCovered: string[];
};

const LAW = "https://www.law.go.kr/법령/";

const A25 = `${LAW}공인중개사법/제25조`;
const A25_3 = `${LAW}공인중개사법/제25조의3`;
const A26 = `${LAW}공인중개사법/제26조`;
const A30 = `${LAW}공인중개사법/제30조`;
const D21 = `${LAW}공인중개사법시행령/제21조`;
const D22 = `${LAW}공인중개사법시행령/제22조`;
const H3 = `${LAW}주택임대차보호법/제3조`;
const H3_2 = `${LAW}주택임대차보호법/제3조의2`;
const H3_6 = `${LAW}주택임대차보호법/제3조의6`;
const H3_7 = `${LAW}주택임대차보호법/제3조의7`;
const H8 = `${LAW}주택임대차보호법/제8조`;
const T109 = `${LAW}국세징수법/제109조`;
const L6 = `${LAW}지방세징수법/제6조`;
const R29_2 = `${LAW}주민등록법/제29조의2`;
const RT6_2 = `${LAW}부동산거래신고등에관한법률/제6조의2`;
const RT6_5 = `${LAW}부동산거래신고등에관한법률/제6조의5`;
const RD4_3 = `${LAW}부동산거래신고등에관한법률시행령/제4조의3`;

const JEONSE: DealChecklist = {
  type: "jeonse",
  name: "전세",
  h1: "전세 계약 체크 목록",
  description:
    "아파트 전세 중개에서 계약 전·계약·계약 뒤에 할 일을 법 조문 순서로 정리했습니다. 항목마다 근거 조문 원문으로 이어집니다.",
  checkedAt: "2026-11-16",
  stages: [
    {
      id: "before-property",
      title: "계약 전 — 물건 확인",
      items: [
        {
          id: "jeonse.registry",
          title: "등기사항증명서로 권리관계 확인",
          detail: "소유자, 근저당·전세권·압류·가등기, 신탁등기 여부. 설명할 때 근거자료로 보여 줍니다.",
          laws: [
            { label: "공인중개사법 제25조 제1항", url: A25 },
            { label: "공인중개사법 시행령 제21조 제1항 제2호", url: D21 },
          ],
        },
        {
          id: "jeonse.trust",
          title: "신탁등기가 있으면 신탁원부 확인",
          detail: "신탁원부도 설명의 근거자료로 보여 줍니다(2025. 8. 14. 개정으로 추가).",
          laws: [{ label: "공인중개사법 제25조 제1항", url: A25 }],
        },
        {
          id: "jeonse.building",
          title: "건축물대장으로 용도·면적·구조·건축연도 확인",
          laws: [
            { label: "공인중개사법 제25조 제1항", url: A25 },
            { label: "공인중개사법 시행령 제21조 제1항 제1호", url: D21 },
          ],
        },
        {
          id: "jeonse.land-use",
          title: "토지이용계획·공법상 이용제한 확인",
          laws: [{ label: "공인중개사법 시행령 제21조 제1항 제4호", url: D21 }],
        },
        {
          id: "jeonse.maintenance",
          title: "관리비 금액과 산출내역 확인",
          detail: "주택 임대차 중개에만 적용되는 항목입니다.",
          laws: [{ label: "공인중개사법 시행령 제21조 제1항 제3호의2", url: D21 }],
        },
        {
          id: "jeonse.condition",
          title: "시설물·벽면·바닥·도배 상태, 일조·소음 등 환경, 입지 확인",
          laws: [{ label: "공인중개사법 시행령 제21조 제1항 제5호~제8호", url: D21 }],
        },
        {
          id: "jeonse.refused-docs",
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
          id: "jeonse.landlord-info",
          title: "임대인이 확정일자 현황과 국세·지방세 납세증명서를 보여 주는지 확인",
          detail:
            "임대인은 계약 때 이 두 가지를 임차인에게 보여 줘야 합니다. 계약 전에 열람에 동의하면 그것으로 갈음합니다.",
          laws: [
            { label: "주택임대차보호법 제3조의7", url: H3_7 },
            { label: "공인중개사법 시행령 제21조 제1항 제10호", url: D21 },
          ],
        },
        {
          id: "jeonse.explain-rights",
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
          id: "jeonse.move-in-households",
          title: "전입세대확인서 열람·교부 안내",
          detail:
            "그 주소에 전입한 세대주·동거인과 전입일을 보는 서류. 임대차계약자 본인이나 위임받은 사람이 신청합니다.",
          laws: [
            { label: "공인중개사법 시행령 제21조 제1항 제11호", url: D21 },
            { label: "주민등록법 제29조의2", url: R29_2 },
          ],
        },
        {
          id: "jeonse.small-deposit",
          title: "보증금 중 일정액 보호(최우선변제) 설명",
          detail: "경매신청 등기 전에 이사(인도)와 주민등록을 마쳐야 받을 수 있습니다.",
          laws: [
            { label: "주택임대차보호법 제8조", url: H8 },
            { label: "공인중개사법 시행령 제21조 제1항 제10호", url: D21 },
          ],
        },
        {
          id: "jeonse.private-rental",
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
          id: "jeonse.fee",
          title: "중개보수·실비 금액과 산출내역 설명",
          laws: [{ label: "공인중개사법 시행령 제21조 제1항 제3호", url: D21 }],
          links: [{ label: "중개수수료 계산기", href: "/tools/brokerage-fee" }],
        },
        {
          id: "jeonse.confirm-doc",
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
          id: "jeonse.contract",
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
          id: "jeonse.guarantee",
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
          id: "jeonse.lease-report",
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
          id: "jeonse.opposability",
          title: "이사·전입신고 → 다음 날부터 대항력, 확정일자까지 갖추면 우선변제권",
          laws: [
            { label: "주택임대차보호법 제3조 제1항", url: H3 },
            { label: "주택임대차보호법 제3조의2 제2항", url: H3_2 },
          ],
        },
      ],
    },
  ],
  notCovered: ["전세보증(HUG 등) 가입 요건", "전세대출 조건", "개별 특약 문구"],
};

/** 유형 키 → 체크 목록. 새 유형은 여기에 한 줄 더하면 장·허브 버튼·사이트맵이 함께 생긴다. */
export const CHECKLISTS = {
  jeonse: JEONSE,
} as const satisfies Record<string, DealChecklist>;

export type ChecklistType = keyof typeof CHECKLISTS;

export const CHECKLIST_TYPES = Object.keys(CHECKLISTS) as ChecklistType[];

/** 없는 유형이면 undefined */
export function getChecklist(type: string): DealChecklist | undefined {
  return Object.prototype.hasOwnProperty.call(CHECKLISTS, type) ? CHECKLISTS[type as ChecklistType] : undefined;
}

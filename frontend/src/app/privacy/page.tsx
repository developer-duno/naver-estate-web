import type { Metadata } from "next";
import PaidServicePausedNotice from "@/components/PaidServicePausedNotice";

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description: "2u부동산이 수집하는 개인정보 항목·이용 목적·보관 기간·국외 이전·보호책임자 연락처를 안내합니다.",
  alternates: { canonical: "/privacy" },
  openGraph: {
    url: "/privacy",
    title: "개인정보처리방침 | 2u부동산",
    description: "2u부동산이 수집하는 개인정보 항목·이용 목적·보관 기간·국외 이전·보호책임자 연락처를 안내합니다.",
    type: "website",
    // openGraph 를 직접 쓰면 root opengraph-image 상속이 끊긴다 → images 를 꼭 적는다(seo-metadata.md 룰 2)
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "2u부동산" }],
  },
};

/** 시행일 — 방침을 고치면 이 날짜와 맨 아래 개정 이력을 함께 고친다 */
const EFFECTIVE_DATE = "2026년 10월 6일";

/** 개인정보 보호책임자 연락처 */
const PRIVACY_OFFICER_EMAIL = "kyh11kyh@gmail.com";

/**
 * 국외 이전 표 (세션 439) — 연락처는 각 사 공식 개인정보 정책에서 확인한 것만 적는다.
 * 텔레그램·구글은 정책에 개인정보 문의 이메일이 없어 정책 주소를 적었다.
 */
const OVERSEAS_TRANSFERS: {
  recipient: string;
  contact: string;
  country: string;
  items: string;
  purpose: string;
  retention: string;
}[] = [
  {
    recipient: "Telegram Messenger Inc.",
    contact: "앱 안 설정 › Ask a Question · https://telegram.org/privacy",
    country:
      "텔레그램이 운영하는 국외 데이터센터(저장 국가는 텔레그램 개인정보 정책 기준 미공개)",
    items:
      "새 의견 알림(종류·보던 화면·내용 일부·로그인 여부, 이메일은 일부 가림) · 화면 오류 알림(화면 주소·오류 문구 일부) · 결제 기능을 쓰는 경우 결제 이상 알림(일부 가린 이메일)",
    purpose: "운영자에게 새 의견·오류·결제 이상을 알림",
    retention: "운영자가 알림 대화방에서 지울 때까지",
  },
  {
    recipient: "Google LLC (Gmail)",
    contact: "https://policies.google.com/privacy",
    country: "미국",
    items:
      "가입 이메일과 메일 내용(의견 답장, 공인중개사 인증 결과, 결제 기능을 쓰는 경우 자동결제 실패 안내)",
    purpose: "답장·알림 메일 보내기",
    retention: "운영자 메일함의 보낸 메일을 지울 때까지",
  },
  {
    recipient: "Vercel Inc.",
    contact: "privacy@vercel.com",
    country: "미국",
    items: "웹 화면 접속 기록(IP 주소·브라우저 정보·접속한 주소)",
    purpose: "웹 화면 제공",
    retention: "Vercel 정책에 따른 기간",
  },
  {
    recipient: "Cloudflare, Inc.",
    contact: "dpo@cloudflare.com",
    country: "미국",
    items: "서버로 가는 모든 요청(IP 주소·브라우저 정보·요청 내용)",
    purpose: "서버 앞 보안 연결 통로",
    retention: "Cloudflare 정책에 따른 기간",
  },
  {
    recipient: "Supabase Pte. Ltd.",
    contact: "privacy@supabase.com",
    country: "저장 위치 대한민국(서울), 운영사는 국외 법인",
    items: "1절의 회원·인증·결제·의견·화면 오류 정보",
    purpose: "회원 로그인 처리와 자료 보관(데이터베이스)",
    retention: "3절 보유 기간과 같음",
  },
];

/** 개정 이력 — 내용이 바뀐 날만 적는다(git log 기준) */
const REVISIONS: { date: string; summary: string }[] = [
  { date: "2026-10-06", summary: "화면 오류 자동 수집, 국외 이전, 정보주체 권리, 파기, 안전성 조치, 쿠키·브라우저 저장소, 보호책임자 연락처 추가" },
  { date: "2026-10-06", summary: "의견 보내기 추가" },
  { date: "2026-09-14", summary: "무료 운영 중 현황 고지 추가" },
  { date: "2026-06-24", summary: "유료 구독 결제 정보와 결제 처리 위탁 추가" },
  { date: "2026-06-16", summary: "공인중개사 인증 정보, 외부 대조 전송, 마케팅 정보 수신(선택) 추가" },
  { date: "2026-03-13", summary: "처음 게시" },
];

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold mb-2">개인정보 처리방침</h1>
      <p className="text-sm text-gray-500 mb-6">시행일: {EFFECTIVE_DATE}</p>

      {/* 무료 운영 중 현황 고지 — 1·2·5절이 유료 결제 데이터 수집·포트원 위탁을 전제하므로
          (세션 405 적대검증에서 terms·refund 만 고치고 여기를 빠뜨린 것이 적발됨).
          이 문서는 sitemap 에도 실려 검색 노출되므로 셋 중 노출 범위가 가장 넓다.
          유료 재개 시 LOCKED_PATHS 에서 /pricing 이 빠지면 자동으로 사라진다. */}
      <PaidServicePausedNotice />

      <section className="space-y-4 text-sm text-gray-700 leading-relaxed">
        <h2 className="text-lg font-semibold text-gray-900">1. 수집하는 개인정보</h2>
        <p>회원가입 시 아래 정보를 수집합니다:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>이메일 주소 (필수)</li>
          <li>비밀번호 (필수, 암호화 저장)</li>
        </ul>
        <p className="pt-2">
          공인중개사 자격 인증을 신청하는 경우, 아래 정보를 추가로 수집합니다:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>사업자등록번호 (필수)</li>
          <li>중개사무소 상호 (필수)</li>
          <li>대표자명 (필수)</li>
          <li>개업연월일 (필수)</li>
          <li>연락처 (필수)</li>
          <li>공인중개사 자격증 사본 (선택, 제출 시)</li>
        </ul>
        <p className="pt-2">
          유료 구독 이용권을 결제하는 경우, 결제 처리를 위해 아래 정보를 수집·보관합니다:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>결제 식별자(주문번호)·결제 금액·결제 상태·결제 일시·요금제 (필수)</li>
        </ul>
        <p className="text-xs text-gray-500 pt-1">
          ※ 카드번호 등 민감한 결제수단 정보는 본 서비스가 직접 수집·보관하지 않으며,
          결제대행사(포트원)가 직접 처리합니다.
        </p>
        <p className="pt-2">
          의견 보내기를 이용하는 경우, 아래 정보를 수집합니다:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>의견 내용·종류</li>
          <li>보던 화면 주소</li>
          <li>브라우저 정보(user agent)</li>
          <li>궁금한 소식(설문, 선택)</li>
          <li>로그인한 경우 가입 이메일</li>
        </ul>
        <p className="pt-2">
          화면에서 오류가 나면 아래 정보를 자동으로 수집합니다(이메일·회원 아이디는 수집하지 않습니다):
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>오류 이름·오류 문구</li>
          <li>오류가 난 화면 주소</li>
          <li>브라우저 정보(user agent)</li>
        </ul>

        <h2 className="text-lg font-semibold text-gray-900">2. 개인정보의 이용 목적</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>회원 식별 및 서비스 이용 인증</li>
          <li>공인중개사 자격 진위 확인 및 중개사무소 등록 여부 검증</li>
          <li>유료 구독 이용권 결제·환불 처리 및 이용 기간 관리</li>
          <li>서비스 이용 기록 관리</li>
          <li>서비스 오류 확인·수정</li>
          <li>서비스 개선 및 통계 분석</li>
          <li>
            (선택 동의 시) 신규 도구·서비스 소식, 혜택·이벤트 등 마케팅 정보의 안내 및 발송 —
            이메일, 카카오톡(알림톡·친구톡) 등 채널 이용
          </li>
        </ul>

        <h2 className="text-lg font-semibold text-gray-900">2-1. 마케팅 정보 수신 및 활용 (선택)</h2>
        <p>
          이용자가 별도로 동의한 경우에 한해, 가입 시 수집한 정보(이메일·연락처·사업자번호 등)를
          신규 서비스·혜택·이벤트 안내 등 마케팅 목적으로 활용하고, 이메일 및 카카오톡 등으로
          광고성 정보를 전송할 수 있습니다. 이 동의는 선택 사항이며, 동의하지 않아도 서비스
          가입·이용에 제한이 없습니다. 동의 후에도 언제든지 수신을 거부하거나 동의를 철회할 수
          있으며, 철회 시 마케팅 활용 및 광고성 정보 전송이 즉시 중단됩니다.
        </p>

        <h2 className="text-lg font-semibold text-gray-900">3. 개인정보의 보유 기간</h2>
        <p>
          회원 탈퇴 시까지 보유하며, 탈퇴 후 지체 없이 파기합니다.
          단, 관련 법령에 의해 보존이 필요한 경우 해당 기간 동안 보존합니다.
          공인중개사 인증 정보(사업자등록번호·중개사무소 상호·대표자명·개업연월일·연락처·자격증
          사본)는 인증 신청 철회 또는 회원 탈퇴 시까지 보유하며, 이후 지체 없이 파기합니다.
        </p>
        <p>
          의견 보내기로 받은 정보는 보낸 날부터 1년 보관한 뒤 삭제합니다. 공개한 답변의 제목과
          답은 개인정보를 지운 채 남깁니다. 회원 탈퇴 뒤에도 1년이 지나기 전까지는 의견이 남을 수
          있습니다.
        </p>
        <p>화면 오류 기록은 처음 기록된 날부터 1년 보관한 뒤 삭제합니다.</p>

        <h2 className="text-lg font-semibold text-gray-900">4. 개인정보의 제3자 제공 및 처리 위탁</h2>
        <p>
          수집된 개인정보는 원칙적으로 제3자에게 제공하지 않습니다. 다만, 공인중개사 자격
          인증을 위해 아래와 같이 입력하신 정보를 외부 공공기관 API에 대조 전송합니다:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            국세청(공공데이터포털): 사업자등록번호·대표자명·개업연월일 — 사업자등록 진위 및
            영업 상태 확인 목적
          </li>
          <li>
            국토교통부 V-WORLD: 중개사무소 상호·대표자명 — 부동산중개업 등록 여부 확인 목적
          </li>
        </ul>
        <p>
          위 대조 전송은 입력하신 자격이 실제 등록된 공인중개사인지 확인하기 위한 것이며, 그
          밖에 법령에 의한 요청이 있는 경우 외에는 제3자에게 제공하지 않습니다.
        </p>
        <p className="pt-2">
          유료 구독 결제 처리를 위해 아래와 같이 개인정보 처리를 위탁합니다:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            포트원(주식회사 코리아포트원): 결제·환불 처리 및 결제 내역 관리 — 결제 식별자·결제
            금액·결제수단 승인 정보. 위탁 업무 목적 범위 내에서만 처리되며, 결제·환불 처리 완료
            후 관련 법령이 정한 기간 동안 보관됩니다.
          </li>
        </ul>
        <p className="pt-2">
          서비스 운영을 위해 텔레그램(알림)·구글 Gmail(메일)·Vercel(웹 화면)·Cloudflare(서버 연결
          통로)·Supabase(회원·자료 보관)에 개인정보 처리를 위탁합니다. 모두 국외 업체이거나 국외로
          전송되므로 자세한 내용은 아래 4-1에 적었습니다.
        </p>

        <h2 className="text-lg font-semibold text-gray-900">4-1. 개인정보의 국외 이전</h2>
        <p>
          아래 정보는 서비스를 이용할 때 네트워크를 통해 수시로 전송됩니다(이전 시기·방법: 서비스
          이용 시 네트워크로 수시 전송).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-xs" data-testid="privacy-overseas-table">
            <thead>
              <tr className="border-b text-left text-gray-900">
                <th className="py-2 pr-3 font-semibold">받는 자 · 연락처</th>
                <th className="py-2 pr-3 font-semibold">국가</th>
                <th className="py-2 pr-3 font-semibold">이전 항목</th>
                <th className="py-2 pr-3 font-semibold">목적</th>
                <th className="py-2 pr-3 font-semibold">시기·방법</th>
                <th className="py-2 font-semibold">보유 기간</th>
              </tr>
            </thead>
            <tbody>
              {OVERSEAS_TRANSFERS.map((t) => (
                <tr key={t.recipient} className="border-b align-top">
                  <td className="py-2 pr-3">
                    <span className="font-medium text-gray-900">{t.recipient}</span>
                    <br />
                    <span className="break-all text-gray-500">{t.contact}</span>
                  </td>
                  <td className="py-2 pr-3">{t.country}</td>
                  <td className="py-2 pr-3">{t.items}</td>
                  <td className="py-2 pr-3">{t.purpose}</td>
                  <td className="py-2 pr-3">서비스 이용 시 네트워크로 수시 전송</td>
                  <td className="py-2">{t.retention}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          국외 이전을 원하지 않으면 회원 가입·의견 보내기를 하지 않거나, 아래 5절 보호책임자
          이메일({PRIVACY_OFFICER_EMAIL})로 탈퇴(회원 정보 삭제)를 요청할 수 있습니다. 이 경우
          로그인·의견 보내기를 쓸 수 없습니다. 웹 화면 제공(Vercel)과 서버 연결 통로(Cloudflare)는
          사이트 접속 자체에 필요하므로, 원하지 않으면 사이트를 이용하지 않는 방법만 있습니다.
        </p>

        <h2 className="text-lg font-semibold text-gray-900">5. 개인정보 보호책임자</h2>
        <p>
          개인정보 관련 문의·요청은 아래 보호책임자에게 연락해 주시기 바랍니다.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>보호책임자: 2u부동산 운영팀</li>
          <li>
            이메일:{" "}
            <a href={`mailto:${PRIVACY_OFFICER_EMAIL}`} className="underline underline-offset-2">
              {PRIVACY_OFFICER_EMAIL}
            </a>
          </li>
        </ul>

        <h2 className="text-lg font-semibold text-gray-900">6. 인증 서비스</h2>
        <p>
          본 서비스는 Supabase Auth를 통해 인증을 처리하며, 비밀번호는
          bcrypt 알고리즘으로 암호화되어 저장됩니다.
        </p>

        <h2 className="text-lg font-semibold text-gray-900">7. 정보주체의 권리와 행사 방법</h2>
        <p>
          이용자는 언제든지 자신의 개인정보에 대해 열람·정정·삭제·처리정지를 요구할 수 있습니다.
          5절 보호책임자 이메일로 요청하시면 지체 없이 조치하고 결과를 알려 드립니다.
        </p>

        <h2 className="text-lg font-semibold text-gray-900">8. 개인정보의 파기 절차와 방법</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            의견·화면 오류 기록: 보관 기간(1년)이 지나면 매일 도는 자동 정리 작업이 지웁니다.
            공개한 답변은 원문·이메일·브라우저 정보·화면 주소를 지우고 공개 제목과 답만 남깁니다.
          </li>
          <li>회원 정보: 탈퇴 요청을 받으면 지체 없이 지웁니다.</li>
          <li>
            전자 파일은 데이터베이스에서 삭제합니다. 데이터베이스 업체(Supabase)의 자동 백업에 남은
            사본은 백업 보관 기간(7일)이 지나면 함께 사라집니다. 종이로 출력한 개인정보는 없습니다.
          </li>
        </ul>

        <h2 className="text-lg font-semibold text-gray-900">9. 개인정보의 안전성 확보 조치</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>모든 통신을 암호화된 연결(HTTPS)로 주고받습니다.</li>
          <li>비밀번호는 bcrypt 알고리즘으로 암호화해 저장합니다.</li>
          <li>관리자 화면과 관리자 기능은 지정된 관리자 계정만 쓸 수 있습니다.</li>
          <li>
            웹 화면에 들어 있는 데이터베이스 공개 열쇠로는 의견·결제 기록 표를 읽거나 쓸 수 없게
            막았습니다.
          </li>
        </ul>

        <h2 className="text-lg font-semibold text-gray-900">10. 쿠키와 브라우저 저장소</h2>
        <p>
          로그인 상태를 유지하기 위해 꼭 필요한 로그인 쿠키를 씁니다. 광고·방문 분석용 쿠키는 쓰지
          않습니다.
        </p>
        <p>
          그 밖의 편의 기능은 쿠키 대신 브라우저 저장소(localStorage·sessionStorage)에 이 기기
          브라우저 안에만 저장합니다 — 최근 검색, 즐겨찾기(단지·매물·미분양), 비교 목록, 목록·지도
          보기 방식, 미분양 비교 설정, 의견 쓰던 글(로그인하러 갈 때 잠시), 로그인 실패 횟수, 화면
          오류 보고 횟수.
        </p>
        <p>
          브라우저 설정에서 쿠키와 사이트 데이터를 지울 수 있습니다. 지우면 로그인이 풀리고 저장된
          목록이 사라집니다.
        </p>

        <h2 className="text-lg font-semibold text-gray-900">11. 처리방침의 변경</h2>
        <p>이 방침이 바뀌면 시행 7일 전부터 이 화면에 알립니다.</p>

        <h2 className="text-lg font-semibold text-gray-900">개정 이력</h2>
        <ul className="list-disc pl-5 space-y-1">
          {REVISIONS.map((r) => (
            <li key={r.date}>
              {r.date} — {r.summary}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

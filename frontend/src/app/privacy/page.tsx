export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold mb-6">개인정보 처리방침</h1>

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

        <h2 className="text-lg font-semibold text-gray-900">2. 개인정보의 이용 목적</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>회원 식별 및 서비스 이용 인증</li>
          <li>공인중개사 자격 진위 확인 및 중개사무소 등록 여부 검증</li>
          <li>서비스 이용 기록 관리</li>
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

        <h2 className="text-lg font-semibold text-gray-900">5. 개인정보 보호책임자</h2>
        <p>
          개인정보 관련 문의사항은 서비스 관리자에게 연락해 주시기 바랍니다.
        </p>

        <h2 className="text-lg font-semibold text-gray-900">6. 인증 서비스</h2>
        <p>
          본 서비스는 Supabase Auth를 통해 인증을 처리하며, 비밀번호는
          bcrypt 알고리즘으로 암호화되어 저장됩니다.
        </p>
      </section>
    </main>
  );
}

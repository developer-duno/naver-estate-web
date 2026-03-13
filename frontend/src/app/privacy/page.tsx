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

        <h2 className="text-lg font-semibold text-gray-900">2. 개인정보의 이용 목적</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>회원 식별 및 서비스 이용 인증</li>
          <li>서비스 이용 기록 관리</li>
          <li>서비스 개선 및 통계 분석</li>
        </ul>

        <h2 className="text-lg font-semibold text-gray-900">3. 개인정보의 보유 기간</h2>
        <p>
          회원 탈퇴 시까지 보유하며, 탈퇴 후 지체 없이 파기합니다.
          단, 관련 법령에 의해 보존이 필요한 경우 해당 기간 동안 보존합니다.
        </p>

        <h2 className="text-lg font-semibold text-gray-900">4. 개인정보의 제3자 제공</h2>
        <p>
          수집된 개인정보는 제3자에게 제공하지 않습니다. 단, 법령에 의한 요청이
          있는 경우 예외로 합니다.
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

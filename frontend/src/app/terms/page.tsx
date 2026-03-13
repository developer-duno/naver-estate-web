export default function TermsPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold mb-6">이용약관</h1>

      <section className="space-y-4 text-sm text-gray-700 leading-relaxed">
        <h2 className="text-lg font-semibold text-gray-900">제1조 (목적)</h2>
        <p>
          이 약관은 네이버 부동산 매물 조회 서비스(이하 &quot;서비스&quot;)의 이용 조건 및
          절차에 관한 사항을 규정함을 목적으로 합니다.
        </p>

        <h2 className="text-lg font-semibold text-gray-900">제2조 (서비스 내용)</h2>
        <p>
          본 서비스는 공개된 부동산 매물 정보를 수집·정리하여 사용자에게 제공하는
          정보 조회 서비스입니다. 제공되는 정보는 참고용이며, 실제 거래 시
          반드시 공인중개사를 통해 확인하시기 바랍니다.
        </p>

        <h2 className="text-lg font-semibold text-gray-900">제3조 (이용자의 의무)</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>서비스를 통해 수집한 정보를 상업적 목적으로 무단 배포할 수 없습니다.</li>
          <li>타인의 계정을 도용하거나 부정한 방법으로 서비스를 이용할 수 없습니다.</li>
          <li>서비스의 정상적인 운영을 방해하는 행위를 할 수 없습니다.</li>
        </ul>

        <h2 className="text-lg font-semibold text-gray-900">제4조 (면책)</h2>
        <p>
          서비스에서 제공하는 매물 정보의 정확성, 완전성, 적시성을 보장하지 않으며,
          이를 기반으로 한 의사결정에 대해 책임을 지지 않습니다.
        </p>

        <h2 className="text-lg font-semibold text-gray-900">제5조 (약관 변경)</h2>
        <p>
          본 약관은 서비스 운영 정책에 따라 변경될 수 있으며, 변경 시 서비스 내
          공지를 통해 안내합니다.
        </p>
      </section>
    </main>
  );
}

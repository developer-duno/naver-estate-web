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

        <h2 className="text-lg font-semibold text-gray-900">제5조 (유료 서비스 및 결제)</h2>
        <p>
          본 서비스는 일부 기능을 유료 구독 이용권 형태로 제공합니다. 이용자는
          요금제에서 정한 금액을 결제대행사(포트원)를 통해 결제함으로써 해당
          이용권을 구매할 수 있으며, 결제 금액·이용 기간 등 구체적인 조건은
          결제 시점에 안내됩니다.
        </p>

        <h2 className="text-lg font-semibold text-gray-900">제6조 (이용권 및 갱신)</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            1회 결제 시 결제한 요금제에 해당하는 기간만큼 유료 이용권이 부여됩니다.
          </li>
          <li>
            이용권 만료 전에 다시 결제하는 경우, 남은 기간에 새로 구매한 기간이
            더해져 만료일이 연장됩니다(기존 기간은 소멸되지 않습니다).
          </li>
          <li>
            본 이용권은 1회 결제 방식이며, 별도의 동의 없이 자동으로 정기 결제가
            이루어지지 않습니다.
          </li>
        </ul>

        <h2 className="text-lg font-semibold text-gray-900">제7조 (청약철회 및 환불)</h2>
        <p>
          유료 이용권의 청약철회·환불에 관한 사항은{" "}
          <a href="/refund" className="text-blue-600 hover:underline">
            환불정책
          </a>
          에서 정한 바에 따르며, 관련 법령(전자상거래 등에서의 소비자보호에 관한
          법률, 콘텐츠산업진흥법 등)을 따릅니다.
        </p>

        <h2 className="text-lg font-semibold text-gray-900">제8조 (약관 변경)</h2>
        <p>
          본 약관은 서비스 운영 정책에 따라 변경될 수 있으며, 변경 시 서비스 내
          공지를 통해 안내합니다.
        </p>
      </section>
    </main>
  );
}

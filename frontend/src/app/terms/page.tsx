import type { Metadata } from "next";
import PaidServicePausedNotice from "@/components/PaidServicePausedNotice";

export const metadata: Metadata = {
  title: "이용약관",
  description: "2u부동산 서비스 이용약관 — 서비스 내용·이용자 의무·면책·유료 서비스와 환불·약관 변경을 안내합니다.",
  alternates: { canonical: "/terms" },
  openGraph: {
    url: "/terms",
    title: "이용약관 | 2u부동산",
    description: "2u부동산 서비스 이용약관 — 서비스 내용·이용자 의무·면책·유료 서비스와 환불·약관 변경을 안내합니다.",
    type: "website",
    // openGraph 를 직접 쓰면 root opengraph-image 상속이 끊긴다 → images 를 꼭 적는다(seo-metadata.md 룰 2)
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "2u부동산" }],
  },
};

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold mb-6">이용약관</h1>

      {/* 무료 운영 중 현황 고지 — 제5조·제7조가 유료 구독을 전제하므로(세션 405).
          유료 재개 시 LOCKED_PATHS 에서 /pricing 이 빠지면 자동으로 사라진다. */}
      <PaidServicePausedNotice />

      <section className="space-y-4 text-sm text-gray-700 leading-relaxed">
        <h2 className="text-lg font-semibold text-gray-900">제1조 (목적)</h2>
        <p>
          이 약관은 2u부동산(이하 &quot;서비스&quot;)이 제공하는 부동산 정보 조회, 계산 도구,
          공인중개사 실무 자료의 이용 조건과 절차를 정합니다.
        </p>

        <h2 className="text-lg font-semibold text-gray-900">제2조 (서비스 내용)</h2>
        <p>① 서비스는 다음을 제공합니다.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>공공기관이 공개한 부동산 자료(실거래가·공시가격 등)와 이를 정리한 지표</li>
          <li>세금·중개보수·대출 한도 등 계산 도구</li>
          <li>공인중개사 실무에 쓰는 법령 근거, 서식 원문 연결, 체크 목록</li>
          <li>인증한 공인중개사에게 제공하는 매물 자료 기능</li>
        </ul>
        <p>
          ② 계산 도구는 화면에 적은 기준(법령 조항·기준일)과 이용자가 넣은 값으로 계산합니다.
          화면에 적지 않은 개별 사정(감면·특례·금융기관 심사 등)은 계산에 들어가지 않습니다.
        </p>
        <p>
          ③ 체크 목록과 법령 안내는 화면에 적은 기준일의 법령 원문을 정리한 것이며, 개별 거래에 대한
          법률 자문이 아닙니다.
        </p>

        <h2 className="text-lg font-semibold text-gray-900">제3조 (이용자의 의무)</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>서비스를 통해 수집한 정보를 상업적 목적으로 무단 배포할 수 없습니다.</li>
          <li>타인의 계정을 도용하거나 부정한 방법으로 서비스를 이용할 수 없습니다.</li>
          <li>서비스의 정상적인 운영을 방해하는 행위를 할 수 없습니다.</li>
        </ul>

        <h2 className="text-lg font-semibold text-gray-900">제4조 (면책)</h2>
        <p>
          ① 서비스는 공공기관 등이 공개한 자료를 보여 줄 때 출처를 밝히고, 기준일이 있는 자료는
          기준일도 함께 보여 줍니다. 출처 자료 자체의 오류나 출처의 갱신 지연으로 생긴 손해는, 서비스에 고의 또는 중대한 과실이 없으면
          책임지지 않습니다.
        </p>
        <p>
          ② 매물 정보는 외부에 공개된 광고를 모은 것이라, 실제 거래 가능 여부와 가격은 매물을 올린
          중개사무소에 확인해야 합니다.
        </p>
        <p>
          ③ 법령 안내는 화면에 적은 기준일의 원문 기준입니다. 그 뒤 법령이 바뀌면 원문 링크에서 현행
          내용을 볼 수 있습니다.
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

        <p>부칙: 이 약관은 2026년 11월 16일 제1조·제2조·제4조를 고쳤습니다.</p>
      </section>
    </div>
  );
}

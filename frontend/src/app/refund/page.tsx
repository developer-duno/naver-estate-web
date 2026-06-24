import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "환불정책",
  description:
    "유료 구독 이용권의 청약철회 및 환불 규정 안내 — 결제 후 7일 이내 미사용 시 전액 환불.",
  alternates: { canonical: "/refund" },
};

export default function RefundPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold mb-6">환불정책</h1>

      <section className="space-y-4 text-sm text-gray-700 leading-relaxed">
        <h2 className="text-lg font-semibold text-gray-900">제1조 (목적)</h2>
        <p>
          이 환불정책은 본 서비스의 유료 구독 이용권 결제에 대한 청약철회 및 환불
          기준과 절차를 규정함을 목적으로 합니다. 본 정책에 명시되지 않은 사항은
          관련 법령(전자상거래 등에서의 소비자보호에 관한 법률, 콘텐츠산업진흥법 등)을
          따릅니다.
        </p>

        <h2 className="text-lg font-semibold text-gray-900">제2조 (청약철회)</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            이용자는 결제일로부터 7일 이내에 이용권을 전혀 사용하지 않은 경우 청약을
            철회하고 결제 금액 전액을 환불받을 수 있습니다.
          </li>
          <li>
            본 서비스는 결제 즉시 이용 가능한 디지털 콘텐츠로서, 이용자가 결제 후
            서비스(유료 기능)를 이용하기 시작한 경우 콘텐츠산업진흥법 및 관련 법령에
            따라 청약철회가 제한될 수 있습니다.
          </li>
        </ul>

        <h2 className="text-lg font-semibold text-gray-900">제3조 (환불 기준)</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            결제 후 7일 이내 · 미사용: 결제 금액 전액 환불.
          </li>
          <li>
            결제 후 이용권을 일부 사용한 경우: 이미 제공된 이용 기간에 해당하는 금액과
            소정의 수수료를 공제한 잔여 금액을 환불합니다. 잔여 환불액은 결제 금액에서
            (사용일수 ÷ 전체 이용권 일수) 비율만큼을 차감하여 산정합니다.
          </li>
          <li>
            이용권 만료 후 또는 이용 기간이 종료된 이용권은 환불 대상이 아닙니다.
          </li>
          <li>
            서비스 제공자의 귀책 사유(중대한 장애 등)로 정상적인 서비스 이용이
            불가능했던 경우에는 해당 기간에 대해 별도 보상 또는 환불을 진행합니다.
          </li>
        </ul>

        <h2 className="text-lg font-semibold text-gray-900">제4조 (환불 절차)</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            환불 신청은 아래 사업자 정보의 연락처 또는 서비스 내 문의를 통해 접수합니다.
          </li>
          <li>
            환불은 원칙적으로 결제 시 사용한 결제수단으로 진행되며, 결제대행사(포트원)를
            통한 결제 취소·환불 처리에는 카드사·결제수단별로 영업일 기준 3~7일이 소요될
            수 있습니다.
          </li>
          <li>
            환불 신청 접수 후 처리 결과는 신청하신 연락처로 안내해 드립니다.
          </li>
        </ul>

        <h2 className="text-lg font-semibold text-gray-900">제5조 (결제대행)</h2>
        <p>
          본 서비스의 결제는 결제대행사 포트원(주식회사 코리아포트원)을 통해
          처리됩니다. 카드번호 등 민감한 결제수단 정보는 결제대행사가 직접 처리하며,
          본 서비스는 결제 식별자·결제 금액·승인 결과 등 환불 처리에 필요한 정보만을
          보관합니다.
        </p>

        <h2 className="text-lg font-semibold text-gray-900">사업자 정보</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>상호: 이로움기획</li>
          <li>대표자: 김상원</li>
          <li>사업자등록번호: 267-02-01775</li>
          <li>통신판매업 신고번호: [통신판매업 신고번호]</li>
          <li>사업장 주소: 대전광역시 유성구 계룡로38번길 92, 201호(구암동, 황제빌라)</li>
          <li>고객문의·환불 연락처: [전화번호 / 이메일 입력]</li>
          <li>결제대행사: 포트원(주식회사 코리아포트원)</li>
        </ul>
        <p className="text-xs text-gray-500">
          ※ 위 사업자 정보는 정식 결제 서비스 개시 전 실제 등록 정보로 갱신됩니다.
        </p>
      </section>
    </main>
  );
}

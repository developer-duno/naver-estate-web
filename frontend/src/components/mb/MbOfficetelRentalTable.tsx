"use client";

import type { MbOfficetelRentalItem } from "@/types";

/** 오피스텔·민간임대 통합 목록 (이슈 #323). kind 로 유형 뱃지 구분.
 * 이름은 kind 무관하게 house_nm(청약홈 API 단지명)을 우선 표시하고, house_nm 이
 * 없으면 apartment_id(내부 DB ID)로 폴백한다(V043 — house_nm 컬럼 신설로 kind 분기 불필요).
 * 민간임대는 독립 매물이라 상세 진입 없이 목록 정보만 표시(1차 구현 범위 — 상세 페이지는 후속 PR). */
interface Props {
  items: MbOfficetelRentalItem[];
}

export default function MbOfficetelRentalTable({ items }: Props) {
  if (!items || items.length === 0) {
    return <p className="text-sm text-gray-400 py-8 text-center">등록된 오피스텔·민간임대 청약 공고가 없습니다.</p>;
  }

  return (
    <div className="overflow-x-auto border rounded-md">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="px-3 py-2 text-left text-gray-600">유형</th>
            <th className="px-3 py-2 text-left text-gray-600">이름</th>
            <th className="px-3 py-2 text-left text-gray-600 hidden sm:table-cell">주소</th>
            <th className="px-3 py-2 text-right text-gray-600">공고일</th>
            <th className="px-3 py-2 text-right text-gray-600 hidden sm:table-cell">공급세대</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={`${item.kind}-${item.house_manage_no}`} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
              <td className="px-3 py-2">
                <span
                  className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${
                    item.kind === "officetel" ? "bg-blue-50 text-blue-700" : "bg-green-50 text-green-700"
                  }`}
                >
                  {item.kind === "officetel" ? "오피스텔" : "임대"}
                </span>
              </td>
              <td className="px-3 py-2 font-medium text-gray-800">
                {item.house_nm ?? item.apartment_id}
              </td>
              <td className="px-3 py-2 text-gray-600 hidden sm:table-cell">{item.address ?? "-"}</td>
              <td className="px-3 py-2 text-right text-gray-700">{item.recruit_date ?? "-"}</td>
              <td className="px-3 py-2 text-right text-gray-700 hidden sm:table-cell">
                {item.tot_supply?.toLocaleString() ?? "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

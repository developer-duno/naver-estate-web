"use client";

import type { Article } from "@/types";
import { M2_TO_PYEONG } from "@/lib/constants";

interface Props {
  articles: Article[];
  onRowClick?: (articleNo: string) => void;
}

export default function ArticleTable({ articles, onRowClick }: Props) {
  if (articles.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">매물이 없습니다.</div>
    );
  }

  return (
    <div className="overflow-x-auto bg-white rounded-lg shadow-sm border">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            <Th>매물번호</Th>
            <Th>거래유형</Th>
            <Th>동</Th>
            <Th>층</Th>
            <Th>가격</Th>
            <Th>면적</Th>
            <Th>평당가</Th>
            <Th>방/욕실</Th>
            <Th>입주가능일</Th>
            <Th>관리비</Th>
            <Th>방향</Th>
            <Th className="min-w-[160px]">특징</Th>
            <Th>중개사</Th>
            <Th>확인일자</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {articles.map((art) => (
            <ArticleRow key={art.article_no} article={art} onClick={onRowClick} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-3 py-2 text-left text-xs font-medium text-gray-500 whitespace-nowrap ${className}`}>
      {children}
    </th>
  );
}

function ArticleRow({ article: art, onClick }: { article: Article; onClick?: (no: string) => void }) {
  // 가격
  const price =
    art.trade_type_name === "월세"
      ? `${art.deal_or_warrant_prc || "-"} / ${art.rent_prc || "-"}`
      : art.deal_or_warrant_prc || "-";

  // 면적
  const areaM2 = art.area2_m2 || art.area1_m2;
  const area = areaM2
    ? `${areaM2}㎡ (${Math.round(areaM2 / M2_TO_PYEONG * 10) / 10}평)`
    : "-";

  // 평당가
  const ppyeong = art.price_per_pyeong ? `${art.price_per_pyeong.toLocaleString()}` : "-";

  // 방/욕실
  const rooms =
    art.room_count != null && art.bathroom_count != null
      ? `${art.room_count}/${art.bathroom_count}`
      : art.room_count != null
      ? `${art.room_count}/-`
      : "-";

  // 입주가능일
  let moveIn = art.move_in_date || "-";
  if (moveIn.length === 8) moveIn = `${moveIn.slice(2, 4)}.${moveIn.slice(4, 6)}.${moveIn.slice(6)}`;

  // 관리비
  const maint = art.maintenance_cost ? `${art.maintenance_cost}만` : "-";

  // 확인일자
  let confirm = art.article_confirm_ymd || "-";
  if (confirm.length === 8) confirm = `${confirm.slice(2, 4)}.${confirm.slice(4, 6)}.${confirm.slice(6)}`;

  return (
    <tr
      onClick={() => onClick?.(art.article_no)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(art.article_no); } }}
      tabIndex={0}
      role="button"
      className="hover:bg-blue-50 cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
    >
      <Td>{art.article_no}</Td>
      <Td>
        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
          art.trade_type_name === "매매" ? "bg-red-100 text-red-700" :
          art.trade_type_name === "전세" ? "bg-blue-100 text-blue-700" :
          art.trade_type_name === "월세" ? "bg-green-100 text-green-700" :
          "bg-gray-100 text-gray-700"
        }`}>
          {art.trade_type_name || "-"}
        </span>
      </Td>
      <Td>{art.building_name || "-"}</Td>
      <Td>{art.floor_info || "-"}</Td>
      <Td className="font-medium">{price}</Td>
      <Td>{area}</Td>
      <Td>{ppyeong}</Td>
      <Td>{rooms}</Td>
      <Td>{moveIn}</Td>
      <Td>{maint}</Td>
      <Td>{art.direction || "-"}</Td>
      <Td className="max-w-[200px] truncate" title={art.article_feature_desc || ""}>
        {art.article_feature_desc || "-"}
      </Td>
      <Td>{art.realtor_name || "-"}</Td>
      <Td>{confirm}</Td>
    </tr>
  );
}

function Td({ children, className = "", title }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <td className={`px-3 py-2 whitespace-nowrap text-gray-700 ${className}`} title={title}>
      {children}
    </td>
  );
}

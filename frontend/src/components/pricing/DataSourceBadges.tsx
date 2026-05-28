import { Badge } from "@/components/ui/badge";

interface Source {
  name: string;
  desc: string;
}

const SOURCES: Source[] = [
  { name: "네이버 부동산", desc: "실시간 매물·시세" },
  { name: "국토교통부", desc: "공공 실거래가" },
  { name: "에어코리아", desc: "단지 대기질" },
  { name: "NEMC", desc: "응급의료기관" },
  { name: "CPMS", desc: "어린이집" },
  { name: "경찰청", desc: "범죄통계" },
];

interface Props {
  variant?: "default" | "compact";
}

export function DataSourceBadges({ variant = "default" }: Props = {}) {
  if (variant === "compact") {
    return (
      <div className="text-center">
        <p className="text-[11px] text-gray-500 mb-2">공식 데이터 출처</p>
        <div className="flex flex-wrap justify-center gap-1.5">
          {SOURCES.map((s) => (
            <Badge
              key={s.name}
              variant="secondary"
              className="text-[11px] px-2 py-0.5 h-auto"
              title={s.desc}
            >
              {s.name}
            </Badge>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="mt-6">
      <p className="text-xs text-gray-600 text-center mb-3">공식 데이터 출처</p>
      <div className="flex flex-wrap justify-center gap-2">
        {SOURCES.map((s) => (
          <Badge
            key={s.name}
            variant="secondary"
            className="text-xs px-3 py-1 h-auto"
            title={s.desc}
          >
            {s.name}
          </Badge>
        ))}
      </div>
    </div>
  );
}

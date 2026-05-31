"use client";

import type { MbApartment } from "@/types";
import { MbNoiseBar } from "./MbNoiseBar";
import { MbNoxiousBar } from "./MbNoxiousBar";
import { MbSchoolWalkBar } from "./MbSchoolWalkBar";

/** 인프라 정보 행 (label + value) */
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-sm font-medium text-gray-900">{value ?? "-"}</dd>
    </div>
  );
}

/** 대기질 등급 색상 뱃지 */
const AIR_GRADE_STYLES: Record<string, string> = {
  "좋음": "bg-green-100 text-green-800 border-green-300",
  "보통": "bg-yellow-100 text-yellow-800 border-yellow-300",
  "나쁨": "bg-orange-100 text-orange-800 border-orange-300",
  "매우나쁨": "bg-red-100 text-red-800 border-red-300",
};

function AirGradeBadge({ grade }: { grade: string }) {
  const style = AIR_GRADE_STYLES[grade] ?? "bg-gray-100 text-gray-600 border-gray-300";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs border ${style}`}>{grade}</span>;
}

/** 범죄 안전등급 색상 뱃지 */
const CRIME_GRADE_STYLES: Record<string, string> = {
  A: "bg-green-100 text-green-800 border-green-300",
  B: "bg-blue-100 text-blue-800 border-blue-300",
  C: "bg-yellow-100 text-yellow-800 border-yellow-300",
  D: "bg-red-100 text-red-800 border-red-300",
};

const CRIME_GRADE_LABELS: Record<string, string> = {
  A: "매우 안전", B: "안전", C: "보통", D: "주의",
};

function CrimeGradeBadge({ grade }: { grade: string }) {
  const style = CRIME_GRADE_STYLES[grade] ?? "bg-gray-100 text-gray-600 border-gray-300";
  const label = CRIME_GRADE_LABELS[grade] ?? grade;
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs border ${style}`}>{label}</span>;
}

/** 주변 환경 — 인프라 + 대기질 + 응급의료 + 어린이집 + 범죄 + 소음도 + 학교 접근성 + 학군 + 교통 */
export function EnvironmentSection({ apartment: a }: { apartment: MbApartment }) {
  const infra = a.infra;
  const school = a.school;
  const transport = a.transport;
  const noise = a.noise;
  const hasData = (infra ?? school ?? transport ?? noise) != null || a.naver_school_walk_min != null || a.noxious_dist != null || a.crime_safety_grade != null || a.quake_design != null;

  if (!hasData) {
    return (
      <SectionCard title="주변 환경">
        <p className="text-sm text-gray-400">주변 환경 데이터가 없습니다.</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="주변 환경">
      {infra && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">인프라</h4>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {([
              ["병원", infra.hospital, infra.hospital_dist],
              ["마트", infra.mart, infra.mart_dist],
              ["편의점", infra.conv, infra.conv_dist],
              ["카페", infra.cafe, infra.cafe_dist],
              ["문화시설", infra.culture, infra.culture_dist],
              ["은행", infra.bank, infra.bank_dist],
              ["약국", infra.pharmacy, infra.pharmacy_dist],
              ["공원", infra.park, infra.park_dist],
            ] as const).map(([name, count, dist]) => (
              <div key={name} className="flex flex-col">
                <dt className="text-xs text-gray-500">{name}</dt>
                <dd className="text-sm">
                  {count != null ? `${count}개` : "-"}
                  {dist != null && <span className="text-gray-400 ml-1">({dist}m)</span>}
                </dd>
              </div>
            ))}
            {infra.subway_dist != null && (
              <div className="flex flex-col">
                <dt className="text-xs text-gray-500">지하철</dt>
                <dd className="text-sm">{infra.subway_dist}m</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {infra?.air_grade && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">대기질</h4>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="flex flex-col">
              <dt className="text-xs text-gray-500">종합 등급</dt>
              <dd className="text-sm"><AirGradeBadge grade={infra.air_grade} /></dd>
            </div>
            {infra.air_pm10 != null && (
              <div className="flex flex-col">
                <dt className="text-xs text-gray-500">PM10</dt>
                <dd className="text-sm">{infra.air_pm10} <span className="text-gray-400">μg/m³</span></dd>
              </div>
            )}
            {infra.air_pm25 != null && (
              <div className="flex flex-col">
                <dt className="text-xs text-gray-500">PM2.5</dt>
                <dd className="text-sm">{infra.air_pm25} <span className="text-gray-400">μg/m³</span></dd>
              </div>
            )}
            {infra.air_o3 != null && (
              <div className="flex flex-col">
                <dt className="text-xs text-gray-500">오존</dt>
                <dd className="text-sm">{infra.air_o3} <span className="text-gray-400">ppm</span></dd>
              </div>
            )}
            {infra.air_station_name && (
              <div className="flex flex-col col-span-2">
                <dt className="text-xs text-gray-500">측정소</dt>
                <dd className="text-sm text-gray-600">
                  {infra.air_station_name}
                  {infra.air_station_dist != null && <span className="text-gray-400 ml-1">({infra.air_station_dist}m)</span>}
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {infra?.emergency_hospital != null && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">응급의료</h4>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <InfoRow label="기관 수 (3km)" value={`${infra.emergency_hospital}개`} />
            <InfoRow label="최근접 거리" value={infra.emergency_hospital_dist != null ? `${infra.emergency_hospital_dist}m` : undefined} />
            <InfoRow label="병상 수" value={infra.emergency_beds ? `${infra.emergency_beds}개` : undefined} />
            <InfoRow label="기관 등급" value={infra.emergency_level || undefined} />
          </dl>
        </div>
      )}

      {infra?.childcare_count != null && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">보육</h4>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <InfoRow label="어린이집 (1km)" value={`${infra.childcare_count}개`} />
            <InfoRow label="최근접 거리" value={infra.childcare_nearest_dist != null ? `${infra.childcare_nearest_dist}m` : undefined} />
            <InfoRow label="가장 가까운" value={infra.childcare_nearest_name || undefined} />
            <InfoRow label="정원" value={infra.childcare_nearest_capacity ? `${infra.childcare_nearest_capacity}명` : undefined} />
            <InfoRow label="시설 유형" value={infra.childcare_nearest_type || undefined} />
            <InfoRow label="교사 수" value={infra.childcare_nearest_teachers ? `${infra.childcare_nearest_teachers}명` : undefined} />
          </dl>
        </div>
      )}

      {(infra?.crime_score != null || a.crime_safety_grade != null || a.quake_design != null) && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">안전</h4>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {infra?.crime_score != null && <InfoRow label="안전 점수" value={`${infra.crime_score}/100`} />}
            {infra?.crime_grade && <InfoRow label="지역 안전 등급" value={<CrimeGradeBadge grade={infra.crime_grade} />} />}
            {a.crime_safety_grade != null && <InfoRow label="단지 안전 등급" value={`${a.crime_safety_grade}등급 (1=안전)`} />}
            {a.quake_design != null && <InfoRow label="내진설계" value={a.quake_design ? "적용" : "미적용"} />}
          </dl>
        </div>
      )}

      {noise != null && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">소음</h4>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <InfoRow label="소음도" value={<MbNoiseBar value={noise} />} />
          </dl>
        </div>
      )}

      {a.naver_school_walk_min != null && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">학교 접근성</h4>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <InfoRow label="학교 도보 시간" value={<MbSchoolWalkBar value={a.naver_school_walk_min} />} />
          </dl>
        </div>
      )}

      {a.noxious_dist != null && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">유해시설</h4>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <InfoRow label="가장 가까운 유해시설" value={<MbNoxiousBar value={a.noxious_dist} />} />
          </dl>
        </div>
      )}

      {school && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">학군</h4>
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
            <InfoRow label="학군 점수" value={school.school_score} />
            <InfoRow label="학군 등급" value={school.school_grade} />
          </dl>
          {Array.isArray(school.nearby_schools) && school.nearby_schools.length > 0 && (
            <div className="border-t border-gray-100 pt-2">
              <p className="text-xs text-gray-500 mb-1.5">주변 학교 (가까운 순 최대 5개)</p>
              <ul className="space-y-1">
                {school.nearby_schools.slice(0, 5).map((s, i) => (
                  <li key={`${s.name}-${i}`} className="flex items-center gap-1.5 text-sm">
                    {s.type && (
                      <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] border bg-gray-50 text-gray-600 border-gray-200">
                        {s.type}
                      </span>
                    )}
                    <span className="font-medium text-gray-900">{s.name}</span>
                    {s.distance != null && (
                      <span className="text-xs text-gray-500">({s.distance}m)</span>
                    )}
                    {s.students != null && (
                      <span className="text-xs text-gray-400 ml-auto">학생 {s.students}명</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {transport && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">교통</h4>
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <InfoRow label="지하철" value={transport.subway_name} />
            <InfoRow label="노선" value={transport.subway_lines} />
            <InfoRow label="지하철 거리" value={transport.subway_dist != null ? `${transport.subway_dist}m` : undefined} />
            <InfoRow label="버스 노선" value={transport.bus_routes ? `${transport.bus_routes}개` : undefined} />
            <InfoRow label="IC 거리" value={transport.ic_dist != null ? `${(transport.ic_dist / 1000).toFixed(1)}km` : undefined} />
            <InfoRow label="KTX 거리" value={transport.ktx_dist != null ? `${(transport.ktx_dist / 1000).toFixed(1)}km` : undefined} />
          </dl>
          {transport.bus_stop_names && (
            <p className="mt-2 text-xs text-gray-500">
              <span className="font-medium text-gray-600">주변 정류장:</span> {transport.bus_stop_names}
            </p>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-lg shadow-sm border p-4 md:p-6">
      <h3 className="text-base font-bold text-gray-800 mb-4 pb-2 border-b border-gray-200">{title}</h3>
      {children}
    </section>
  );
}

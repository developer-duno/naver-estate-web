"use client";

import type { MbApartment } from "@/types";
import { freshness } from "@/lib/format";
import { BASIS, finiteOrNull, pm25Basis, positiveOrNull, roadDistanceText } from "./basis-text";

/** 블록 헤더 옆 작은 회색 갱신시각 라벨 (값 없으면 렌더 안 함) */
function FreshnessTag({ iso }: { iso?: string }) {
  const label = freshness(iso);
  return label ? <span className="ml-2 text-xs font-normal text-gray-400">{label}</span> : null;
}

/** 인프라 정보 행 (label + value + 기준·출처 한 줄 — 값이 있을 때만, 세션 472) */
function InfoRow({ label, value, basis, wide }: { label: string; value: React.ReactNode; basis?: string; wide?: boolean }) {
  return (
    <div className={`flex flex-col gap-0.5${wide ? " col-span-2" : ""}`}>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-sm font-medium text-gray-900">{value ?? "-"}</dd>
      {basis && value != null && <dd className="text-xs font-normal leading-snug text-gray-500">{basis}</dd>}
    </div>
  );
}

/** "2022,2023,2024" → "2022~2024" (한 해면 그 해만, 읽을 수 없으면 빈 글자) */
function formatAirYears(years: string | null | undefined): string {
  const ys = (years ?? "").split(",").map((y) => Number(y.trim())).filter((y) => Number.isInteger(y) && y > 0);
  if (ys.length === 0) return "";
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  return lo === hi ? String(lo) : `${lo}~${hi}`;
}

/** 주변 환경 — 인프라 + 대기질 + 응급의료 + 어린이집 + 안전 + 큰 도로 거리 + 학교 접근성 + 기피시설 + 학군 + 교통 */
export function EnvironmentSection({ apartment: a }: { apartment: MbApartment }) {
  const infra = a.infra;
  const school = a.school;
  const transport = a.transport;
  const noise = a.noise;
  const air = infra?.air_annual;
  const pm25 = finiteOrNull(air?.pm25);
  const roadText = roadDistanceText(noise);
  const schoolWalk = positiveOrNull(a.naver_school_walk_min);
  const noxious = positiveOrNull(a.noxious_dist);
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
          <h4 className="text-sm font-semibold text-gray-700 mb-2">인프라<FreshnessTag iso={infra.updated_at} /></h4>
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

      {/* 대기질 = 측정소별 3년 평균(세션604 — 실시간 수집 폐지). PM2.5 값이 없으면 블록째 숨긴다(옛 등급 null 과 같은 조건).
          등급(좋음/보통/나쁨)은 공인 기준이 아니라 지우고, PM2.5 는 국가 기준 이하/초과를 글로만 적는다(세션 472) */}
      {infra && air && pm25 != null && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">
            대기질 ({formatAirYears(air.years) ? `3년 평균 ${formatAirYears(air.years)}` : "3년 평균"})
          </h4>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <InfoRow wide label="PM2.5" value={`${pm25.toFixed(1)}㎍/㎥ (3년 평균)`} basis={pm25Basis(pm25)} />
            {air.pm10 != null && (
              <div className="flex flex-col">
                <dt className="text-xs text-gray-500">PM10</dt>
                <dd className="text-sm">{air.pm10.toFixed(1)} <span className="text-gray-400">μg/m³</span></dd>
              </div>
            )}
            {air.o3 != null && (
              <div className="flex flex-col">
                <dt className="text-xs text-gray-500">오존</dt>
                <dd className="text-sm">{air.o3.toFixed(3)} <span className="text-gray-400">ppm</span></dd>
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
            {/* 0 은 확정값("0병상"), null 은 모름("-") — 세션 417. 값 = NEMC 실시간 op 의 응급실 일반병상 기준값(hvs01) */}
            <InfoRow label="응급실 일반병상" value={infra.emergency_beds != null ? `${infra.emergency_beds}병상` : undefined} />
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

      {/* 우리 범죄 점수·지역 등급(infra.crime_score·crime_grade)은 뺐다 — 인구 없는 지역은 중앙값으로 채운
          값이 섞여 있다. 행정안전부 지역안전지수 등급으로 바꾸는 일은 PR 4 (세션 472) */}
      {(a.crime_safety_grade != null || a.quake_design != null) && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">안전</h4>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {a.crime_safety_grade != null && <InfoRow label="단지 안전 등급" value={`${a.crime_safety_grade}등급 (1=안전)`} />}
            {a.quake_design != null && <InfoRow label="내진설계" value={a.quake_design ? "적용" : "미적용"} />}
          </dl>
        </div>
      )}

      {/* noise 는 측정값이 아니라 큰 도로 거리 구간에 붙인 추정 dB 라 거리 구간으로 풀어 쓴다 */}
      {noise != null && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">큰 도로</h4>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <InfoRow wide label="큰 도로 거리(추정)" value={roadText ?? undefined} basis={BASIS.roadDistance} />
          </dl>
        </div>
      )}

      {schoolWalk != null && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">학교 접근성</h4>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <InfoRow wide label="가장 가까운 초등학교 도보(추정)" value={`${Math.round(schoolWalk)}분`} basis={BASIS.schoolWalk} />
          </dl>
        </div>
      )}

      {noxious != null && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">기피시설</h4>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <InfoRow
              wide
              label="가장 가까운 기피시설(지도 검색)"
              value={`약 ${Math.round(noxious).toLocaleString()}m`}
              basis={BASIS.avoidedFacility}
            />
          </dl>
        </div>
      )}

      {school && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">학군<FreshnessTag iso={school.updated_at} /></h4>
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
          <h4 className="text-sm font-semibold text-gray-700 mb-2">교통<FreshnessTag iso={transport.updated_at} /></h4>
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

// 미분양 지표 막대 14종 config. MetricBar 가 본 config 로 렌더.
// 각 값은 기존 Mb*Bar.tsx 원본과 1:1 대조해 옮김(동작 불변).
// tier(v) 는 0=첫째 라벨/색, 1=둘째, 2=셋째 반환.
// formatDisplay 는 display 텍스트 + aria-label 표시값 공유, ariaNow 는 aria-valuenow 값.
//   - 의도적 동치 변환: 기존 MbNoxiousBar 는 capped=Math.min(value,MAX)(Math.max 없음)였으나
//     nonZero 가드로 value>0 보장돼 MetricBar 의 Math.min(Math.max(value,0),max) 와 수학적 동치.

export interface MetricBarConfig {
  max: number;
  nonZero?: boolean; // value<=0 도 '-' (기본 false)
  scheme: "risk" | "scale"; // risk=emerald/amber/rose, scale=emerald/sky/indigo
  tier: (v: number) => 0 | 1 | 2;
  labels: [string, string, string];
  formatDisplay: (v: number) => string; // 표시 + aria-label 표시값
  ariaNow: (v: number) => number; // aria-valuenow
  ariaPrefix: string;
  overCapLabel?: string; // value>max 시 aria-label 에 삽입 (UnsoldRate 전용)
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;
const roundInt = (v: number) => Math.round(v);

export const metricBarConfigs = {
  // === risk scheme (emerald/amber/rose) ===
  cancelRatio: {
    max: 7.5,
    scheme: "risk",
    tier: (v) => (v < 1.5 ? 0 : v < 3 ? 1 : 2),
    labels: ["안전", "주의", "위험"],
    formatDisplay: (v) => `${v.toFixed(1)}%`,
    ariaNow: round1,
    ariaPrefix: "6개월 취소율",
  },
  coverage: {
    max: 80,
    scheme: "risk",
    tier: (v) => (v <= 50 ? 0 : v <= 65 ? 1 : 2),
    labels: ["쾌적", "보통", "고밀"],
    formatDisplay: (v) => `${v.toFixed(1)}%`,
    ariaNow: round1,
    ariaPrefix: "건폐율",
  },
  exclusiveRatio: {
    max: 90,
    nonZero: true,
    scheme: "risk",
    tier: (v) => (v >= 78 ? 0 : v >= 73 ? 1 : 2),
    labels: ["우수", "보통", "낮음"],
    formatDisplay: (v) => `${v.toFixed(1)}%`,
    ariaNow: roundInt,
    ariaPrefix: "전용률",
  },
  floorAreaRatio: {
    max: 800,
    nonZero: true,
    scheme: "risk",
    tier: (v) => (v < 200 ? 0 : v < 300 ? 1 : 2),
    labels: ["저밀", "중밀", "고밀"],
    formatDisplay: (v) => `${v.toFixed(0)}%`,
    ariaNow: roundInt,
    ariaPrefix: "용적률",
  },
  jeonseRate: {
    max: 120,
    scheme: "risk",
    tier: (v) => (v < 60 ? 0 : v < 80 ? 1 : 2),
    labels: ["적정", "주의", "위험"],
    formatDisplay: (v) => `${v.toFixed(1)}%`,
    ariaNow: round1,
    ariaPrefix: "전세가율",
  },
  maintenance: {
    max: 60,
    scheme: "risk",
    tier: (v) => (v <= 10 ? 0 : v <= 25 ? 1 : 2),
    labels: ["저렴", "보통", "높음"],
    formatDisplay: (v) => `${v.toLocaleString()}만원`,
    ariaNow: (v) => v,
    ariaPrefix: "세대당 월 관리비",
  },
  noise: {
    max: 70,
    scheme: "risk",
    tier: (v) => (v < 50 ? 0 : v < 60 ? 1 : 2),
    labels: ["조용함", "보통", "시끄러움"],
    formatDisplay: (v) => `${v} dB`,
    ariaNow: (v) => v,
    ariaPrefix: "소음도",
  },
  // 유해시설 거리 — 멀수록 좋음(높은 값=safe). nonZero(0/음수 미입력 노이즈).
  noxious: {
    max: 1500,
    nonZero: true,
    scheme: "risk",
    tier: (v) => (v > 700 ? 0 : v > 300 ? 1 : 2),
    labels: ["멀음", "보통", "가까움"],
    formatDisplay: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}km` : `${Math.round(v)}m`),
    ariaNow: roundInt,
    ariaPrefix: "가장 가까운 유해시설까지",
  },
  parking: {
    max: 2.0,
    scheme: "risk",
    tier: (v) => (v >= 1.5 ? 0 : v >= 1.0 ? 1 : 2),
    labels: ["충분", "보통", "부족"],
    formatDisplay: (v) => `${v.toFixed(2)}대`,
    ariaNow: round2,
    ariaPrefix: "세대당 주차",
  },
  pir: {
    max: 60,
    nonZero: true,
    scheme: "risk",
    tier: (v) => (v < 15 ? 0 : v < 25 ? 1 : 2),
    labels: ["저부담", "적정", "고부담"],
    formatDisplay: (v) => `${v.toFixed(1)}배`,
    ariaNow: round1,
    ariaPrefix: "PIR",
  },
  // 학교 도보 — 가까울수록 좋음(낮은 값=safe). nonZero. display·aria 모두 정수(분).
  schoolWalk: {
    max: 15,
    nonZero: true,
    scheme: "risk",
    tier: (v) => (v <= 5 ? 0 : v <= 10 ? 1 : 2),
    labels: ["가까움", "보통", "멀음"],
    formatDisplay: (v) => `${Math.round(v)}분`,
    ariaNow: roundInt,
    ariaPrefix: "학교 도보 시간",
  },
  unsoldRate: {
    max: 100,
    scheme: "risk",
    tier: (v) => (v <= 10 ? 0 : v <= 30 ? 1 : 2),
    labels: ["양호", "주의", "위험"],
    formatDisplay: (v) => `${v.toFixed(1)}%`,
    ariaNow: round1,
    ariaPrefix: "미분양률",
    overCapLabel: "상한 초과",
  },
  // === scale scheme (emerald/sky/indigo) ===
  maxFloor: {
    max: 50,
    scheme: "scale",
    tier: (v) => (v < 15 ? 0 : v < 30 ? 1 : 2),
    labels: ["저층", "중층", "고층"],
    formatDisplay: (v) => `${v}층`,
    ariaNow: (v) => v,
    ariaPrefix: "최고층",
  },
  units: {
    max: 1500,
    scheme: "scale",
    tier: (v) => (v < 100 ? 0 : v < 500 ? 1 : 2),
    labels: ["소규모 단지", "중규모 단지", "대규모 단지"],
    formatDisplay: (v) => `${v.toLocaleString()}세대`,
    ariaNow: (v) => v,
    ariaPrefix: "세대수",
  },
} satisfies Record<string, MetricBarConfig>;

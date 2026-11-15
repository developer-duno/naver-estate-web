/**
 * 앱 아이콘 그림(세션 509 · B36 ① — 사장님이 고른 「후보 1 · 아파트 세 동 + 주황 꺾은선」).
 * src/app/icon.tsx(탭 32px) · src/app/apple-icon.tsx(휴대폰 홈 화면 180px)가 같이 쓴다.
 * 정적 그림(public/icon-192·512.png, src/app/favicon.ico)은 scripts/gen-app-icons.py 가 같은 기하로 그린다 — 바꿀 땐 같이.
 */
export const ICON_NAVY = "#0b1f3a";
export const ICON_ORANGE = "#ff9a4d";

export function AppIconArt({ size, rounded }: { size: number; rounded: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      {/* 둥근 사각은 탭 아이콘만 — 휴대폰 홈 화면은 기기가 모서리를 깎으므로 꽉 찬 바탕 */}
      <rect width="32" height="32" rx={rounded ? 7 : 0} fill={ICON_NAVY} />
      <rect x="6" y="15" width="5" height="11" fill="#ffffff" />
      <rect x="13.5" y="9" width="5" height="17" fill="#ffffff" />
      <rect x="21" y="12" width="5" height="14" fill="#ffffff" />
      <polyline
        points="5,13 12,9 18,11 27,5"
        fill="none"
        stroke={ICON_ORANGE}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

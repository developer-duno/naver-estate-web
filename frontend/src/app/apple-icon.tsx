import { ImageResponse } from "next/og";
import { AppIconArt } from "@/lib/app-icon-art";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** 휴대폰 홈 화면 아이콘(apple-touch-icon) — 탭 아이콘과 같은 그림 · 기기가 모서리를 깎으므로 꽉 찬 남색 바탕(세션 509 · B36 ①) */
export default function AppleIcon() {
  return new ImageResponse(<AppIconArt size={size.width} rounded={false} />, { ...size });
}

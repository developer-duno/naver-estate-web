import { ImageResponse } from "next/og";
import { AppIconArt } from "@/lib/app-icon-art";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** 브라우저 탭 아이콘 — 아파트 세 동 + 주황 꺾은선(세션 509 · B36 ①) */
export default function Icon() {
  return new ImageResponse(<AppIconArt size={size.width} rounded />, { ...size });
}

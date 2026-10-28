import { ImageResponse } from "next/og";

export const alt = "2u부동산 — 아파트 실거래가·공시가격";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #ffffff 0%, #eff6ff 100%)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: 80,
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 32,
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 16,
              background: "#3b82f6",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 44,
              fontWeight: 700,
              letterSpacing: -1,
            }}
          >
            2u
          </div>
          <div
            style={{
              fontSize: 56,
              fontWeight: 700,
              color: "#1f2937",
              letterSpacing: -1.5,
            }}
          >
            2u부동산
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            fontSize: 40,
            fontWeight: 600,
            color: "#374151",
            textAlign: "center",
            lineHeight: 1.3,
            marginBottom: 24,
          }}
        >
          <div style={{ display: "flex" }}>아파트·오피스텔</div>
          <div style={{ display: "flex" }}>실거래가·공시가격 조회</div>
        </div>
        <div
          style={{
            fontSize: 24,
            color: "#6b7280",
            textAlign: "center",
          }}
        >
          누구나 무료 · 공인중개사 업무 도구 · 2u부동산
        </div>
        <div
          style={{
            fontSize: 20,
            color: "#9ca3af",
            marginTop: 40,
          }}
        >
          2u.pe.kr
        </div>
      </div>
    ),
    { ...size },
  );
}

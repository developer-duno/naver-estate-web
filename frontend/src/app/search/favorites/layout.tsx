import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "즐겨찾기 매물",
  description: "★로 저장한 매물을 한곳에서 모아봅니다.",
  robots: { index: false, follow: true },
};

export default function ArticleFavoritesLayout({ children }: { children: React.ReactNode }) {
  return children;
}

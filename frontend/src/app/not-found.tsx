import Link from "next/link";

export default function NotFound() {
  return (
    <div className="max-w-md mx-auto px-4 py-24 text-center">
      <h1 className="text-6xl font-bold text-gray-200 mb-4">404</h1>
      <p className="text-lg text-gray-600 mb-6">페이지를 찾을 수 없습니다.</p>
      <Link
        href="/"
        className="inline-block bg-blue-600 text-white px-6 py-2.5 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
      >
        홈으로 돌아가기
      </Link>
    </div>
  );
}

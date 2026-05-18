import Link from "next/link";
import { SkeletonPage } from "@/components/Skeleton";

type ComplexLoadStateProps =
  | { kind: "invalid" }
  | { kind: "loading" }
  | { kind: "error"; error: string };

/**
 * 단지 상세 페이지를 그릴 수 없는 상태의 전체화면 UI.
 * - invalid: 유효하지 않은 단지 번호
 * - loading: 단지 정보 로딩 중
 * - error:  단지 정보 조회 실패 (404 / 그 외)
 */
export default function ComplexLoadState(props: ComplexLoadStateProps) {
  if (props.kind === "invalid") {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <p className="text-red-500 text-lg mb-4">유효하지 않은 단지 번호입니다.</p>
        <Link href="/" className="text-blue-600 hover:underline">홈으로 돌아가기</Link>
      </div>
    );
  }

  if (props.kind === "loading") {
    return <SkeletonPage message="단지 정보를 불러오는 중..." />;
  }

  const { error } = props;
  const is404 = error?.includes("404") || error?.includes("찾을 수 없");
  return (
    <div className="max-w-4xl mx-auto px-4 py-16 text-center">
      <h2 className="text-xl font-bold mb-2">{is404 ? "단지를 찾을 수 없습니다" : "오류가 발생했습니다"}</h2>
      <p className="text-gray-500 text-sm mb-6">{is404 ? "단지번호가 올바른지 확인해주세요." : error}</p>
      <div className="flex justify-center gap-4">
        {!is404 && (
          <button
            onClick={() => window.location.reload()}
            className="text-sm border border-gray-300 rounded-md px-4 py-2 text-gray-600 hover:bg-gray-50"
          >
            다시 시도
          </button>
        )}
        <Link href="/" className="text-sm bg-blue-600 text-white rounded-md px-4 py-2 hover:bg-blue-700">홈으로 돌아가기</Link>
        <Link href="/search" className="text-sm border border-blue-300 text-blue-600 rounded-md px-4 py-2 hover:bg-blue-50">단지 검색</Link>
      </div>
    </div>
  );
}

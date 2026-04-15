import ErrorActions from "@/components/ErrorActions";

export default function NotFound() {
  return (
    <div className="max-w-lg mx-auto px-4 py-20 text-center">
      <p className="text-8xl font-bold text-gray-200 leading-none mb-4 select-none">
        404
      </p>
      <h1 className="text-xl font-semibold text-gray-800 mb-2">
        페이지를 찾을 수 없습니다
      </h1>
      <p className="text-sm text-gray-500 mb-2">
        주소가 잘못되었거나, 삭제된 단지일 수 있어요.
      </p>
      <p className="text-xs text-gray-400">
        홈에서 다시 검색하거나 이전 페이지로 돌아갈 수 있어요.
      </p>
      <ErrorActions type="notfound" />
    </div>
  );
}

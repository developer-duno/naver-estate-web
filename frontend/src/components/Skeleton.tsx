/**
 * Skeleton UI 공통 컴포넌트 — 로딩 중 회색 pulse 박스.
 * 기존 인라인 div 패턴(animate-pulse)을 재사용 가능하게 추출.
 * 색상은 일반 영역 선례(compare/page.tsx:155, verify/page.tsx:103)의 bg-gray-200 채택.
 */

interface SkeletonProps {
  className?: string;
  role?: "status";
}

/** 기본 블록 — width/height 는 className 으로 지정. role 명시할 때만 status 부여 */
export default function Skeleton({ className = "", role }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-gray-200 rounded ${className}`}
      {...(role ? { role, "aria-label": "로딩 중" } : {})}
    />
  );
}

/** N행 반복 — 테이블 로딩용. sr-only 메시지로 스크린리더 + 기존 테스트 getByText 호환 */
export function SkeletonRows({ rows = 8, rowHeight = "h-12" }: { rows?: number; rowHeight?: string }) {
  return (
    <div className="space-y-2 py-4" role="status" aria-label="로딩 중">
      <span className="sr-only">데이터를 불러오는 중...</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`animate-pulse bg-gray-200 rounded ${rowHeight}`} />
      ))}
    </div>
  );
}

/** 페이지 헤더 + 본문 골격 — 페이지 진입 로딩용 */
export function SkeletonPage({ message }: { message?: string }) {
  return (
    <div
      className="max-w-7xl mx-auto px-4 py-6"
      role="status"
      aria-label="로딩 중"
    >
      {message && <span className="sr-only">{message}</span>}
      <div className="animate-pulse bg-gray-200 rounded h-8 w-2/3 mb-4" />
      <div className="animate-pulse bg-gray-200 rounded h-6 w-1/2 mb-6" />
      <div className="space-y-3">
        <div className="animate-pulse bg-gray-200 rounded h-32" />
        <div className="animate-pulse bg-gray-200 rounded h-24" />
        <div className="animate-pulse bg-gray-200 rounded h-40" />
      </div>
    </div>
  );
}

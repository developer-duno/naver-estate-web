interface LoadingSpinnerProps {
  size?: "sm" | "md";
  message?: string;
}

export default function LoadingSpinner({ size = "md", message }: LoadingSpinnerProps) {
  const dim = size === "sm" ? "h-6 w-6" : "h-8 w-8";
  return (
    <div className="flex flex-col items-center py-16 gap-3">
      <div
        className={`animate-spin rounded-full ${dim} border-b-2 border-blue-600`}
        role="status"
        aria-label="로딩 중"
      />
      {message && <p className="text-sm text-gray-500">{message}</p>}
    </div>
  );
}

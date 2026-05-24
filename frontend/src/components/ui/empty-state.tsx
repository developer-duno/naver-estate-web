/** 빈 상태 표준 컴포넌트 — search 0건·즐겨찾기 0건·compare 단지 미선택 등 통일된 안내 */

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <div className="text-center py-12 px-4">
      <Icon className="mx-auto h-12 w-12 text-gray-300" aria-hidden="true" strokeWidth={1.5} />
      <p className="mt-4 text-sm font-medium text-gray-700">{title}</p>
      {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

/** 브라우저 뒤로/앞으로 시 navKey 증분 — FilterBar 리마운트 트리거 */
export function usePopstateRefresh(): { navKey: number } {
  const [navKey, setNavKey] = useState(0);

  useEffect(() => {
    const handler = () => setNavKey(k => k + 1);
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  return { navKey };
}

"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // SSR/CSR mismatch 방지 — 첫 렌더는 항상 placeholder, 이후 실제 UI
  // Why: Supabase 세션 비동기 로드 결과가 서버(null)와 클라이언트(user)에서 달라
  // React 19가 BAILOUT_TO_CLIENT_SIDE_RENDERING으로 전체 페이지 onClick 핸들러 미부착
  useEffect(() => {
    setMounted(true);
  }, []);

  const isMountedRef = useRef(true);
  const prevTokenRef = useRef<string | null>(null);
  useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    const supabase = createClient();

    const fetchRoleFromSupabase = async () => {
      if (!isMountedRef.current) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (user && isMountedRef.current) {
        const { data } = await supabase
          .from("user_profiles")
          .select("role")
          .eq("user_id", user.id)
          .single();
        if (data) setUserRole(data.role || null);
      }
    };

    const fetchProfile = async (accessToken: string) => {
      if (accessToken === prevTokenRef.current) return;
      prevTokenRef.current = accessToken;
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL;
        if (apiUrl) {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 15_000);
          try {
            const res = await fetch(`${apiUrl}/api/users/me`, {
              headers: { Authorization: `Bearer ${accessToken}` },
              signal: controller.signal,
            });
            if (res.ok && isMountedRef.current) {
              const data = await res.json();
              setUserRole(data.role || null);
            } else if (res.status === 401 && isMountedRef.current) {
              await supabase.auth.signOut();
              setUserRole(null);
            }
          } catch {
            await fetchRoleFromSupabase();
          } finally { clearTimeout(timer); }
        } else {
          await fetchRoleFromSupabase();
        }
      } catch (e) { console.error("[Header] profile fetch failed:", e); }
    };

    // 현재 세션 확인
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!isMountedRef.current) return;
        setUserEmail(session?.user?.email ?? null);
        if (session?.access_token) {
          fetchProfile(session.access_token);
        }
      } catch {
        if (isMountedRef.current) setUserEmail(null);
      }
    })();

    // 인증 상태 변화 감지
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMountedRef.current) return;
      setUserEmail(session?.user?.email ?? null);
      if (session?.access_token) {
        fetchProfile(session.access_token);
      } else {
        setUserRole(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUserEmail(null);
    setUserRole(null);
    router.refresh();
  };

  const isAdmin = userRole === "admin";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const toolsMenuRef = useRef<HTMLDivElement>(null);

  // 경로 변경 시 모바일 메뉴 + 계산기 드롭다운 닫기
  useEffect(() => {
    setMobileOpen(false);
    setToolsMenuOpen(false);
  }, [pathname]);

  // 드롭다운 외부 mousedown 닫기
  useEffect(() => {
    if (!toolsMenuOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) {
        setToolsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [toolsMenuOpen]);

  const toolsActive = pathname?.startsWith("/tools") ?? false;
  const navLinks = [
    { href: "/", label: "홈", active: pathname === "/" },
    { href: "/search", label: "검색", active: pathname?.startsWith("/search") },
    { href: "/mibunyang", label: "미분양", active: pathname?.startsWith("/mibunyang") },
    { href: "/pricing", label: "요금제", active: pathname === "/pricing" },
    { href: "/blog", label: "블로그", active: pathname?.startsWith("/blog") },
    { href: "/help", label: "도움말", active: pathname === "/help" },
    ...(isAdmin ? [{ href: "/admin", label: "관리", active: pathname?.startsWith("/admin") }] : []),
  ];

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50 no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-14">
          {/* 로고 */}
          <Link href="/" className="flex items-center gap-2">
            <span role="img" aria-label="홈" className="text-xl font-bold text-blue-600">🏠</span>
            <span className="text-lg font-bold text-gray-900">아파트·오피스텔</span>
          </Link>

          {/* 데스크톱 네비게이션 */}
          <nav className="hidden md:flex items-center gap-4">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium ${
                  link.active ? "text-blue-600" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {link.label}
              </Link>
            ))}

            {/* 계산기 드롭다운 */}
            <div ref={toolsMenuRef} className="relative">
              <button
                type="button"
                aria-expanded={toolsMenuOpen}
                aria-haspopup="menu"
                aria-controls="tools-menu"
                onClick={() => setToolsMenuOpen((v) => !v)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setToolsMenuOpen(false);
                }}
                className={`text-sm font-medium ${
                  toolsActive ? "text-blue-600" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                계산기 ▾
              </button>
              {toolsMenuOpen && (
                <div
                  id="tools-menu"
                  role="menu"
                  className="absolute right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg py-1 min-w-[160px] z-50"
                >
                  <Link
                    href="/tools/brokerage-fee"
                    role="menuitem"
                    onClick={() => setToolsMenuOpen(false)}
                    className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    중개수수료
                  </Link>
                  <Link
                    href="/tools/acquisition-tax"
                    role="menuitem"
                    onClick={() => setToolsMenuOpen(false)}
                    className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    취득세
                  </Link>
                </div>
              )}
            </div>

            {!mounted ? (
              <div className="w-[80px] h-[34px]" aria-hidden />
            ) : userEmail ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  {isAdmin && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                      관리자
                    </span>
                  )}
                  {userRole === "expert" && (
                    <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">
                      전문가
                    </span>
                  )}
                  <span className="text-xs text-gray-500 hidden sm:inline max-w-[120px] truncate">
                    {userEmail}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md px-3 py-1.5"
                >
                  로그아웃
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md px-3 py-1.5"
              >
                로그인
              </Link>
            )}
          </nav>

          {/* 모바일 햄버거 버튼 */}
          <button
            className="md:hidden p-2 text-gray-600 hover:text-gray-900"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? "메뉴 닫기" : "메뉴 열기"}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* 모바일 메뉴 */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 top-14 bg-black/30 z-40 md:hidden" onClick={() => setMobileOpen(false)} />
          <nav className="fixed top-14 right-0 bottom-0 w-64 bg-white shadow-xl z-50 p-4 flex flex-col gap-1 md:hidden overflow-y-auto">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`min-h-[44px] flex items-center px-3 rounded-lg text-base font-medium ${
                  link.active ? "text-blue-600 bg-blue-50" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                {link.label}
              </Link>
            ))}

            {/* 계산기 그룹 (모바일은 토글 없이 자식 2개 항상 표시) */}
            <div
              className={`min-h-[44px] flex items-center px-3 rounded-lg text-base font-medium ${
                toolsActive ? "text-blue-600" : "text-gray-700"
              }`}
            >
              계산기
            </div>
            <Link
              href="/tools/brokerage-fee"
              className={`min-h-[44px] flex items-center pl-7 pr-3 rounded-lg text-sm ${
                pathname === "/tools/brokerage-fee"
                  ? "text-blue-600 bg-blue-50"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              중개수수료
            </Link>
            <Link
              href="/tools/acquisition-tax"
              className={`min-h-[44px] flex items-center pl-7 pr-3 rounded-lg text-sm ${
                pathname === "/tools/acquisition-tax"
                  ? "text-blue-600 bg-blue-50"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              취득세
            </Link>

            <hr className="my-2 border-gray-200" />

            {userEmail ? (
              <>
                <div className="px-3 py-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    {isAdmin && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">관리자</span>
                    )}
                    {userRole === "expert" && (
                      <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">전문가</span>
                    )}
                  </div>
                  <span className="text-sm text-gray-500 break-all">{userEmail}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="min-h-[44px] flex items-center px-3 rounded-lg text-base font-medium text-gray-700 hover:bg-gray-50 w-full"
                >
                  로그아웃
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="min-h-[44px] flex items-center px-3 rounded-lg text-base font-medium text-gray-700 hover:bg-gray-50"
              >
                로그인
              </Link>
            )}
          </nav>
        </>
      )}
    </header>
  );
}

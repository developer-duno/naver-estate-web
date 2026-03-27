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

  const isMountedRef = useRef(true);
  const prevTokenRef = useRef<string | null>(null);
  useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    const supabase = createClient();

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
            // 백엔드 타임아웃 시 Supabase 직접 조회 폴백
            if (isMountedRef.current) {
              const { data: { user } } = await supabase.auth.getUser();
              if (user && isMountedRef.current) {
                const { data } = await supabase
                  .from("user_profiles")
                  .select("role")
                  .eq("user_id", user.id)
                  .single();
                if (data) setUserRole(data.role || null);
              }
            }
          } finally { clearTimeout(timer); }
        } else {
          // 백엔드 없이 Supabase 직접 조회
          const { data: { user } } = await supabase.auth.getUser();
          if (user && isMountedRef.current) {
            const { data } = await supabase
              .from("user_profiles")
              .select("role")
              .eq("user_id", user.id)
              .single();
            if (data) setUserRole(data.role || null);
          }
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

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-14">
          {/* 로고 */}
          <Link href="/" className="flex items-center gap-2">
            <span role="img" aria-label="홈" className="text-xl font-bold text-blue-600">🏠</span>
            <span className="text-lg font-bold text-gray-900">아파트·오피스텔</span>
          </Link>

          {/* 네비게이션 */}
          <nav className="flex items-center gap-4">
            <Link
              href="/"
              className={`text-sm font-medium ${
                pathname === "/" ? "text-blue-600" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              홈
            </Link>
            <Link
              href="/search"
              className={`text-sm font-medium ${
                pathname?.startsWith("/search") ? "text-blue-600" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              검색
            </Link>
            <Link
              href="/help"
              className={`text-sm font-medium ${
                pathname === "/help" ? "text-blue-600" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              도움말
            </Link>

            {isAdmin && (
              <Link
                href="/admin"
                className={`text-sm font-medium ${
                  pathname?.startsWith("/admin") ? "text-blue-600" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                관리
              </Link>
            )}

            {userEmail ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  {isAdmin && (
                    <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                      관리자
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
        </div>
      </div>
    </header>
  );
}

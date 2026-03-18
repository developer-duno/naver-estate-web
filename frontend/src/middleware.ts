import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 관리자 페이지 보호 대상 경로
const ADMIN_PATHS = ["/admin"];
// 로그인 필수 경로
const AUTH_REQUIRED_PATHS = ["/complex"];
// 관리자 이메일 (환경변수 우선, 폴백: 기본 관리자)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "kyh11kyh@gmail.com";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({
          request: { headers: request.headers },
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // 세션 자동 갱신 — Supabase 장애 시에도 공개 페이지는 정상 동작
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // Supabase 장애 시 미인증 상태로 처리
  }

  const pathname = request.nextUrl.pathname;

  // 관리자 경로 보호: 미인증 또는 admin 역할 아닌 경우 차단
  const isAdminPath = ADMIN_PATHS.some((p) => pathname.startsWith(p));
  if (isAdminPath) {
    if (!user) {
      const loginUrl = new URL("/login", request.url);
      if (!pathname.startsWith("/login") && !pathname.startsWith("/signup")) {
        loginUrl.searchParams.set("redirect", pathname);
      }
      return NextResponse.redirect(loginUrl);
    }
    // 관리자 이메일이 아니면 차단
    if (user.email !== ADMIN_EMAIL) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  // 로그인 필수 경로 보호 (/complex/*)
  const isAuthRequired = AUTH_REQUIRED_PATHS.some((p) => pathname.startsWith(p));
  if (isAuthRequired && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 로그인 사용자가 /login, /signup 접근 시 홈으로 리다이렉트
  const isAuthPage = pathname === "/login" || pathname === "/signup";
  if (isAuthPage && user) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

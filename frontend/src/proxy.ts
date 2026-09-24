import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isLockedPath } from "@/lib/locked-paths";

// 관리자 페이지 보호 대상 경로
const ADMIN_PATHS = ["/admin"];
// 로그인 필수 경로
const AUTH_REQUIRED_PATHS = ["/complex", "/verify"];
// 관리자 user_id 목록 — 서버 전용 env `ADMIN_USER_IDS`(쉼표 구분, NEXT_PUBLIC 아님).
// ⛔ 이메일로 판정하지 않는다(세션 417): 이메일 목록은 가입 안 된 주소가 들어가는 순간
//    그 주소로 가입한 사람이 관리자가 되는 구조다. user.id 는 getUser() 가 Supabase 서버에서
//    검증한 값이라 위조할 수 없다. backend `deps.is_admin_user` 와 같은 목록을 쓴다.
// 요청마다 읽는다(테스트에서 env 를 바꿔 끼울 수 있게 — 쉼표 분리라 비용 무시 가능).
function adminUserIds(): Set<string> {
  return new Set(
    (process.env.ADMIN_USER_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

export async function proxy(request: NextRequest) {
  // 잠긴 페이지(세션 400 무료 전환 — /pricing)는 로그인 여부·역할 무관 전원 홈으로.
  // 아래 분기들보다 먼저 두는 이유 2가지:
  //   1) 인증 분기 뒤면 미인증자가 /login?redirect=/pricing 을 거쳐 로그인 후 잠긴 화면에 도달한다.
  //   2) Supabase env 가드(조기 return) 뒤면 env 가 비는 환경에서 잠금이 통째로 풀린다 —
  //      잠금은 인증과 무관한 정책이라 세션 조회 성공 여부에 의존하지 않아야 한다.
  if (isLockedPath(request.nextUrl.pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

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
    // 관리자 user_id 가 아니면 차단 (ADMIN_USER_IDS 미설정 시 전원 차단 = 안전한 쪽 실패)
    const adminIds = adminUserIds();
    if (adminIds.size === 0) {
      console.warn("[proxy] ADMIN_USER_IDS 미설정 — /admin 전원 차단");
    }
    if (!adminIds.has(user.id)) {
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

  // 로그인 사용자가 /login, /signup, /forgot-password 접근 시 홈으로 리다이렉트
  // /verify 는 인증 후만 접근 의도라 제외 (AUTH_REQUIRED_PATHS 에 포함)
  const isAuthPage =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/forgot-password";
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

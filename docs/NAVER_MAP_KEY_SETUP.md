# 네이버 지도 키 발급·등록 안내 (2u.pe.kr 지도 표시용)

> 이 키를 Vercel 에 넣으면 미분양 화면의 "지도" 버튼과 단지 상세 지도가 운영 사이트에 표시됩니다.
> 키가 없으면 코드는 멀쩡하고, 지도 버튼만 안 보입니다 (graceful degradation).

코드가 쓰는 환경변수: **`NEXT_PUBLIC_NAVER_MAP_CLIENT_ID`**
코드가 SDK 를 부르는 방식: `https://oapi.map.naver.com/openapi/v3/maps.js?ncpClientId=<키>`
(파일: `frontend/src/app/mibunyang/layout.tsx`, `frontend/src/app/complex/[no]/layout.tsx`)

---

## 1단계 — 네이버 클라우드 플랫폼(NCP)에서 키 발급  👤 사장님

1. https://www.ncloud.com 접속 → 로그인 (네이버 계정 아님, **NCP 계정**. 없으면 가입)
2. 콘솔(Console) 진입 → 검색창에 **"Maps"** 또는 **"Application"** 검색
   - 정확한 메뉴 경로: **Services → AI·NAVER API → Application** (또는 **Maps → Application**)
3. **Application 등록** 버튼 클릭
   - Application 이름: 예) `2u-realestate`
   - **Service 선택에서 "Maps" → "Web Dynamic Map" 체크** (이게 지도 SDK)
4. 등록하면 **인증 정보 2개**가 나옵니다:
   - **Client ID** (또는 화면에 따라 **Key ID**) ← **이게 우리가 쓰는 값**
   - Client Secret ← 우리 코드는 **안 씀** (프론트엔드 SDK 는 ID만)

> ⚠️ **확인 포인트**: 발급 화면에서 인증값 이름이 `Client ID` 인지 `Key ID` 인지 봐주세요.
> 우리 코드는 `ncpClientId=` 파라미터를 씁니다. 만약 NCP 가 최근 개편되어 키 발급 시
> "ncpKeyId 를 쓰라"고 안내하면, 그 사실을 저(Claude)에게 알려주세요 — 코드 1줄
> (`ncpClientId` → `ncpKeyId`)만 고치면 됩니다. 지금은 기존 단지 상세 지도가 뜨던 방식
> 그대로라 대부분 `Client ID` 로 동작합니다.

## 2단계 — 웹 서비스 URL 등록 (도메인 허용)  👤 사장님

같은 Application 설정에서 **"Web 서비스 URL"** 에 아래 도메인을 **모두** 추가:

```
https://2u.pe.kr
https://www.2u.pe.kr
http://localhost:3000
http://localhost:3100
```

> 이걸 안 하면 등록 안 된 도메인에서 지도 호출 시 인증 오류가 납니다.
> localhost 두 개는 로컬 개발에서 지도 확인용 (사장님 PC).

## 3단계 — Vercel 환경변수 등록  👤 사장님

1. https://vercel.com → 로그인 → 프로젝트 **`naver-estate-web`** 선택
2. **Settings → Environment Variables**
3. 새 변수 추가:
   - Name: `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID`
   - Value: 1단계에서 받은 **Client ID** 값
   - Environment: **Production, Preview, Development 전부 체크**
4. 저장 후 **재배포 필요**:
   - Deployments 탭 → 최신 배포 → "Redeploy" (또는 다음 git push 시 자동 반영)
   - ⚠️ `NEXT_PUBLIC_` 변수는 **빌드 타임에 코드에 박히므로**, 변수만 추가하고
     재배포 안 하면 안 뜹니다. 반드시 Redeploy.

## 4단계 — 확인

재배포 후 https://2u.pe.kr/mibunyang → 분양 탭 → 우측 상단에 **"목록 | 지도"** 토글이
생기면 성공. "지도" 누르면 단지들이 핀으로 표시됩니다.

(키가 틀렸거나 도메인 미등록이면 지도 영역에 "지도를 불러오지 못했습니다" 가 뜹니다.)

---

## 로컬에서 먼저 테스트하려면 (선택)  👤 사장님

운영에 넣기 전 사장님 PC 에서 먼저 보고 싶으면:

1. `frontend/.env.local` 파일에 한 줄 추가:
   ```
   NEXT_PUBLIC_NAVER_MAP_CLIENT_ID=발급받은_Client_ID
   ```
2. `cd frontend && npm run dev` → http://localhost:3100/mibunyang
   (2단계에서 localhost:3100 도메인 등록했어야 함)

> `.env.local` 은 git 에 안 올라가니(시크릿) 안전합니다.

# 무료 한도 가드 (GitHub · Vercel)

세션 323 신설. GitHub/Vercel 무료 범위를 최대 활용하되 한도 초과를 사전에 인지하기 위한 기준.
초과 시 둘 다 **과금이 아니라 정지**다(요금 폭탄 없음). Pro 전환 트리거를 명시해 데이터 기반 결정.

## GitHub (Free + **공개(public)** 레포 `developer-duno/naver-estate-web`)

| 자원 | 무료 한도 | 현재 절약 장치 |
|---|---|---|
| Actions 분 | **무제한(해당 없음)** — public 레포는 GitHub-hosted runner 무료·무제한. 2,000분 쿼터는 비공개 레포 기준이라 이 레포엔 적용되지 않는다(세션 398 실측: `billable.UBUNTU.total_ms` 전부 0, 세션 399 재확인: `gh api ... --jq .visibility` → public) | CI path-filter(`changes` 잡)로 FE/BE 변경분만 실행 + `cancel-in-progress`(연속 푸시 시 직전 취소) |
| Dependabot 알림·자동수정 | 무제한(무료) | 세션 323 활성 |
| Dependabot 버전 PR | Actions 분 소비 | 주1회·grouped(minor/patch 묶음)·PR 상한 5로 절약 |

- **초과 거동**: 해당 없음(무제한). ⚠ 과거 문서·메모리의 "한도 소진으로 감시가 죽었다"는 서술은 **거짓 전제**였다 — 그 시기 Health Check 는 계속 실행됐고 실제로 터널이 죽어 있었다(세션 398 규명).
- **🔴 재검토 필요**: secret scanning·push protection 은 **public 레포에 무료**인데 현재 `disabled` 다(세션 399 실측 `gh api repos/... --jq .security_and_analysis`). "비공개라 불가"는 틀린 근거였다 — 켤지 여부는 사장님 결정 대기. CodeQL 도 public 무료.
- **브랜치 보호**: 현행 Ruleset 유지(동작 중). public 이면 클래식 보호도 무료지만 교체 실익 없음.

## Vercel (Hobby + 프로젝트 `naver-estate-web`, Root Directory=`frontend`)

| 자원 | 무료 한도(Hobby) | 비고 |
|---|---|---|
| 대역폭 | 100GB/월 | |
| 빌드 분 | 100분/월 | **3 프로젝트(naver·mibunyang·kospi) 공유** |
| 함수 호출 | 100만/월 | |
| 배포 | 무제한 | |

- **빌드 절약**: `frontend/vercel.json` 의 `ignoreCommand` 로 frontend 무관 커밋(최근 50커밋 중 19건=38%)은 빌드 스킵.
  - exit 0=스킵, exit 1=진행. `git diff --quiet HEAD^ HEAD -- .`(Root Directory=frontend 기준).
  - ⚠ 자동 "Skip unaffected projects"(workspaces 필수)는 이 레포 구조상 미동작 → ignoreCommand 가 대체.
- **초과 거동**: 한도 도달 시 프로젝트 일시정지(과금 없음).
- **⚠ 약관**: Hobby 는 **비상업적·개인용 한정**. 이 서비스는 공인중개사 유료 구독(결제 시스템 보유) = **상업적**.
  - **Pro 전환 트리거 = 첫 유료 결제 발생 시점.** 그 전까진 Hobby 유지(사장님 결정, 세션 323).
  - Pro = $20/월/seat. 매출 시작 후 비용 정당.

## 점검 주기

- 월초: Actions 분·Vercel 빌드분 잔량 확인(대시보드).
- 첫 유료 결제 발생 시: Vercel Pro 전환 검토.

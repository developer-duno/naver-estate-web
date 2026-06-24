# 무료 한도 가드 (GitHub · Vercel)

세션 323 신설. GitHub/Vercel 무료 범위를 최대 활용하되 한도 초과를 사전에 인지하기 위한 기준.
초과 시 둘 다 **과금이 아니라 정지**다(요금 폭탄 없음). Pro 전환 트리거를 명시해 데이터 기반 결정.

## GitHub (Free + 비공개 레포 `developer-duno/naver-estate-web`)

| 자원 | 무료 한도 | 현재 절약 장치 |
|---|---|---|
| Actions 분 | **2,000분/월** | CI path-filter(`changes` 잡)로 FE/BE 변경분만 실행 + `cancel-in-progress`(연속 푸시 시 직전 취소) |
| Dependabot 알림·자동수정 | 무제한(무료) | 세션 323 활성 |
| Dependabot 버전 PR | Actions 분 소비 | 주1회·grouped(minor/patch 묶음)·PR 상한 5로 절약 |

- **초과 거동**: Actions 분 소진 시 그 달 워크플로 실행 중단(다음 달 리셋). 과금 없음.
- **미사용(무료 불가)**: CodeQL·secret scanning push protection = 비공개+Free 불가(GitHub Advanced Security 유료). 켜지 않음.
- **클래식 브랜치 보호** = 비공개 Pro 필요 → **Ruleset(무료)** 으로 main 보호 대체.

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

"""오피스텔·도시형 청약 수집 잡 (이슈 #323, V045 완전 분리 테이블 + 페이지네이션).

기존 아파트 청약(mibunyang collect-applyhome-detail.mjs)과 별개로
naver-estate-web 이 자체 수집. mibunyang 은 오피스텔 API(getUrbtyOfctl*) 를
호출하지 않고(설계 §범위 밖 확정) apartments 로스터를 채우는 API 도 청약홈
아파트/무순위 채널(getRemndrLttotPblancDetail 등)이라 오피스텔 house_manage_no
와 애초에 매칭될 상대가 없다 — 구조적으로 항상 0건 매칭 (2026-08-08 최종
전체검토에서 발견, 근본 수정).

V045 근본수정 (2026-08-10): 위 사실을 반영해 오피스텔 전용 데이터를 아파트
청약 테이블(presale_schedule_official/applyhome_unit_supply)에 apartment_id
placeholder(`ah-{HOUSE_MANAGE_NO}`)로 끼워 넣던 방식을 폐기하고, 완전히
독립된 officetel_presale_schedule/officetel_unit_supply 테이블로 이전했다.
apartment_id 매칭 로직 자체가 사라져 house_manage_no 하나만으로 조회·upsert.

⚠ odcloud 응답 필드명은 아파트/민간임대 오퍼레이션과 다르다 (2026-08-10 실측,
`getUrbtyOfctlLttotPblancDetail`/`getUrbtyOfctlLttotPblancMdl` 라이브 호출로 확인):
  - detail: 특별공급/1순위/2순위 접수기간이 분리돼 있지 않고 `SUBSCRPT_RCEPT_BGNDE/ENDDE`
    통합 접수기간 하나뿐이다. 계약기간은 `CNTRCT_CNCLS_BGNDE/ENDDE`, 당첨자발표는
    `PRZWNER_PRESNATN_DE`, 입주예정월은 `MVN_PREARNGE_YM`. `CNSTRCT_ENTRPS_NM`(시공사)
    필드는 응답에 없다(항상 None). `SUBSCRPT_AREA_CODE_NM`(청약 지역명, "경기" 등)은
    region_name 컬럼에 저장(지역 필터는 아직 미구현 — get_officetel_schedules() 참조).
  - unit: `HOUSE_TY`/`SUPLY_AR`/특별공급 유형별 필드가 없다. 실제로는 `TP`(주택형),
    `EXCLUSE_AR`(전용면적), `SUPLY_HSHLDCO`(공급세대수, 일반/특별 구분 없는 통합값),
    `SUPLY_AMOUNT`(공급금액), `SUBSCRPT_REQST_AMOUNT`(청약신청금)뿐이다. general_supply/
    special_supply/special_by_type(아파트 청약 틀 복사)은 원본 데이터가 API 에 없어
    2026-08-10 재검증에서 제거하고, 오피스텔 API가 실제로 주는 위 필드들로 교체했다.

2026-08-10 재설계 (컬럼 리뉴얼): 처음 만든 officetel_unit_supply 는 아파트 청약
스키마(general_supply/special_supply/special_by_type)를 그대로 복사한 것이었으나
실제로는 전부 항상 NULL(오피스텔 API가 안 줌)이었다. 오피스텔 API가 실제로 주는
값(SUPLY_HSHLDCO/SUPLY_AMOUNT/SUBSCRPT_REQST_AMOUNT)으로 컬럼을 다시 설계했다.
top_amount 는 아파트 청약과 시리얼라이저·FE 가 공유하는 키라 컬럼만 유지(항상 NULL).

주1회(월요일) 스케줄러 잡. crawler/service_public.py 의 job 기록·에러 처리
패턴(CrawlJob cancelled/completed/failed)을 그대로 따른다.
"""

import logging
import os

from crawler.applyhome_officetel_api import (
    fetch_officetel_detail,
    fetch_officetel_unit,
    parse_comma_amount,
    parse_compact_date,
)
from crawler.service_common import fail_job_safely
from db.database import SessionLocal
from db.mb_models import OfficetelPresaleSchedule, OfficetelUnitSupply
from db.models import CrawlJob
from utils import utcnow

logger = logging.getLogger(__name__)

# 안전 상한 — vworld_price_api.py MAX_PAGES 선례 답습. 이 데이터는 훨씬 작아
# (2026-08-10 실측 detail=608건/unit=3107건, per_page=1000 기준 각 1페이지) 20페이지면
# per_page=1000 기준 최대 2만 건까지 커버해 여유 충분.
MAX_PAGES = 20


def _fetch_all_pages(fetch_fn, per_page: int) -> list[dict]:
    """odcloud 오퍼레이션의 전 페이지를 모아 반환.

    vworld_price_api.py fetch_official_prices() 와 달리 이 데이터는 규모가
    훨씬 작아 totalCount 기반 페이지 수 계산 없이, len(rows) < per_page 면
    마지막 페이지로 간주하고 종료하는 단순 방식으로 충분(계획서 명시).
    행수 불일치 시 하드 실패(vworld 처럼 통째 포기)는 넣지 않는다 — 청약공고는
    세금 정확도 데이터가 아니라 다음 주 재수집으로 자연 보정되면 충분.
    """
    all_rows: list[dict] = []
    page = 1
    while page <= MAX_PAGES:
        resp = fetch_fn(page=page, per_page=per_page)
        rows = resp.get("data", [])
        all_rows.extend(rows)
        if len(rows) < per_page:
            break
        page += 1
    return all_rows


def collect_officetel_presale(batch_size: int = 1000, scheduler_job_id: str | None = None):
    """오피스텔/도시형 청약 공고 + 평형별 공급정보 수집 → officetel_* 테이블 upsert.

    house_manage_no 기준 전량 upsert (apartments 로스터 매칭 게이트 없음 — V045
    완전 분리 테이블이라 애초에 apartments 를 참조하지 않는다).
    """
    api_key = os.getenv("PUBLIC_DATA_API_KEY")
    if not api_key:
        logger.info("PUBLIC_DATA_API_KEY 미설정 — 오피스텔 청약 수집 건너뜀")
        if scheduler_job_id:
            db = SessionLocal()
            job = CrawlJob(
                job_type="officetel_presale", scheduler_job_id=scheduler_job_id,
                status="cancelled", started_at=utcnow(), completed_at=utcnow(),
                error_message="PUBLIC_DATA_API_KEY 미설정",
            )
            db.add(job)
            db.commit()
            db.close()
        return

    db = SessionLocal()
    job = CrawlJob(
        job_type="officetel_presale", scheduler_job_id=scheduler_job_id,
        status="running", started_at=utcnow(),
    )
    db.add(job)
    db.commit()
    job_id = job.id

    try:
        detail_rows = _fetch_all_pages(fetch_officetel_detail, batch_size)

        matched = 0
        for row in detail_rows:
            hmn = row.get("HOUSE_MANAGE_NO")
            house_nm = row.get("HOUSE_NM")
            if not hmn or not house_nm:
                continue

            existing = (
                db.query(OfficetelPresaleSchedule)
                .filter(OfficetelPresaleSchedule.house_manage_no == hmn)
                .first()
            )
            recruit_date = parse_compact_date(row.get("RCRIT_PBLANC_DE"))
            fields = {
                "pblanc_no": row.get("PBLANC_NO"),
                "house_nm": house_nm,
                "recruit_date": recruit_date,
                # odcloud 오피스텔 오퍼레이션은 특별공급/1·2순위 접수기간이 분리돼
                # 있지 않다 — 통합 청약접수기간(SUBSCRPT_RCEPT_*)을 general_rank1
                # 슬롯에 담는다(가장 근접한 의미). special_receipt/general_rank2 는
                # 대응 원본이 없어 항상 None.
                "general_rank1_bgnde": parse_compact_date(row.get("SUBSCRPT_RCEPT_BGNDE")),
                "general_rank1_endde": parse_compact_date(row.get("SUBSCRPT_RCEPT_ENDDE")),
                "winner_announce_date": parse_compact_date(row.get("PRZWNER_PRESNATN_DE")),
                "contract_bgnde": parse_compact_date(row.get("CNTRCT_CNCLS_BGNDE")),
                "contract_endde": parse_compact_date(row.get("CNTRCT_CNCLS_ENDDE")),
                "move_in_ym": row.get("MVN_PREARNGE_YM"),
                "tot_supply": row.get("TOT_SUPLY_HSHLDCO"),
                "pblanc_url": row.get("PBLANC_URL"),
                "biz_entity": row.get("BSNS_MBY_NM"),
                # CNSTRCT_ENTRPS_NM(시공사)은 이 오퍼레이션 응답에 없다 — 항상 None.
                "constructor": row.get("CNSTRCT_ENTRPS_NM"),
                # 지역 필터는 아직 미구현(get_officetel_schedules() 참조) — 데이터만 미리 적재.
                "region_name": row.get("SUBSCRPT_AREA_CODE_NM"),
            }
            if existing:
                for k, v in fields.items():
                    setattr(existing, k, v)
                existing.fetched_at = utcnow()
            else:
                db.add(
                    OfficetelPresaleSchedule(
                        house_manage_no=hmn, fetched_at=utcnow(), **fields,
                    )
                )
            matched += 1
        db.commit()

        unit_rows = _fetch_all_pages(fetch_officetel_unit, batch_size)
        unit_matched = 0
        for row in unit_rows:
            hmn = row.get("HOUSE_MANAGE_NO")
            model_no = row.get("MODEL_NO")
            if not hmn or not model_no:
                continue

            existing_unit = (
                db.query(OfficetelUnitSupply)
                .filter(
                    OfficetelUnitSupply.house_manage_no == hmn,
                    OfficetelUnitSupply.model_no == model_no,
                )
                .first()
            )
            fields = {
                # TP("75OA") 가 주택형 역할 — 아파트/민간임대의 HOUSE_TY 와 대응 개념.
                "house_ty": row.get("TP"),
                # 이 오퍼레이션엔 공급면적(SUPLY_AR) 필드가 없다 — 전용면적(EXCLUSE_AR)이
                # 가장 근접한 값이라 supply_area 에 매핑(정확한 "공급면적"은 아님, 실측 한계).
                "supply_area": _to_float(row.get("EXCLUSE_AR")),
                # SUPLY_HSHLDCO — 공급세대수(일반/특별 구분 없는 통합값, 정수 그대로).
                "supply_hshldco": row.get("SUPLY_HSHLDCO"),
                # SUPLY_AMOUNT/SUBSCRPT_REQST_AMOUNT — 콤마 없는 순수 숫자 문자열이지만
                # parse_comma_amount() 가 콤마 유무 상관없이 처리하는 상위호환 함수라 재사용
                # (오퍼레이션마다 콤마 유무가 다른 게 이 API 계열의 실측 패턴 — applyhome_officetel_api.py 참조).
                "supply_amount": parse_comma_amount(row.get("SUPLY_AMOUNT")),
                "subscrpt_reqst_amount": parse_comma_amount(row.get("SUBSCRPT_REQST_AMOUNT")),
                # 아파트 청약과 시리얼라이저·FE 가 공유하는 키라 컬럼만 유지 — 이 오퍼레이션
                # 응답엔 대응 필드가 없어 항상 None(2026-08-10 재검증 확정).
                "top_amount": None,
            }
            if existing_unit:
                for k, v in fields.items():
                    setattr(existing_unit, k, v)
                existing_unit.fetched_at = utcnow()
            else:
                db.add(
                    OfficetelUnitSupply(
                        house_manage_no=hmn, model_no=model_no,
                        fetched_at=utcnow(), **fields,
                    )
                )
            unit_matched += 1
        db.commit()

        job.status = "completed"
        job.total_items = len(detail_rows) + len(unit_rows)
        job.processed_items = matched + unit_matched
        job.completed_at = utcnow()
        db.commit()
        logger.info(
            "오피스텔 청약 수집 완료: 공고 %d/%d upsert, 평형 %d/%d upsert",
            matched, len(detail_rows), unit_matched, len(unit_rows),
        )
    except Exception as e:
        try:
            db.rollback()
            job.status = "failed"
            job.error_message = str(e)[:500]
            db.commit()
        except Exception:
            fail_job_safely(job_id, str(e)[:500])
        logger.exception("오피스텔 청약 수집 실패")
    finally:
        db.close()


def _to_float(v) -> float | None:
    """odcloud 숫자 문자열("75.8112")을 float 로. None·빈문자열·파싱불가는 None."""
    if v is None:
        return None
    s = str(v).strip()
    if not s or s == "-":
        return None
    try:
        return float(s)
    except ValueError:
        return None

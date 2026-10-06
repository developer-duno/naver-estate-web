"""에어코리아 대기질 API — 실시간 수집은 PR #675(세션604)로 폐지됐다.

이 클래스는 시험(test_kapt_pace·test_quota_bucket)이 기반 클래스 예로만 쓰려고 남겨 둔 빈 껍데기다.
옛 근접 측정소·실시간 대기질 호출과 좌표계 실측 기록(EPSG:5181, TM 중부원점 y_0=500,000)은
git 이력의 b6698d92 판 `backend/crawler/air_quality_api.py` 를 참고한다.
"""

from crawler.public_data_base import BasePublicDataAPI


class AirQualityAPI(BasePublicDataAPI):
    """에어코리아 대기질 API"""

    _api_name = "air_quality"

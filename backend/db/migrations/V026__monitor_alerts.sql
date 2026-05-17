-- V026: monitor_alerts — 크롤링 모니터 알림 쿨다운 상태 테이블
-- monitor job 이 감지한 장애의 활성·해소 상태를 추적해 텔레그램 중복 발송 억제.
-- alert_key 로 장애 종류 식별 (예: "crawl_failed:crawl_articles", "freshness:articles").

CREATE TABLE IF NOT EXISTS monitor_alerts (
    id            BIGSERIAL    PRIMARY KEY,
    alert_key     VARCHAR(100) NOT NULL UNIQUE,
    status        VARCHAR(20)  NOT NULL DEFAULT 'active',  -- active / resolved
    detail        TEXT,
    first_seen    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_notified TIMESTAMPTZ,
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 역방향 (롤백):
-- DROP TABLE IF EXISTS monitor_alerts;

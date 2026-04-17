-- V020: 네이버 API 호출 시간당 집계 테이블
-- record_call() 영속화 — 프로세스 재시작에도 24h 통계 유지

CREATE TABLE naver_api_call_counts (
    id           BIGSERIAL    PRIMARY KEY,
    label        VARCHAR(50)  NOT NULL,
    bucket_hour  TIMESTAMPTZ  NOT NULL,
    call_count   INTEGER      NOT NULL DEFAULT 0,
    CONSTRAINT uq_nacc_label_bucket UNIQUE (label, bucket_hour)
);

CREATE INDEX idx_nacc_label_bucket ON naver_api_call_counts (label, bucket_hour DESC);

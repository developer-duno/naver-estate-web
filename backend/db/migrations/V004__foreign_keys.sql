-- V004: Foreign key constraints + remaining filter indexes
-- Phase 1-3: 외래키 추가로 데이터 무결성 보장

-- FK: articles.complex_no -> complexes.complex_no
ALTER TABLE articles
  ADD CONSTRAINT fk_articles_complex
  FOREIGN KEY (complex_no) REFERENCES complexes(complex_no) ON DELETE CASCADE;

-- FK: complex_pyeong_details.complex_no -> complexes.complex_no
ALTER TABLE complex_pyeong_details
  ADD CONSTRAINT fk_cpd_complex
  FOREIGN KEY (complex_no) REFERENCES complexes(complex_no) ON DELETE CASCADE;

-- FK: complex_price_history.complex_no -> complexes.complex_no
ALTER TABLE complex_price_history
  ADD CONSTRAINT fk_cph_complex
  FOREIGN KEY (complex_no) REFERENCES complexes(complex_no) ON DELETE CASCADE;

-- FK: article_price_history.article_no -> articles.article_no
ALTER TABLE article_price_history
  ADD CONSTRAINT fk_aph_article
  FOREIGN KEY (article_no) REFERENCES articles(article_no) ON DELETE CASCADE;

-- Remaining filter indexes (low priority, add if needed for performance)
CREATE INDEX IF NOT EXISTS idx_articles_room_count ON articles (room_count) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_articles_direction ON articles (direction) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_articles_maintenance ON articles (numeric_maintenance_cost) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_articles_building_name ON articles (building_name) WHERE is_active = TRUE;

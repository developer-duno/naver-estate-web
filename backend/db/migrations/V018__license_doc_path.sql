-- V018: 자격증 서류 업로드 경로 추가 (HRDKOREA API 폐기 → 수동 확인 전환)
ALTER TABLE agent_verifications ADD COLUMN license_doc_path TEXT;

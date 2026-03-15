-- V005: Add unique constraint on complex_pyeong_details(complex_no, pyeong_no)
-- Prevents duplicate pyeong entries per complex, enables proper upsert

-- Remove any existing duplicates first (keep the latest one)
DELETE FROM complex_pyeong_details a
USING complex_pyeong_details b
WHERE a.id < b.id
  AND a.complex_no = b.complex_no
  AND a.pyeong_no = b.pyeong_no;

-- Add unique constraint
ALTER TABLE complex_pyeong_details
  ADD CONSTRAINT complex_pyeong_details_complex_no_pyeong_no_key
  UNIQUE (complex_no, pyeong_no);

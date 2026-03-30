-- 1박스당 수량 저장을 위한 컬럼 추가 (필수)
-- 아래 SQL을 복사하여 Supabase 대시보드 -> SQL Editor 탭에 붙여넣고 RUN 버튼을 눌러주세요!
ALTER TABLE products ADD COLUMN IF NOT EXISTS box_quantity numeric NULL;

-- --------------------------------------------------------
-- Supabase Schema Cache 강제 갱신 (만약 위 명령어 실행 후에도 인식이 안된다면 실행)
NOTIFY pgrst, 'reload schema';

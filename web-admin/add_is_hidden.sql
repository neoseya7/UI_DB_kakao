-- ==========================================
-- orders 테이블 is_hidden 컬럼 추가 스크립트
-- ==========================================
-- 주문관리 페이지에서 "해당 일자 데이터 숨김" 버튼을 동작시키기 위해
-- orders 테이블에도 상품(products)과 똑같이 is_hidden 컬럼을 추가해야 합니다.
--
-- 아래의 코드를 모두 복사하여 Supabase 홈페이지의 [SQL Editor]에 붙여넣고 [Run] 을 눌러주세요.

ALTER TABLE IF EXISTS orders 
ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE;

-- 완료되었습니다. 바로 로컬(localhost:3000)에서 테스트해보실 수 있습니다.

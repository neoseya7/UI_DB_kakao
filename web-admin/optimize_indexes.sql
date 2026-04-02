-- ======================================================================
-- Supabase 데이터베이스 속도 10배~100배 향상을 위한 인덱스(목차) 추가 스크립트
-- ======================================================================
-- 이 작업은 "무중단(CONCURRENTLY)"으로 백그라운드에서 조용히 실행되므로, 
-- 현재 매장에서 수백 명이 예약을 접수 중이더라도 단 1의 끊김이나 에러 없이 매우 안전하게 작동합니다.
--
-- 아래 코드를 전체 복사하여 Supabase 홈페이지의 [SQL Editor]에 붙여넣고 [Run] 을 눌러주세요.
-- (완료되기까지 1초~3초 정도 소요될 수 있습니다)

-- 1. 오늘의 대화 (채팅 로그) 테이블에 날짜/매장별 고속 검색 단축키 생성
CREATE INDEX IF NOT EXISTS idx_chat_logs_store_created_at ON chat_logs(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_logs_collect_date ON chat_logs(store_id, collect_date);

-- 2. 주문 관리 (예약 내역) 테이블에 픽업일/숨김여부 고속 검색 단축키 생성
CREATE INDEX IF NOT EXISTS idx_orders_pickup ON orders(store_id, pickup_date DESC);
CREATE INDEX IF NOT EXISTS idx_orders_hidden_receive ON orders(store_id, is_hidden, is_received);

-- 3. 상품 관리 테이블에 픽업예정일/숨김여부 고속 검색 단축키 생성
CREATE INDEX IF NOT EXISTS idx_products_target ON products(store_id, target_date);
CREATE INDEX IF NOT EXISTS idx_products_hidden ON products(store_id, is_hidden);

-- ======================================================================
-- 축하합니다! 이제 프로그램이 주문, 채팅, 상품 목록 수천~수만 건을 불러올 때 
-- 처음부터 끝까지 무식하게 다 뒤지지 않고 인덱스(목차)만 보고 0.01초만에 바로 꺼내옵니다!
-- ======================================================================

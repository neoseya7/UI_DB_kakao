-- products 테이블에 archived_received_qty 컬럼 추가
-- 수령제품 삭제 시 누적되는 수령 수량 (미예약/매장재고 계산 보정용)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS archived_received_qty NUMERIC NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.products.archived_received_qty IS
  '주문관리에서 수령제품 삭제 시 누적되는 수령 수량. 미예약 계산: allocated_stock - orderSum - archived_received_qty';

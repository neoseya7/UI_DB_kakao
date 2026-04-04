-- ======================================================================
-- Supabase N+1 병목 현상 해결을 위한 초고속 주문 병합 조회 함수 (RPC)
-- ======================================================================
-- 이 스크립트를 Supabase SQL Editor 창에 복사/붙여넣기 후 [Run] 버튼을 눌러주세요.
-- 이미 존재한다면 자동으로 덮어쓰기(수정)가 되므로 마음 편히 누르셔도 됩니다.

CREATE OR REPLACE FUNCTION public.get_matrix_orders(
    p_store_id UUID,
    p_pickup_date DATE DEFAULT NULL,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    customer_nickname TEXT,
    customer_memo_1 TEXT,
    customer_memo_2 TEXT,
    is_received BOOLEAN,
    pickup_date DATE,
    items JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.id,
        o.customer_nickname,
        o.customer_memo_1,
        o.customer_memo_2,
        o.is_received,
        o.pickup_date,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'product_id', oi.product_id,
                    'quantity', oi.quantity
                )
            ) FILTER (WHERE oi.product_id IS NOT NULL),
            '[]'::jsonb
        ) as items
    FROM public.orders o
    LEFT JOIN public.order_items oi ON o.id = oi.order_id
    WHERE o.store_id = p_store_id
      AND o.is_hidden = false
      -- 조건 1: 오늘(또는 특정일) 검색인 경우
      AND (p_pickup_date IS NULL OR o.pickup_date = p_pickup_date)
      -- 조건 2: 특정 기간(~부터 ~까지) 검색인 경우
      AND (
          (p_start_date IS NULL AND p_end_date IS NULL) OR 
          (p_start_date IS NOT NULL AND p_end_date IS NOT NULL AND o.pickup_date >= p_start_date AND o.pickup_date <= p_end_date) OR
          (p_start_date IS NOT NULL AND p_end_date IS NULL AND o.pickup_date = p_start_date)
      )
    GROUP BY o.id
    ORDER BY o.pickup_date DESC, o.created_at DESC
    LIMIT 5000;
END;
$$;

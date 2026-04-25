-- ========================================================
-- Supabase RPC Optimization: Fix for Resource Exhaustion
-- ========================================================

-- 🔴 [첫 번째 조치] 함수 먼저 만들기 (1초 만에 완료됨)
-- 이 부분을 드래그(블록 지정)해서 먼저 RUN 해보세요!
-- 서버 자원 고갈(Compute/Egress Exhaustion)을 즉시 막아줍니다.
CREATE OR REPLACE FUNCTION public.get_product_sales_sum(p_store_id uuid, p_product_ids uuid[])
RETURNS TABLE(product_id uuid, total_quantity bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT oi.product_id, SUM(oi.quantity)::bigint AS total_quantity
    FROM public.order_items oi
    INNER JOIN public.orders o ON o.id = oi.order_id
    WHERE o.store_id = p_store_id
      AND oi.product_id = ANY(p_product_ids)
    GROUP BY oi.product_id;
END;
$$;


-- ========================================================

-- 🔴 [두 번째 조치] 인덱스 만들기 (수 분 소요 가능성 있음)
-- 함수 만들기가 성공했다면, 이제 아래 명령어 "두 줄"만 따로 드래그해서 RUN 하세요.
-- (도중에 타임아웃 에러가 나더라도 백그라운드에서 계속 만들어지니 안심하셔도 됩니다.)
-- 이 코드는 '오늘의 대화' 페이지 로딩 에러(데이터 불러오기 실패)를 해결합니다.
SET statement_timeout = 0;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_logs_store_created_at 
ON public.chat_logs(store_id, created_at DESC);

-- 1. 상품(Product)이 숨김 해제(is_hidden: false)될 때 연동된 주문도 복구하는 자동화 함수
CREATE OR REPLACE FUNCTION trg_unhide_orders_on_product_unhide()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if the product was just restored (is_hidden changed from TRUE to FALSE)
  IF OLD.is_hidden = TRUE AND NEW.is_hidden = FALSE THEN
    
    -- 해당 상품(NEW.id)이 포함되어 있는 모든 주문(Orders)을 찾아내어 숨김 해제 처리
    UPDATE public.orders
    SET is_hidden = false
    WHERE is_hidden = true
      AND id IN (
        SELECT order_id 
        FROM public.order_items 
        WHERE product_id = NEW.id
      );
      
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Products 테이블에 트리거 부착 (업데이트 시 작동)
DROP TRIGGER IF EXISTS trigger_unhide_orders_on_product_unhide ON public.products;
CREATE TRIGGER trigger_unhide_orders_on_product_unhide
AFTER UPDATE OF is_hidden ON public.products
FOR EACH ROW
EXECUTE FUNCTION trg_unhide_orders_on_product_unhide();

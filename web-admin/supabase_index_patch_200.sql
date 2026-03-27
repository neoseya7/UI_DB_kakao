-- ========================================================
-- Pro Tier (200 Stores) DB Optimization Patch
-- Run this in your Supabase SQL Editor
-- ========================================================

-- 1. Optimize Product Queries (Highly frequent by customers)
-- The public API queries products by store_id AND is_visible=true
CREATE INDEX IF NOT EXISTS idx_products_store_visible 
ON public.products(store_id, is_visible);

-- 2. Optimize Product Filtering by Date (Used heavily in client-side pills)
CREATE INDEX IF NOT EXISTS idx_products_target_date 
ON public.products(target_date);

CREATE INDEX IF NOT EXISTS idx_products_regular_sale 
ON public.products(is_regular_sale);

-- 3. Optimize Order Lookups
-- The public API searches orders by store_id and customer_nickname
CREATE INDEX IF NOT EXISTS idx_orders_store_nickname 
ON public.orders(store_id, customer_nickname);

-- 4. Optimize Chat Logs (Admin Dashboard heavy query)
CREATE INDEX IF NOT EXISTS idx_chat_logs_store_date 
ON public.chat_logs(store_id, collect_date);

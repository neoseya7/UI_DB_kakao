const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const sql = `
CREATE OR REPLACE FUNCTION get_matrix_orders(
    p_store_id uuid,
    p_pickup_date text DEFAULT NULL,
    p_start_date text DEFAULT NULL,
    p_end_date text DEFAULT NULL,
    p_sort_option text DEFAULT 'name_asc'
) 
RETURNS TABLE (
    id uuid,
    customer_nickname text,
    customer_memo_1 text,
    customer_memo_2 text,
    is_received boolean,
    pickup_date text,
    created_at timestamptz,
    items jsonb
) 
LANGUAGE plpgsql
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
        o.created_at,
        COALESCE(
             jsonb_agg(
                 jsonb_build_object(
                     'product_id', oi.product_id,
                     'quantity', oi.quantity
                 )
             ) FILTER (WHERE oi.id IS NOT NULL), 
             '[]'::jsonb
        ) as items
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id
    WHERE o.store_id = p_store_id
      AND o.is_hidden = false
      AND (
          (p_pickup_date IS NOT NULL AND o.pickup_date = p_pickup_date)
          OR (p_start_date IS NOT NULL AND p_end_date IS NOT NULL AND o.pickup_date >= p_start_date AND o.pickup_date <= p_end_date)
          OR (p_start_date IS NOT NULL AND p_end_date IS NULL AND o.pickup_date = p_start_date)
          OR (p_pickup_date IS NULL AND p_start_date IS NULL AND p_end_date IS NULL)
      )
    GROUP BY o.id
    ORDER BY 
        CASE WHEN p_sort_option = 'time_asc' THEN o.created_at END ASC,
        CASE WHEN p_sort_option = 'time_desc' THEN o.created_at END DESC,
        CASE WHEN p_sort_option = 'name_asc' THEN o.customer_nickname END ASC;
END;
$$;
`;
    // We cannot run raw DDL via supabase-js in v2 directly unless we use an existing rpc.
    // I will write this to a .sql file instead.
}
run();

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const store_id = '11d603af-ab54-4c2e-9043-319cccdd6b7a';
    const nickname = '고구마8130';

    const { data: orders, error: orderErr } = await supabase
        .from('orders')
        .select('id, pickup_date, customer_nickname, is_hidden, customer_memo_1, order_items(product_id, quantity, products(collect_name, target_date, is_hidden, is_regular_sale))')
        .eq('store_id', store_id)
        .eq('customer_nickname', nickname);

    console.log("Orders Err:", orderErr);
    console.log("Orders Data:", JSON.stringify(orders, null, 2));
}

check();

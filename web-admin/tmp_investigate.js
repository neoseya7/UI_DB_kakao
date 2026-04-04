require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    const store_id = '905bd030-bb28-4888-886a-5f39746ce049';
    console.log("=== Products ===");
    const { data: prods } = await supabase.from('products').select('id, collect_name, is_hidden, target_date').eq('store_id', store_id);
    console.log(prods);

    console.log("=== Orders ===");
    const { data: orders } = await supabase.from('orders').select('id, customer_nickname, pickup_date, is_hidden, created_at, customer_memo_1').eq('store_id', store_id).order('created_at', { ascending: false }).limit(20);
    console.log(orders);
})();

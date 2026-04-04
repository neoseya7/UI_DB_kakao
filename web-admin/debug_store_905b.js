require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    const store_id = '905bd030-bb28-4888-886a-5f39746ce049';
    
    console.log("=== RECENT CHAT LOGS ===");
    const { data: chatLogs, error: chatErr } = await supabase.from('chat_logs')
        .select('*')
        .eq('store_id', store_id)
        .order('created_at', { ascending: false })
        .limit(10);
        
    if (chatErr) console.log('Chat Error:', chatErr);
    else console.log(JSON.stringify(chatLogs.map(l => ({
        id: l.id,
        nickname: l.nickname,
        cat: l.category,
        product: l.product_name,
        qty: l.quantity,
        is_processed: l.is_processed,
        date: l.collect_date
    })), null, 2));

    console.log("\n=== RECENT ORDERS ===");
    const { data: orders, error: orderErr } = await supabase.from('orders')
        .select('id, pickup_date, customer_nickname, is_hidden, customer_memo_1, order_items(product_id, quantity, products(collect_name))')
        .eq('store_id', store_id)
        .order('created_at', { ascending: false })
        .limit(10);
        
    if (orderErr) console.log('Order Error:', orderErr);
    else console.log(JSON.stringify(orders, null, 2));

})();

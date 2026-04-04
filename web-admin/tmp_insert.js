const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    console.log("Inserting test order...");
    const { data: orderData, error } = await s.from('orders').insert({
        store_id: 'b8274cb6-33ee-4856-a660-152d51fdd14c',
        pickup_date: '2026-04-06',
        customer_nickname: 'TESTING',
        is_received: false,
        is_hidden: false,
        customer_memo_1: "AI 수집 TEST"
    }).select().single();
    
    console.log("Inserted Order:", orderData);
    if (error) console.error("Error:", error);
}
run();

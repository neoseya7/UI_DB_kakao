const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    console.log("Inserting order without explicitly setting is_hidden...");
    const { data: orderData, error } = await s.from('orders').insert({
        store_id: 'b8274cb6-33ee-4856-a660-152d51fdd14c',
        pickup_date: '2026-04-06',
        customer_nickname: 'TESTING_DEFAULT',
        is_received: false,
        customer_memo_1: "Checking Default"
    }).select().single();
    
    console.log("Inserted Order:", orderData);
    if (error) console.error("Error:", error);
}
run();

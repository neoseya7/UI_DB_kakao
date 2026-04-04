const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const output = {};
    
    // 1. Fetch orders for '최선' on '2026-04-06'
    const { data: o } = await s.from('orders').select('*, order_items(*, products(*))').eq('customer_nickname', '최선').eq('pickup_date', '2026-04-06');
    output.orders = o;

    // 2. Fetch chats for '최선'
    const { data: c } = await s.from('kakao_chats').select('*').ilike('sender', '%최선%');
    output.chats = c;

    fs.writeFileSync('result_check.json', JSON.stringify(output, null, 2), 'utf-8');
}
run();

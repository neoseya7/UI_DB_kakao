const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'e:/Project_my/UI_DB_kakao/web-admin/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data: stores } = await supabase.from('stores').select('id').limit(1);
    const storeId = stores[0].id;

    console.log("Testing insert into orders for store:", storeId);

    // Insert 1
    const { data: d1, error: e1 } = await supabase.from('orders').insert({
        store_id: storeId,
        pickup_date: '2026-03-31',
        customer_nickname: 'TestDup123',
        is_received: false,
    }).select().single();

    console.log("Insert 1:", e1 ? e1 : d1.id);

    // Insert 2 (Exact Duplicate)
    const { data: d2, error: e2 } = await supabase.from('orders').insert({
        store_id: storeId,
        pickup_date: '2026-03-31',
        customer_nickname: 'TestDup123',
        is_received: false,
    }).select().single();

    console.log("Insert 2:", e2 ? e2 : d2.id);

    if (e2 && Object.keys(e2).length === 0) {
        console.log("ERROR IS AN EMPTY OBJECT!");
    } else if (e2) {
        console.log("ERROR DETAILS:", e2);
    }
}

run();

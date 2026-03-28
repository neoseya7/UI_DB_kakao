const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'e:/Project_my/UI_DB_kakao/web-admin/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Testing insert with FAKE store_id to trigger FK violation...");

    const fakeId = "00000000-0000-0000-0000-000000000000";

    const { data: d1, error: e1 } = await supabase.from('orders').insert({
        store_id: fakeId,
        pickup_date: '2026-03-31',
        customer_nickname: 'FakeUser',
        is_received: false,
    }).select().single();

    console.log("Error object:", e1);
    console.log("Error message:", e1 ? e1.message : "None");
}

run();

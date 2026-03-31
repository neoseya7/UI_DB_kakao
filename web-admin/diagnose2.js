require('dotenv').config({path:'.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const store_id = '11d603af-ab54-4c2e-9043-319cccdd6b7a';

async function diagnose() {
    // 1. Get raw orders
    const { data: oData } = await supabase.from('orders').select('id, pickup_date').eq('store_id', store_id);
    const orderIds = oData.map(o => o.id);

    console.log(`Total DB orders: ${orderIds.length}`);

    // Simulate pickup/page.tsx logic
    let pickupItems = 0;
    const CHUNK_SIZE = 250;
    
    // Check if any chunk hits 1000 limit
    for (let i = 0; i < orderIds.length; i += CHUNK_SIZE) {
        const chunk = orderIds.slice(i, i + CHUNK_SIZE);
        const { data: c1 } = await supabase.from('order_items').select('id', {count: 'exact', head: true}).in('order_id', chunk);
        if (c1.length === 1000 || c1.count > 1000) {
            console.log(`WARNING: Chunk ${i} hit limit! Items count: ${c1.count}`);
        }
    }
}

diagnose();

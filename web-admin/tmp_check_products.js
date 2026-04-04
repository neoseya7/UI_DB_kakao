const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    try {
        const { data, error } = await s.rpc('get_matrix_orders', { 
            p_store_id: '11d603af-ab54-4c2e-9043-319cccdd6b7a', 
            p_pickup_date: '2026-04-06', 
            p_start_date: null, 
            p_end_date: null 
        });

        if (error) {
            console.log('RPC Error:', error);
            return;
        }

        const items = new Set();
        data.forEach(o => {
            if (o.items) o.items.forEach(oi => items.add(oi.product_id));
        });
        
        const itemIds = Array.from(items);
        console.log('orderedProductIds length:', itemIds.length);

        if (itemIds.length > 0) {
            const { data: pData, error: pError } = await s.from('products')
                .select('id, collect_name, is_hidden, target_date, is_regular_sale, store_id')
                .in('id', itemIds);
                
            if (pError) console.log('Products Error:', pError);
            else {
                for (const p of pData) {
                    console.log(`[${p.id}] ${p.collect_name} | hidden: ${p.is_hidden} | storeOK: ${p.store_id === '11d603af-ab54-4c2e-9043-319cccdd6b7a'} | date: ${p.target_date} | reg: ${p.is_regular_sale}`);
                }
            }
        }
    } catch(e) {
        console.error(e);
    }
}
run();

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data } = await s.rpc('get_matrix_orders', { 
        p_store_id: '11d603af-ab54-4c2e-9043-319cccdd6b7a', 
        p_pickup_date: '2026-04-06', 
        p_start_date: null, 
        p_end_date: null 
    });
    
    const items = new Set();
    data.forEach(o => {
        if (o.items) o.items.forEach(oi => items.add(oi.product_id));
    });
    
    const itemIds = Array.from(items);
    const strIdList = itemIds.join(',');
    
    const { data: pData } = await s.from('products')
        .select('id, collect_name, is_hidden, target_date')
        .eq('store_id', '11d603af-ab54-4c2e-9043-319cccdd6b7a')
        .eq('is_hidden', false)
        .or(`target_date.eq.2026-04-06,id.in.(${strIdList})`);
        
    const fetchedIds = new Set(pData.map(p => p.id));
    
    console.log('Products that SHOULD be fetched but were NOT:');
    let missCount = 0;
    const { data: doubleCheck } = await s.from('products').select('*').in('id', itemIds);
    
    doubleCheck.forEach(p => {
        if (!fetchedIds.has(p.id)) {
            missCount++;
            console.log('Why missed?', p.collect_name, '| is_hidden:', p.is_hidden, '| target_date:', p.target_date);
        }
    });
    console.log('Total missed:', missCount);
}
run();

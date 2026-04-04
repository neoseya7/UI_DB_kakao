const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const storeId = 'f075b2f6-5458-41b3-bb02-978b7a1145fc';
    const currentDate = '2026-04-06';

    const { data: rpcData } = await s.rpc('get_matrix_orders', {
        p_store_id: storeId,
        p_pickup_date: currentDate,
        p_start_date: null,
        p_end_date: null
    });
    
    let orders = rpcData || [];
    
    const orderedProductIds = new Set();
    orders.forEach(o => {
        if (o.items) o.items.forEach(oi => orderedProductIds.add(oi.product_id));
    });
    const strIdList = Array.from(orderedProductIds).join(',');

    let pQuery = s.from('products').select('*').eq('store_id', storeId).eq('is_hidden', false);
    if (strIdList.length > 0) {
        pQuery = pQuery.or(`target_date.eq.${currentDate},id.in.(${strIdList})`);
    } else {
        pQuery = pQuery.eq('target_date', currentDate);
    }
    
    const { data: pData } = await pQuery;
    
    const mappedProducts = (pData || []).map(p => ({
        id: p.id,
        name: p.collect_name
    }));

    const mappedCustomers = orders.map((o) => {
        const itemsArray = mappedProducts.map(p => {
            const match = o.items.find((oi) => oi.product_id === p.id);
            return match ? match.quantity : 0;
        });
        return {
            id: o.id,
            name: o.customer_nickname,
            items: itemsArray,
            totalQty: itemsArray.reduce((sum, q) => sum + q, 0)
        };
    });

    const hiddenCustomers = mappedCustomers.filter(c => c.totalQty === 0);
    const visibleCustomers = mappedCustomers.filter(c => c.totalQty > 0);

    console.log("MAPPED PRODUCTS:", mappedProducts.find(p => p.name.includes("떡볶이")));
    console.log("Customer 쮸8096:", mappedCustomers.find(c => c.name === "쮸8096"));
    console.log(`Total orders: ${orders.length}, Visible: ${visibleCustomers.length}, Hidden: ${hiddenCustomers.length}`);
}
run();

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const storeId = 'f075b2f6-5458-41b3-bb02-978b7a1145fc';
    const currentDate = '2026-04-06';

    let oQuery = s.from('orders').select('*').eq('store_id', storeId).eq('is_hidden', false).eq('pickup_date', currentDate);
    const { data: oData } = await oQuery.limit(2000).order('pickup_date', { ascending: false });
    let orders = oData || [];

    const orderIds = orders.map(o => o.id);
    let orderItems = [];
    const CHUNK_SIZE = 250;
    for (let i = 0; i < orderIds.length; i += CHUNK_SIZE) {
        const chunk = orderIds.slice(i, i + CHUNK_SIZE);
        const { data: chunkData } = await s.from('order_items').select('*').in('order_id', chunk);
        if (chunkData) orderItems = orderItems.concat(chunkData);
    }

    const itemsByOrderId = {};
    for (const item of orderItems) {
        if (!itemsByOrderId[item.order_id]) itemsByOrderId[item.order_id] = [];
        itemsByOrderId[item.order_id].push(item);
    }

    // `mappedProducts` logic in fallback
    const orderedProductIds = new Set();
    for (let chunkFilter = 0; chunkFilter < orders.length; chunkFilter += 100) {
        const chunkIds = orders.slice(chunkFilter, chunkFilter + 100).map((o) => o.id);
        const { data: itemData } = await s.from('order_items').select('product_id').in('order_id', chunkIds);
        if (itemData) itemData.forEach(oi => orderedProductIds.add(oi.product_id));
    }
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
        const myItems = itemsByOrderId[o.id] || [];
        const itemsArray = mappedProducts.map(p => {
            const match = myItems.find((oi) => oi.product_id === p.id);
            return match ? match.quantity : 0;
        });

        return {
            id: o.id,
            name: o.customer_nickname,
            items: itemsArray,
            totalQty: itemsArray.reduce((sum, q) => sum + q, 0)
        };
    });

    console.log("Customer 쮸8096:", mappedCustomers.find(c => c.name === "쮸8096"));
}
run();

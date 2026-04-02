import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function simulate() {
    const storeId = '11d603af-ab54-4c2e-9043-319cccdd6b7a';
    const currentDate = '2026-03-31';

    // 1. Fetch active products
    let pQuery = supabase.from('products').select('*').eq('store_id', storeId)
    pQuery = pQuery.or(`target_date.eq.${currentDate},is_regular_sale.eq.true`)
    const { data: pData } = await pQuery
    
    // 2. Fetch orders
    let oQuery = supabase.from('orders').select('*').eq('store_id', storeId).eq('is_hidden', false)
    oQuery = oQuery.eq('pickup_date', currentDate)
    const { data: orders } = await oQuery.limit(2000).order('pickup_date', { ascending: false })

    // 3. Fetch order items
    const orderIds = orders.map(o => o.id)
    let orderItems = []
    if (orderIds.length > 0) {
        const { data: chunkData } = await supabase.from('order_items').select('*').in('order_id', orderIds)
        orderItems = chunkData || []
    }

    // specific debug for 고구마8130
    const gogumaOrders = orders.filter(o => o.customer_nickname === '고구마8130');
    console.log("Goguma 3/31 Orders count:", gogumaOrders.length);
    
    gogumaOrders.forEach(o => {
       const myItems = orderItems.filter(oi => oi.order_id === o.id);
       console.log("Order ID:", o.id);
       console.log("Raw Order items for Goguma:", myItems);
       
       const mappedItems = pData.map(p => {
           const match = myItems.find(oi => oi.product_id === p.id);
           return { product: p.collect_name, qty: match ? match.quantity : 0 };
       });
       console.log("Mapped items against 3/31 Products:", mappedItems.filter(mi => mi.qty > 0));
    });

}
simulate();

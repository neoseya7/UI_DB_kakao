require('dotenv').config({path:'.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const store_id = '11d603af-ab54-4c2e-9043-319cccdd6b7a';

async function analyze() {
    // 1. Find product '곤드레나물'
    const { data: pData } = await supabase.from('products').select('*').eq('store_id', store_id).like('collect_name', '%곤드레나물%');
    console.log("Products found:", pData.map(p => ({id: p.id, name: p.collect_name, date: p.target_date, is_regular: p.is_regular_sale})));
    
    if (!pData || pData.length === 0) return console.log("No product found.");

    const prodId = pData[0].id;
    const targetDate = pData[0].target_date;

    // 2. Find all order items for this product
    const { data: orderItems } = await supabase.from('order_items').select('*, orders(id, pickup_date, store_id, customer_nickname)').eq('product_id', prodId);
    
    let totalQty = 0;
    let matchingDateQty = 0;
    let mismatchingDateQty = 0;
    const mismatchedDates = [];

    for (const oi of orderItems) {
        if (!oi.orders) continue; // orphaned item
        const q = oi.quantity;
        totalQty += q;
        
        if (oi.orders.pickup_date === targetDate || pData[0].is_regular_sale) {
            matchingDateQty += q;
        } else {
            mismatchingDateQty += q;
            mismatchedDates.push({ order_id: oi.orders.id, nick: oi.orders.customer_nickname, date: oi.orders.pickup_date, qty: q });
        }
    }

    console.log("-------------------");
    console.log(`Total Quantity (Raw): ${totalQty}`);
    console.log(`Quantity matching Target Date (${targetDate}): ${matchingDateQty}`);
    console.log(`Quantity with DIFFERENT Pickup Date: ${mismatchingDateQty}`);
    console.log("Mismatched Orders:", JSON.stringify(mismatchedDates, null, 2));

}

analyze();

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkStockAnomaly() {
  const storeId = "9018fcb3-897d-47f2-8396-1f4ddf5701c9";
  
  // 1. Find the Sweet Potato Product
  const { data: products } = await supabase.from('products')
    .select('id, collect_name, allocated_stock, created_at')
    .eq('store_id', storeId)
    .like('collect_name', '%고구마%');
    
  if (!products || products.length === 0) {
    console.log("No sweet potato product found.");
    return;
  }
  
  const sweetPotato = products[0];
  console.log(`Product: ${sweetPotato.collect_name} | Allocated: ${sweetPotato.allocated_stock} | ID: ${sweetPotato.id}`);

  // 2. Fetch all order items linked to this product ID
  const { data: orderItems, error } = await supabase.from('order_items')
    .select(`
      quantity,
      orders (
        id,
        created_at,
        customer_nickname,
        customer_memo_1
      )
    `)
    .eq('product_id', sweetPotato.id);
    
  if (error) {
    console.error("Order items error:", error);
    return;
  }

  // Flatten and sort by created_at ascending to construct a timeline
  const timeline = orderItems.filter(item => item.orders).map(item => ({
    qty: item.quantity,
    created_at: item.orders.created_at,
    nick: item.orders.customer_nickname,
    memo: item.orders.customer_memo_1
  })).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  console.log(`\nTimeline of ${timeline.length} valid orders:`);
  let runningSum = 0;
  for (const t of timeline) {
    runningSum += t.qty;
    console.log(`[${t.created_at}] Nick: ${t.nick.padEnd(10, ' ')} | Qty: ${t.qty} | Running Sum: ${runningSum} / ${sweetPotato.allocated_stock} | Note: ${t.memo}`);
  }
}

checkStockAnomaly();

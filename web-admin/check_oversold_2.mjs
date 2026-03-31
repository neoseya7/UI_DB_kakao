import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkStockAnomaly() {
  const storeId = "9018fcb3-897d-47f2-8396-1f4ddf5701c9";
  
  const { data: products } = await supabase.from('products')
    .select('id, collect_name, allocated_stock, created_at')
    .eq('store_id', storeId)
    .like('collect_name', '%고구마%');
    
  if (!products || products.length === 0) return;
  
  let out = "";
  for (const p of products) {
    out += `\n=================================\n`;
    out += `Product: ${p.collect_name} | Allocated: ${p.allocated_stock} | ID: ${p.id}\n`;

    const { data: orderItems, error } = await supabase.from('order_items')
      .select('quantity, orders(id, created_at, customer_nickname, customer_memo_1)')
      .eq('product_id', p.id);
      
    if (error) continue;

    const timeline = orderItems.filter(item => item.orders).map(item => ({
      qty: item.quantity,
      created_at: item.orders.created_at,
      nick: item.orders.customer_nickname,
      memo: item.orders.customer_memo_1
    })).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    out += `Timeline of ${timeline.length} valid orders:\n`;
    let runningSum = 0;
    for (const t of timeline) {
      runningSum += t.qty;
      out += `[${t.created_at}] Nick: ${t.nick.padEnd(10, ' ')} | Qty: ${t.qty} | Running Sum: ${runningSum} / ${p.allocated_stock} | Note: ${t.memo}\n`;
    }
  }
  
  fs.writeFileSync('oversold_logs_utf8.txt', out, 'utf-8');
}

checkStockAnomaly();

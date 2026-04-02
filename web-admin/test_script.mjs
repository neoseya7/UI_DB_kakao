import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const supabaseUrl = 'https://iultzlyrvsvrldyuvqhd.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1bHR6bHlydnN2cmxkeXV2cWhkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDQ5MDAwNywiZXhwIjoyMDkwMDY2MDA3fQ.aHPGAxVu8rUMlbO0aCafA_K-WAxbwfqhD7NIsMbNSzA'
const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  const storeId = 'a8d6fa4e-5e7f-44eb-9111-c6d06f8eebef'
  const currentDate = '2026-03-30'

  const { data: rpcData, error: rpcError } = await supabase.rpc('get_matrix_orders', {
      p_store_id: storeId,
      p_pickup_date: currentDate,
      p_start_date: null,
      p_end_date: null
  })

  const { data: ordersData } = await supabase.from('orders').select('*').eq('store_id', storeId).eq('is_hidden', false).eq('pickup_date', currentDate)
  const { data: productsData } = await supabase.from('products').select('*').eq('store_id', storeId).eq('is_hidden', false).or(`target_date.eq.${currentDate},is_regular_sale.eq.true`)
  
  const out = {
    rpcData: rpcData || [],
    ordersData: ordersData || [],
    productsData: productsData || []
  }

  fs.writeFileSync('out.json', JSON.stringify(out, null, 2))
}

async function deleteEmptyOrders() {
  console.log("=== STARTING CLEANUP OF EMPTY ORDERS ===");
  
  let from = 0;
  let hasMore = true;
  let idsToDelete = [];

  while (hasMore) {
     const { data: chunk, error } = await supabase.from('orders').select('id, order_items(id)').range(from, from + 999);
     if (error) { console.error("Error:", error); break; }
     if (!chunk || chunk.length === 0) break;
     
     for (const o of chunk) {
         if (!o.order_items || o.order_items.length === 0) {
             idsToDelete.push(o.id);
         }
     }
     from += 1000;
     if (chunk.length < 1000) hasMore = false;
  }

  console.log(`Found ${idsToDelete.length} empty orders with missing products.`);

  // Chunk deletion to avoid long request URI
  let deletedCount = 0;
  for(let i = 0; i < idsToDelete.length; i += 100) {
      const targetIds = idsToDelete.slice(i, i + 100);
      const { error } = await supabase.from('orders').delete().in('id', targetIds);
      if (error) {
          console.error("Delete chunk error:", error);
      } else {
          deletedCount += targetIds.length;
          console.log(`Deleted chunk. Total deleted so far: ${deletedCount}/${idsToDelete.length}`);
      }
  }

  console.log("=== CLEANUP FINISHED ===");
}
deleteEmptyOrders();

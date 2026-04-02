import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase credentials in .env.local")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runMigration() {
  let outputLog = "";
  const log = (msg) => { outputLog += msg + "\n"; console.log(msg); }
  
  log("=== STARTING RETROACTIVE ORDER SPLIT MIGRATION (ALL STORES) ===")
  const { data: stores, error: storesErr } = await supabase.from('stores').select('id');
  if (storesErr || !stores) {
      log("Failed to fetch stores: " + JSON.stringify(storesErr));
      process.exit(1);
  }
  log(`Found ${stores.length} stores. Analyzing starting now...`);

  const { data: productsData } = await supabase.from('products').select('id, target_date');
  const prodMap = new Map();
  if (productsData) {
     productsData.forEach(p => prodMap.set(p.id, p.target_date));
  }

  let totalSplitCount = 0;
  let totalDateFixCount = 0;

  for (let i = 0; i < stores.length; i++) {
    const store = stores[i];
    log(`[${i+1}/${stores.length}] Processing store: ${store.id}`);

    let fromIdx = 0;
    const step = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: chunk, error: fetchErr } = await supabase
          .from('orders')
          .select('*, order_items(*)')
          .eq('store_id', store.id)
          .range(fromIdx, fromIdx + step - 1);

      if (fetchErr) {
          log("Fetch error on store " + store.id + ": " + JSON.stringify(fetchErr));
          break;
      }

      if (!chunk || chunk.length === 0) break;

      for (const order of chunk) {
        const items = order.order_items || [];
        if (items.length === 0) continue;

        const firstItem = items[0];
        const resolvedFirstDate = prodMap.get(firstItem.product_id) || order.pickup_date; 
        
        if (order.pickup_date !== resolvedFirstDate) {
          await supabase.from('orders').update({ pickup_date: resolvedFirstDate }).eq('id', order.id);
          log(`  [DATE FIXED] Order ${order.id} date changed from ${order.pickup_date} to ${resolvedFirstDate}`);
          totalDateFixCount++;
        }

        if (items.length > 1) {
          log(`  [SPLITTING] Order ${order.id} has ${items.length} items. Splitting...`);
          totalSplitCount++;

          for (let j = 1; j < items.length; j++) {
            const item = items[j];
            const itemDate = prodMap.get(item.product_id) || order.pickup_date; 

            // 1. DUPLICATE ORDER
            const { data: newOrder, error: insErr } = await supabase.from('orders').insert({
              store_id: order.store_id,
              pickup_date: itemDate,
              customer_nickname: order.customer_nickname,
              is_received: order.is_received,
              customer_memo_1: order.customer_memo_1,
              customer_memo_2: order.customer_memo_2
            }).select().single();

            if (insErr) {
              log(`  Failed to insert split order: ${JSON.stringify(insErr)}`);
              continue;
            }

            // 2. MOVE ITEM TO NEW ORDER
            if (item.id) {
               const { error: mvErr } = await supabase.from('order_items').update({ order_id: newOrder.id }).eq('id', item.id);
               if (mvErr) log(`  Failed to move item by ID. error: ${JSON.stringify(mvErr)}`);
            }
          }
        }
      }

      fromIdx += step;
      if (chunk.length < step) hasMore = false;
    }
  }

  log("=== MIGRATION COMPLETE ===")
  log(`Total bundled orders split: ${totalSplitCount}`)
  log(`Total original order dates corrected: ${totalDateFixCount}`)
  fs.writeFileSync('mig_log.txt', outputLog);
}

runMigration().catch(e => console.log(e))

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const storeId = '11d603af-ab54-4c2e-9043-319cccdd6b7a';

async function run() {
  const logStream = fs.createWriteStream('debug_output.txt');
  function log(msg) {
    console.log(msg);
    logStream.write(msg + '\n');
  }

  log('--- Fetching Products ---');
  const { data: prod } = await supabase.from('products').select('*').eq('store_id', storeId).ilike('display_name', '%다라딸기%');
  const { data: prod2 } = await supabase.from('products').select('*').eq('store_id', storeId).ilike('collect_name', '%다라딸기%');
  const allProds = [...(prod||[]), ...(prod2||[])];
  log(JSON.stringify(allProds));

  if (allProds.length > 0) {
    const pId = allProds[0].id;
    log('\n--- Fetching Order Items ---');
    const { data: orderItems } = await supabase.from('order_items').select('*, orders(*)').eq('product_id', pId);
    log(JSON.stringify(orderItems, null, 2));

    const totalQty = orderItems.reduce((acc, item) => acc + item.quantity, 0);
    log('Total Quantity from order_items: ' + totalQty);

    log('\n--- Fetching Chat Logs ---');
    const { data: chats } = await supabase.from('chat_logs').select('id, nickname, product_name, quantity, created_at').eq('store_id', storeId).ilike('product_name', '%다라딸기%');
    const { data: chats2 } = await supabase.from('chat_logs').select('id, nickname, chat_content, created_at').eq('store_id', storeId).ilike('chat_content', '%다라딸기%');
    
    log('Parsed Product Name Matches:\n' + JSON.stringify(chats, null, 2));
    log('Raw Content Matches:\n' + JSON.stringify(chats2, null, 2));
  }
}
run();

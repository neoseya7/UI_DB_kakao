import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data: logs, error } = await supabase.from('chat_logs')
    .select('id, store_id, created_at, category, chat_content, product_name, quantity, classification')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error("Fetch error:", error);
    return;
  }

  let out = "";
  for (const log of logs) {
    out += `[${log.created_at}] [Store: ${log.store_id}] | Content: "${log.chat_content.replace(/\n| /g, '_')}" | Product: "${log.product_name}" | Qty: ${log.quantity} | Cat: ${log.category}\n`;
  }
  fs.writeFileSync('db_logs_utf8.txt', out, 'utf-8');
}

run();

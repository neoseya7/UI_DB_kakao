import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log("Fetching latest 10 chat logs to diagnose bundling...");
  
  const { data: logs, error } = await supabase.from('chat_logs')
    .select('id, created_at, category, chat_content, product_name, quantity, classification')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error("Fetch error:", error);
    return;
  }

  for (const log of logs) {
    console.log(`[${log.created_at}] | Content: "${log.chat_content.replace(/\n/g, ' ')}" | Product: "${log.product_name}" | Qty: ${log.quantity} | Cat: ${log.category}`);
  }
}

run();

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log("Starting Mass Migration V2...");
  
  // Fetch the last 2000 rows (should cover the last few months of orders)
  const { data: logs, error } = await supabase.from('chat_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(2000);

  if (error) {
    console.error("Fetch error:", error);
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (const log of logs) {
    if (!log.product_name) continue;
    if (log.category !== 'ORDER' && log.category !== 'UNKNOWN') continue; // Only process actual item logs

    let pName = log.product_name;

    // Simulate the Regex Shredder
    let combinedName = pName;
    combinedName = combinedName.replace(/\)\s+([^\s])/g, '), $1');
    combinedName = combinedName.replace(/(\d)\s+([가-힣a-zA-Z])/g, '$1, $2');

    // If the regex actually modified the string (meaning it found hidden spaces without commas)
    // OR if it already had a comma (legacy comma bundling)
    if (combinedName !== pName || pName.includes(',') || pName.includes('/') || pName.includes('+')) {
        
        // Let's completely format it
        const productsStr = combinedName.split(/[,+&/]/).map(s => s.trim()).filter(Boolean);
        
        // If it's literally just 1 item (e.g. "대저토마토" -> didn't split), skip
        if (productsStr.length <= 1) continue;

        console.log(`[TARGET FOUND] Initial: "${pName}" -> Shredded: ${productsStr.length} items`);
        
        // We need to delete the original bundled row and insert the N newly shredded rows!
        // Wait, deleting destroys the original ID. Let's just update the first row, and insert the rest!
        const parsedItems = [];
        for (let i = 0; i < productsStr.length; i++) {
            let rawName = productsStr[i];
            let itemQtyStr = log.quantity ? log.quantity.toString() : "1";
            
            const qtyMatch = rawName.match(/(.+?)(?:\((\d+)\))$/);
            if (qtyMatch) {
                rawName = qtyMatch[1].trim();
                itemQtyStr = qtyMatch[2];
            } else {
                const spaceNumMatch = rawName.match(/(.+?)\s*(\d{1,2})$/);
                if (spaceNumMatch) {
                    rawName = spaceNumMatch[1].trim();
                    itemQtyStr = spaceNumMatch[2];
                }
            }
            parsedItems.push({ product: rawName, qty: parseInt(itemQtyStr, 10) || 1 });
        }

        try {
            // Update the original row with the FIRST parsed item
            await supabase.from('chat_logs').update({
                product_name: parsedItems[0].product,
                quantity: parsedItems[0].qty
            }).eq('id', log.id);

            // Insert the remaining parsed items as NEW rows, inheriting the original timestamp and chat content
            for (let i = 1; i < parsedItems.length; i++) {
                await supabase.from('chat_logs').insert({
                    store_id: log.store_id,
                    nickname: log.nickname,
                    chat_content: log.chat_content,
                    chat_time: log.chat_time,
                    collect_date: log.collect_date,
                    category: log.category,
                    is_processed: log.is_processed,
                    classification: log.classification,
                    created_at: log.created_at, // Preserve original time!
                    product_name: parsedItems[i].product,
                    quantity: parsedItems[i].qty
                });
            }
            successCount++;
        } catch(err) {
            failCount++;
            console.error("Failed to split:", pName, err);
        }
    }
  }

  console.log(`Mass Migration Complete! Success: ${successCount}, Failed: ${failCount}`);
}

run();

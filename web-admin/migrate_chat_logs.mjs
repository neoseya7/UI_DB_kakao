import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceKey);

async function migrate() {
    console.log("Starting Migration...");
    
    // Fetch all logs containing a comma in product_name
    const { data: logs, error } = await supabase
        .from('chat_logs')
        .select('*')
        .like('product_name', '%,%');

    if (error) {
        console.error("Failed to fetch logs:", error);
        return;
    }

    console.log(`Found ${logs.length || 0} legacy batched logs.`);
    if (!logs || logs.length === 0) return;

    let successCount = 0;
    let failCount = 0;

    for (const log of logs) {
        try {
            const rawProducts = log.product_name.split(',').map(s => s.trim()).filter(Boolean);
            const inserts = [];

            for (const text of rawProducts) {
                let pName = text;
                let pQty = log.quantity || 1;

                // Match trailing numbers like (2) or (1)
                const qtyMatch = pName.match(/(.+?)(?:\((\d+)\))$/);
                if (qtyMatch) {
                    pName = qtyMatch[1].trim();
                    pQty = parseInt(qtyMatch[2], 10);
                }

                // Prepare cloned object without the old ID so it gets a fresh UUID
                const { id, ...baseLog } = log;
                
                inserts.push({
                    ...baseLog,
                    product_name: pName,
                    quantity: pQty
                });
            }

            if (inserts.length > 0) {
                // Insert the new distinct rows
                const { error: insertErr } = await supabase.from('chat_logs').insert(inserts);
                if (insertErr) throw insertErr;

                // Delete the old unified row
                const { error: delErr } = await supabase.from('chat_logs').delete().eq('id', log.id);
                if (delErr) throw delErr;

                successCount++;
            }
        } catch (err) {
            console.error(`Error migrating log ID ${log.id}:`, err.message || err);
            failCount++;
        }
    }

    console.log(`Migration Complete! Success: ${successCount}, Failed: ${failCount}`);
}

migrate();

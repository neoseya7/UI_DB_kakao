import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
    const storeId = "9018fcb3-897d-47f2-8396-1f4ddf5701c9";
    
    // Get today's date string YYYY-MM-DD
    const today = new Date().toISOString().split('T')[0];
    
    console.log(`Checking data for store ${storeId} on ${today} or recent...`);

    const { data: logs, error } = await supabase
        .from('chat_logs')
        .select('*')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) {
        console.error("Error fetching logs:", error);
        return;
    }

    console.log(`Found ${logs.length} recent logs.`);
    fs.writeFileSync('debug_logs.json', JSON.stringify(logs, null, 2));
    
    if (logs.length > 0) {
        logs.forEach((log, index) => {
            console.log(`[${index}] DB_ID: ${log.id}`);
            console.log(`   Created: ${log.created_at}`);
            console.log(`   Time: ${log.chat_time} | Nickname: ${log.nickname}`);
            console.log(`   Message: ${log.chat_content?.substring(0, 30)}...`);
            console.log(`   Classification: ${log.classification}`);
            console.log(`   Processed: ${log.is_processed} | Status: ${log.status}`);
            console.log('---');
        });
    }
}

checkData();

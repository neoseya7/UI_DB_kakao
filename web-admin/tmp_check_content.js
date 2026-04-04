require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    const store_id = 'f075b2f6-5458-41b3-bb02-978b7a1145fc';
    
    const { data: logs, error } = await supabase.from('chat_logs')
        .select('id, collect_date, chat_time, created_at, product_name, classification, chat_content')
        .eq('store_id', store_id)
        .order('created_at', { ascending: false })
        .limit(5);
        
    for (const log of logs) {
        console.log(`CollectDate: ${log.collect_date} | Product: ${log.product_name}`);
        console.log(`Content: ${log.chat_content}`);
        console.log("------------------------");
    }
})();

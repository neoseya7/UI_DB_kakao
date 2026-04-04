require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    const store_id = '70b20188-e039-450d-b8df-73d3b509ef66';
    
    const { data: logs, error } = await supabase.from('chat_logs')
        .select('id, collect_date, created_at, chat_content, product_name, classification')
        .eq('store_id', store_id)
        .order('created_at', { ascending: false })
        .limit(5);
        
    console.log("Recent Chat Logs:", logs);
})();

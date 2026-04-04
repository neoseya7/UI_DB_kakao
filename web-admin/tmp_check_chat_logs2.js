require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    const store_id = '70b20188-e039-450d-b8df-73d3b509ef66';
    
    const { data: logs, error } = await supabase.from('chat_logs')
        .select('id, collect_date, chat_time, created_at, product_name, classification')
        .eq('store_id', store_id)
        .order('created_at', { ascending: false })
        .limit(10);
        
    for (const log of logs) {
        let p_date = null;
        if (log.product_name) {
            const { data: p } = await supabase.from('products')
                .select('target_date')
                .eq('store_id', store_id)
                .eq('collect_name', log.product_name)
                .limit(1);
            if (p && p.length > 0) p_date = p[0].target_date;
        }
        console.log(`Log: ${log.created_at} | Product: ${log.product_name} | Target: ${p_date} | CollectDate: ${log.collect_date}`);
    }
})();

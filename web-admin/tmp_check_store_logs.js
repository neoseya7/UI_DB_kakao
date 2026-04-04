require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    const store_id = 'f075b2f6-5458-41b3-bb02-978b7a1145fc';
    
    const { data: logs, error } = await supabase.from('chat_logs')
        .select('id, collect_date, chat_time, created_at, product_name, classification, chat_content')
        .eq('store_id', store_id)
        .order('created_at', { ascending: false })
        .limit(10);
        
    if (error) {
        console.error("Error:", error);
        return;
    }

    console.log("=== Recent 10 Chat Logs ===");
    for (const log of logs) {
        let target_date = "N/A";
        if (log.product_name) {
            const { data: p } = await supabase.from('products')
                .select('target_date')
                .eq('store_id', store_id)
                .eq('collect_name', log.product_name)
                .limit(1);
            if (p && p.length > 0) target_date = p[0].target_date || "상시판매";
        }
        
        console.log(`- CreatedAt(생성일): ${log.created_at.substring(0,10)} | CollectDate(수집일): ${log.collect_date} | Product(상품): ${log.product_name} | TargetDate(수령일): ${target_date} | Msg: ${log.chat_content.substring(0,20)}`);
    }
})();

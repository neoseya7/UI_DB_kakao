const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({path: '.env.local'});
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    // We will directly interact with supabase to see if a trigger fires!
    const logId = 'test-trigger-id-' + Math.random().toString(36).substring(7);
    const store_id = 'f075b2f6-5458-41b3-bb02-978b7a1145fc';
    
    console.log("1. Inserting with 2026-04-03...");
    const { data: logData, error: logError } = await supabase.from('chat_logs').insert({
        store_id, nickname: "SystemTest", chat_content: "아이스크림 4월 7일 수령", 
        chat_time: "00:00:00", collect_date: "2026-04-03", category: 'UNKNOWN',
        product_name: "미니컵아이스크림", is_processed: false
    }).select().single();
    
    if (logError) {
        console.error("Insert error:", logError);
        return;
    }
    
    console.log("Inserted collect_date:", logData.collect_date);

    console.log("2. Updating is_processed=true and product_name (Simulating line 420)...");
    const { data: updatedData, error: upError } = await supabase.from('chat_logs').update({
        is_processed: true,
        product_name: "카카오설빙미니컵아이스크림", // A matched product
        collect_date: "2026-04-03" // we pass the same date!
    }).eq('id', logData.id).select().single();

    if (upError) {
        console.error("Update error:", upError);
    } else {
        console.log("Updated collect_date:", updatedData.collect_date);
    }

    // cleanup
    await supabase.from('chat_logs').delete().eq('id', logData.id);
})();

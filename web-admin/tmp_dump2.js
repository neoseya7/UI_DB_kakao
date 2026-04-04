const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const output = {};
    
    // 1. Fetch chats for 최선
    const { data: c } = await s.from('chat_logs')
        .select('*')
        .eq('store_id', 'b8274cb6-33ee-4856-a660-152d51fdd14c')
        .ilike('nickname', '%최선%')
        .order('created_at', { ascending: false });
    
    output.chats = c;

    fs.writeFileSync('result_check2.json', JSON.stringify(output, null, 2), 'utf-8');
}
run();

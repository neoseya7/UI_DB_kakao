require('dotenv').config({path:'.env.local'});
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data } = await supabase.from('chat_logs')
        .select('id, chat_content, product_name, quantity, created_at')
        .order('created_at', {ascending: false})
        .limit(10);
    fs.writeFileSync('recent_test_logs.json', JSON.stringify(data, null, 2));
}

run();

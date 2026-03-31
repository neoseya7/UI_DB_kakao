require('dotenv').config({path:'.env.local'});
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data } = await supabase.from('chat_logs')
        .select('*')
        .order('created_at', {ascending: false})
        .limit(20);
    fs.writeFileSync('last20.json', JSON.stringify(data, null, 2));
}
run();

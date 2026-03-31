require('dotenv').config({path:'.env.local'});
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data } = await supabase.from('super_admin_config').select('prompt_set_1').eq('id', 1).single();
    fs.writeFileSync('prompt.json', JSON.stringify(data, null, 2));
}

run();

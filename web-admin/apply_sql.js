require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data, error } = await supabase.rpc('execute_sql_query', { query: `ALTER TABLE products ADD COLUMN IF NOT EXISTS box_quantity numeric NULL;` });
    if (error) console.log("execute_sql_query error:", error.message);
    else console.log("execute_sql_query success:", data);
}
run();

require('dotenv').config({path:'.env.local'});
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const uid = 'a8d6fa4e-5e7f-44eb-9111-c6d06f8eebef';

async function run() {
    try {
        const { data: sets, error: err1 } = await supabase.from('store_settings').select('crm_tags').eq('store_id', uid).single();
        if(err1) throw err1;
        console.log('Settings fetched.');

        const { data: prods, error: err2 } = await supabase.from('products').select('*').eq('store_id', uid);
        if(err2) throw err2;
        console.log('Products fetched:', prods.length);

        const { data: logs, error: err3 } = await supabase.from('chat_logs')
            .select('*')
            .eq('store_id', uid)
            .order('created_at', { ascending: false })
            .limit(2000);
        if(err3) throw err3;
        console.log('Logs fetched:', logs.length);
        
    } catch(e) {
        console.error('THROWN ERROR:', e);
    }
}
run();

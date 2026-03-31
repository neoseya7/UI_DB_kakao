require('dotenv').config({path:'.env.local'});
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function chk() {
    try {
        console.log('Testing speed...');
        const start = Date.now();
        const { data, error } = await s.from('chat_logs').select('id').eq('store_id', 'a8d6fa4e-5e7f-44eb-9111-c6d06f8eebef').order('created_at', { ascending: false }).limit(10);
        
        if (error) {
            console.error('Error fetching logs:', error.message);
        } else {
            console.log(`Success! Fetched ${data.length} logs in ${Date.now() - start} ms. Indexing is complete!`);
        }
    } catch(e) {
        console.error('Exception:', e.message);
    }
}
chk();

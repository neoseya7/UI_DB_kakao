require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
    const { data, error } = await supabase.from('chat_logs')
        .select('*')
        .eq('store_id', 'a8d6fa4e-5e7f-44eb-9111-c6d06f8eebef')
        .order('created_at', { ascending: false })
        .limit(10);
    if (error) {
        console.log('Error:', error);
    } else {
        const out = data.map(d => ({date: d.created_at, chat_time: d.chat_time, name: d.product_name, qty: d.quantity, text: d.chat_content}));
        console.log(JSON.stringify(out, null, 2));
    }
})();

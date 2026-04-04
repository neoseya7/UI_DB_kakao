require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    const { data: cols } = await supabase.rpc('get_table_info', {table_name: 'orders'}); // just trying random things or we can fetch order schema directly
    // Let's just fetch the record
    const { data, error } = await supabase.from('orders')
        .select('*')
        .eq('store_id', '905bd030-bb28-4888-886a-5f39746ce049')
        .eq('is_hidden', true)
        .order('created_at', { ascending: false })
        .limit(1);
    console.log("Order:", data[0]);
})();

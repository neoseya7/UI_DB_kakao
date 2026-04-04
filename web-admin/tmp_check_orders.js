require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    const store_id = '70b20188-e039-450d-b8df-73d3b509ef66';
    
    const { data: orders, error } = await supabase.from('orders')
        .select('*')
        .eq('store_id', store_id)
        .eq('pickup_date', '2026-03-30');
        
    console.log(`Found ${orders?.length} orders for 2026-03-30.`);
    if (orders?.length > 0) {
        console.log(`First order is_hidden: ${orders[0].is_hidden}`);
    }
})();

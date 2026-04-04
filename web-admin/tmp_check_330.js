require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    const store_id = '70b20188-e039-450d-b8df-73d3b509ef66';
    
    // Check products on '2025-03-30' or like '03-30'
    const { data: products, error } = await supabase.from('products')
        .select('*')
        .eq('store_id', store_id)
        .like('target_date', '%03-30%')
    
    console.log("Products with 03-30 date:");
    products?.forEach(p => {
        console.log(`- ID: ${p.id}, TargetDate: ${p.target_date}, Name: ${p.display_name}, is_hidden: ${p.is_hidden}, is_visible: ${p.is_visible}`);
    });
})();

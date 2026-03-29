require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function check() {
    console.log("Checking Supabase DB...");
    const { data: stores, error: sErr } = await supabase.from('stores').select('id, name').limit(1);
    if (!stores || !stores.length) return console.log("No stores found.", sErr);
    const storeId = stores[0].id;
    console.log("Store:", stores[0].name);

    const { data: settings } = await supabase.from('store_settings').select('show_stock_badge, badge_stock_level').eq('store_id', storeId).single();
    console.log("Settings:", settings);

    const { data: products } = await supabase.from('products').select('name, display_name, allocated_stock, is_stocked').eq('store_id', storeId).limit(5);
    console.log("Products Sample:");
    console.table(products);
}

check();

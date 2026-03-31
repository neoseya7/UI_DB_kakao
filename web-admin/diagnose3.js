require('dotenv').config({path:'.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const store_id = '11d603af-ab54-4c2e-9043-319cccdd6b7a';

async function diagnose() {
    console.log("Fetching orders count...");
    const { count, error } = await supabase.from('orders').select('*', {count: 'exact', head: true}).eq('store_id', store_id);
    if(error) { console.error(error); return; }
    
    console.log(`Total DB orders: ${count}`);
    
    // Also fetch ALL orders
    const { data: oData } = await supabase.from('orders').select('id, pickup_date').eq('store_id', store_id);
    
    const { data: oDataL } = await supabase.from('orders').select('id, pickup_date').eq('store_id', store_id).limit(3000).order('pickup_date', { ascending: false });
    console.log(`Limit(3000) orders retrieved: ${oDataL ? oDataL.length : 0}`);
}

diagnose();

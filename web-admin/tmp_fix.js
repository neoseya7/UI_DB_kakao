require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    const store_id = '905bd030-bb28-4888-886a-5f39746ce049';
    console.log("Fixing orders...");
    const { data: updatedOrders, error: updateErr } = await supabase
        .from('orders')
        .update({ is_hidden: false })
        .eq('store_id', store_id)
        .eq('pickup_date', '2026-04-07')
        .eq('is_hidden', true)
        .select();

    if (updateErr) {
        console.error("Error updating orders:", updateErr);
    } else {
        console.log(`Successfully unhidden ${updatedOrders.length} orders!`);
    }
})();

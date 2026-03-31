require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
    const { data: config } = await supabase.from('super_admin_config').select('prompt_set_1').eq('id', 1).single();
    if (config) {
        const parsed = JSON.parse(config.prompt_set_1);
        console.log("PROMPT B:", parsed.gemini_b);
    }
})();

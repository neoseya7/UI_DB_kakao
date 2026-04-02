import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkConfig() {
    const { data: config } = await supabase.from('super_admin_config').select('*').eq('id', 1).single();
    if (!config) {
        console.log("No super_admin_config found!");
    } else {
        console.log("Gemini Key:", config.gemini_api_key ? "EXISTS" : "MISSING");
        console.log("Prompt 1:", config.prompt_set_1 ? "EXISTS" : "MISSING");
        if (config.prompt_set_1) {
             const parsed = typeof config.prompt_set_1 === 'string' ? JSON.parse(config.prompt_set_1) : config.prompt_set_1;
             console.log("Parsed Prompt A length:", parsed.gemini_a ? parsed.gemini_a.length : 0);
        }
    }
}

checkConfig();

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({path: '.env.local'});
const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    try {
        const userId = 'f075b2f6-5458-41b3-bb02-978b7a1145fc';
        const { data: user, error: userErr } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (userErr || !user) throw new Error("Could not find user.");
        console.log("Found email:", user.user.email);
        
        const { data, error } = await supabaseAdmin.auth.admin.generateLink({
            type: 'magiclink',
            email: user.user.email,
        });
        if (error) throw new Error(error.message);
        
        // This generates the raw Vercel link
        console.log("\nRAW GENERATED LINK (Vercel):");
        console.log(data.properties.action_link);
        
        console.log("\nLOCAL LINK TO COPY & PASTE IN BROWSER:");
        const localLink = data.properties.action_link.replace(/https:\/\/ui-db-kakao\.vercel\.app/gi, 'http://localhost:3000');
        console.log(localLink);
        
    } catch (e) {
        console.error("Error:", e);
    }
})();

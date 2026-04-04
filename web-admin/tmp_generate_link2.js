const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({path: '.env.local'});
const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    try {
        const userId = 'f075b2f6-5458-41b3-bb02-978b7a1145fc';
        const { data: user } = await supabaseAdmin.auth.admin.getUserById(userId);
        const { data } = await supabaseAdmin.auth.admin.generateLink({
            type: 'magiclink',
            email: user.user.email,
        });
        const localLink = data.properties.action_link.replace(/https:\/\/ui-db-kakao\.vercel\.app/gi, 'http://localhost:3000');
        fs.writeFileSync('clean_link.txt', localLink.trim(), 'utf8');
        console.log("Done");
    } catch (e) {
        console.error("Error:", e);
    }
})();

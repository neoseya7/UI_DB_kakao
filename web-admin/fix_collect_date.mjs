import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fixCollectDates() {
    console.log("Starting data restoration script for collect_date...");
    let hasMore = true;
    let page = 0;
    const pageSize = 1000;
    let totalCorrupted = 0;
    let totalUpdated = 0;

    // Use a very specific date boundary where we know the bug could have been introduced
    while (hasMore) {
        const { data, error } = await supabase
            .from('chat_logs')
            .select('id, collect_date, created_at')
            .gte('created_at', '2026-03-25T00:00:00Z')
            .order('created_at', { ascending: false })
            .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) {
            console.error("Error fetching rows:", error);
            break;
        }

        if (!data || data.length === 0) {
            hasMore = false;
            break;
        }

        const toUpdate = [];
        data.forEach(row => {
            // DB Time (UTC) -> KST Time
            const cDate = new Date(row.created_at);
            const kstDate = new Date(cDate.getTime() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
            
            // The bug only pushes collect_date into the FUTURE relative to actual KST created_at date.
            if (row.collect_date > kstDate) {
                toUpdate.push({
                    id: row.id,
                    collect_date: kstDate
                });
            }
        });

        console.log(`Checked page ${page + 1} (${data.length} logs), found ${toUpdate.length} corrupted rows...`);

        // Update sequentially to avoid hitting rate limits
        for (const updateObj of toUpdate) {
            const { error: upErr } = await supabase
                .from('chat_logs')
                .update({ collect_date: updateObj.collect_date })
                .eq('id', updateObj.id);
                
            if (upErr) {
                console.error(`Failed to update ${updateObj.id}:`, upErr);
            } else {
                totalUpdated++;
            }
        }
        
        totalCorrupted += toUpdate.length;
        page++;
    }

    console.log(`\n✅ Data Restoration Complete!`);
    console.log(`Found ${totalCorrupted} affected rows.`);
    console.log(`Successfully reverted ${totalUpdated} rows back to their original chat dates.`);
}

fixCollectDates();

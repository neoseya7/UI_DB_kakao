import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Vercel Cron Secret Protection (Optional but highly recommended)
// Expects: 'Authorization: Bearer CRON_SECRET' header from Vercel

export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceKey) {
            throw new Error('Missing Supabase Environment Variables');
        }

        // Must use Service Role Key to bypass RLS and delete across ALL stores globally
        const supabase = createClient(supabaseUrl, serviceKey);

        // Calculate the timestamp for precisely 90 days ago
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const thresholdISO = ninetyDaysAgo.toISOString();

        console.log(`[Cron Cleanup] Commencing hard-delete purge for data older than: ${thresholdISO}`);

        // 1. Delete old 1-on-1 Chat Logs (Garbage Collection)
        const { error: chatErr } = await supabase
            .from('chat_logs')
            .delete()
            .lt('created_at', thresholdISO);

        if (chatErr) throw new Error(`Chat Logs Delete Error: ${chatErr.message}`);

        // 2. Delete old Orders (This will CASCADE delete 'order_items')
        // Use 'pickup_date' for business logic correctness (or 'created_at' if fallback)
        // Since pickup_date is a DATE type string YYYY-MM-DD
        const thresholdDateStr = thresholdISO.split('T')[0];
        const { error: orderErr } = await supabase
            .from('orders')
            .delete()
            .lt('pickup_date', thresholdDateStr);

        if (orderErr) throw new Error(`Orders Delete Error: ${orderErr.message}`);

        // 3. Hard-delete archived Products (is_hidden = true) that are over 90 days old
        // Deleting products might cascade into order_items if we didn't already prune the orders!
        const { error: productErr } = await supabase
            .from('products')
            .delete()
            .eq('is_hidden', true)
            .lt('created_at', thresholdISO);

        if (productErr) throw new Error(`Products Delete Error: ${productErr.message}`);

        console.log(`[Cron Cleanup] Purge cycle completed successfully.`);
        
        return NextResponse.json({ 
            success: true, 
            message: 'Historical data older than 90 days successfully burned.',
            threshold: thresholdISO 
        });

    } catch (err: any) {
        console.error('[Cron Cleanup] Fatal Execution Error:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}

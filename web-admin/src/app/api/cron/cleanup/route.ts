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
        // pickup_date='1900-01-01'은 상시판매 주문의 sentinel 값이므로 삭제 제외
        const { error: orderErr } = await supabase
            .from('orders')
            .delete()
            .lt('pickup_date', thresholdDateStr)
            .neq('pickup_date', '1900-01-01');

        if (orderErr) throw new Error(`Orders Delete Error: ${orderErr.message}`);

        // 3. Hard-delete archived Products (is_hidden = true) that are over 90 days old
        // 페이지네이션 헬퍼 (Supabase 기본 1000행 제한 우회)
        const fetchAll = async (query: any) => {
            const PAGE = 1000;
            let all: any[] = [];
            let from = 0;
            while (true) {
                const { data } = await query.range(from, from + PAGE - 1);
                if (!data || data.length === 0) break;
                all = all.concat(data);
                if (data.length < PAGE) break;
                from += PAGE;
            }
            return all;
        };

        const extractPath = (url: string) => {
            const marker = '/object/public/product-images/';
            const idx = url.indexOf(marker);
            if (idx !== -1) return url.substring(idx + marker.length);
            return null;
        };

        // 3a. 삭제 대상 상품의 이미지를 먼저 Storage에서 제거
        const productsToDelete = await fetchAll(
            supabase.from('products').select('image_url, image_urls').eq('is_hidden', true).lt('created_at', thresholdISO)
        );

        if (productsToDelete.length > 0) {
            const storagePaths: string[] = [];
            for (const p of productsToDelete) {
                if (p.image_url) {
                    const path = extractPath(p.image_url);
                    if (path) storagePaths.push(path);
                }
                if (p.image_urls && Array.isArray(p.image_urls)) {
                    for (const url of p.image_urls) {
                        const path = extractPath(url);
                        if (path) storagePaths.push(path);
                    }
                }
            }
            // 활성 상품이 사용 중인 이미지 제외
            const activeProducts = await fetchAll(
                supabase.from('products').select('image_url, image_urls').eq('is_hidden', false)
            );
            const activePaths = new Set<string>();
            for (const p of activeProducts) {
                if (p.image_url) { const path = extractPath(p.image_url); if (path) activePaths.add(path); }
                if (p.image_urls && Array.isArray(p.image_urls)) {
                    for (const url of p.image_urls) { const path = extractPath(url); if (path) activePaths.add(path); }
                }
            }

            const uniquePaths = [...new Set(storagePaths)].filter(p => !activePaths.has(p));
            for (let i = 0; i < uniquePaths.length; i += 1000) {
                const batch = uniquePaths.slice(i, i + 1000);
                const { error: storageErr } = await supabase.storage.from('product-images').remove(batch);
                if (storageErr) console.error(`[Cron Cleanup] Storage delete error (batch ${i}):`, storageErr.message);
            }
            console.log(`[Cron Cleanup] Removed ${uniquePaths.length} image(s) from Storage.`);
        }

        // 3b. 상품 레코드 삭제
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

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 60; // Cache this route's response for 60 seconds at Vercel Edge

export async function GET(request: Request, context: { params: Promise<{ store_id: string }> }) {
    try {
        const { store_id: storeId } = await context.params

        if (!storeId) {
            return NextResponse.json({ success: false, error: 'Store ID is required' }, { status: 400 })
        }

        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!serviceKey) {
            return NextResponse.json({ success: false, error: 'Server misconfiguration: Service Role Key missing' }, { status: 500 })
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        
        // Use service role key to bypass RLS for public read-only access safely
        const supabaseAdmin = createClient(supabaseUrl, serviceKey)

        // 1. Fetch Store Information
        const { data: storeData, error: storeError } = await supabaseAdmin
            .from('stores')
            .select('id, name, status')
            .eq('id', storeId)
            .single()

        if (storeError || !storeData) {
            return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 })
        }

        if (storeData.status !== 'active' && storeData.status !== 'pending') {
            return NextResponse.json({ success: false, error: 'Store is not active' }, { status: 403 })
        }

        // 2. Fetch Store Settings
        const { data: settingsData, error: settingsError } = await supabaseAdmin
            .from('store_settings')
            .select('*')
            .eq('store_id', storeId)
            .single()

        // 3. Fetch Visible Products only
        const { data: productsData, error: productsError } = await supabaseAdmin
            .from('products')
            .select('id, collect_name, display_name, price, tiered_prices, allocated_stock, target_date, is_regular_sale, deadline_date, deadline_time, image_urls, image_url, description, is_stocked')
            .eq('store_id', storeId)
            .eq('is_visible', true)
            .eq('is_hidden', false)
            .order('created_at', { ascending: false })

        // 4. Dynamically compute 'Remaining Stock' by aggregating historical order items using native RPC
        if (productsData && productsData.length > 0) {
            const productIds = productsData.map(p => p.id);
            
            const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc('get_product_sales_sum', {
                p_store_id: storeId,
                p_product_ids: productIds
            });

            const qtyMap: Record<string, number> = {};
            if (rpcData && !rpcErr) {
                for (const item of rpcData) {
                    qtyMap[item.product_id] = parseInt(item.total_quantity, 10) || 0;
                }
            } else if (rpcErr) {
                console.error("RPC Error in public route:", rpcErr);
            }

            for (const p of productsData) {
                if (p.allocated_stock !== null) {
                    const orderedQty = qtyMap[p.id] || 0;
                    p.allocated_stock = Math.max(0, p.allocated_stock - orderedQty);
                }
            }
        }

        return NextResponse.json({
            success: true,
            store: storeData,
            settings: settingsData || {},
            products: productsData || []
        }, {
            headers: {
                'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
            }
        })

    } catch (e: any) {
        console.error("Public store route error:", e)
        return NextResponse.json({ success: false, error: 'Server Error' }, { status: 500 })
    }
}

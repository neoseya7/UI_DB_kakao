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
            .select('id, collect_name, display_name, price, allocated_stock, target_date, is_regular_sale, deadline_date, deadline_time, image_urls, image_url, description, is_stocked')
            .eq('store_id', storeId)
            .eq('is_visible', true)
            .order('created_at', { ascending: false })

        return NextResponse.json({
            success: true,
            store: storeData,
            settings: settingsData || {},
            products: productsData || []
        })

    } catch (e: any) {
        console.error("Public store route error:", e)
        return NextResponse.json({ success: false, error: 'Server Error' }, { status: 500 })
    }
}

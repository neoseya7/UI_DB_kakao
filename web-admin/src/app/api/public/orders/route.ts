import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
    try {
        const payload = await request.json()
        const { store_id, nickname } = payload

        if (!store_id || !nickname || nickname.trim() === '') {
            return NextResponse.json({ success: false, error: 'Store ID and Nickname are required' }, { status: 400 })
        }

        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!serviceKey) {
            return NextResponse.json({ success: false, error: 'Server misconfiguration: Service Role Key missing' }, { status: 500 })
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const supabaseAdmin = createClient(supabaseUrl, serviceKey)

        // Find orders by customer_nickname
        // Need to join with order_items and products
        const { data: orders, error: ordersError } = await supabaseAdmin
            .from('orders')
            .select(`
                id,
                pickup_date,
                customer_nickname,
                is_received,
                created_at,
                order_items (
                    id,
                    quantity,
                    product:products (
                        id,
                        collect_name,
                        display_name,
                        price,
                        image_url,
                        image_urls,
                        is_stocked
                    )
                )
            `)
            .eq('store_id', store_id)
            .ilike('customer_nickname', `%${nickname.trim()}%`)
            .eq('is_received', false)
            .eq('is_hidden', false)
            .order('pickup_date', { ascending: false })
            .limit(10) // Limit to most recent 10 orders for safety

        if (ordersError) {
            console.error("Order fetch error:", ordersError)
            return NextResponse.json({ success: false, error: 'Failed to find orders' }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            orders: orders || []
        })

    } catch (e: any) {
        console.error("Public order lookup route error:", e)
        return NextResponse.json({ success: false, error: 'Server Error' }, { status: 500 })
    }
}

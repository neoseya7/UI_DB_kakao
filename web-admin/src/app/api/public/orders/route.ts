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
                        is_stocked,
                        is_hidden
                    )
                )
            `)
            .eq('store_id', store_id)
            .ilike('customer_nickname', `%${nickname.trim()}%`)
            .eq('is_received', false)
            .eq('is_hidden', false)
            .order('pickup_date', { ascending: false })

        if (ordersError) {
            console.error("Order fetch error:", ordersError)
            return NextResponse.json({ success: false, error: 'Failed to find orders' }, { status: 500 })
        }

        // Filter out hidden products, and then filter out orders that become empty
        const filteredOrders = (orders || []).map(order => {
            const visibleItems = order.order_items?.filter((item: any) => item.product && item.product.is_hidden === false) || [];
            return {
                ...order,
                order_items: visibleItems
            };
        }).filter(order => order.order_items.length > 0);

        return NextResponse.json({
            success: true,
            orders: filteredOrders
        })

    } catch (e: any) {
        console.error("Public order lookup route error:", e)
        return NextResponse.json({ success: false, error: 'Server Error' }, { status: 500 })
    }
}

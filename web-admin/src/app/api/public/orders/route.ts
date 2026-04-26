import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
    try {
        const payload = await request.json()
        const { store_id, nickname } = payload

        if (!store_id || !nickname || nickname.trim() === '') {
            return NextResponse.json({ success: false, error: 'Store ID and Nickname are required' }, { status: 400 })
        }

        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        if (!UUID_RE.test(store_id)) {
            return NextResponse.json({ success: false, error: '매장 주소가 올바르지 않습니다.' }, { status: 400 })
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
            .order('pickup_date', { ascending: true })

        if (ordersError) {
            console.error("Order fetch error:", ordersError)
            return NextResponse.json({ success: false, error: 'Failed to find orders' }, { status: 500 })
        }

        // 옵션A: 운영자가 hidden 처리한 상품(=삭제 의도)은 고객 검색에서도 가린다.
        // - product null(완전 삭제) 또는 product.is_hidden=true인 item은 결과에서 제외.
        // - 모든 item이 제외되면 주문 자체가 결과에서 사라짐(아래 length>0 필터).
        const filteredOrders = (orders || []).map(order => {
            const visibleItems = order.order_items?.filter((item: any) => item.product && !item.product.is_hidden) || [];
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

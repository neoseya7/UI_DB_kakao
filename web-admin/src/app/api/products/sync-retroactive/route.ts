import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
    try {
        const payload = await request.json()
        const { store_id, product_id, product_name, target_date } = payload

        if (!store_id || !product_id || !product_name) {
            return NextResponse.json({ success: false, error: 'Missing parameters' }, { status: 400 })
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
        const supabase = createClient(supabaseUrl, serviceKey)

        // Date calculation: strict 2 days timeframe as requested by the Store Manager
        const twoDaysAgo = new Date()
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)

        // Fetch logs matching the new product name over the past 48 hours
        const { data: logs, error: logsError } = await supabase.from('chat_logs')
            .select('*')
            .eq('store_id', store_id)
            .gte('created_at', twoDaysAgo.toISOString())
            .like('product_name', `%${product_name}%`)
            .eq('is_processed', true);

        if (logsError) throw new Error("Failed to fetch logs: " + logsError.message)
        if (!logs || logs.length === 0) return NextResponse.json({ success: true, synced: 0 })

        let syncCount = 0

        for (const log of logs) {
            // Find specific quantity geometrically nested inside the log string "(상품명(수량))"
            let qty = 1;
            const items = log.product_name.split(", ")
            for (const itemText of items) {
                const qtyMatch = itemText.match(/(.+?)(?:\((\d+)\))$/)
                const rawName = qtyMatch ? qtyMatch[1].trim() : itemText.trim()
                if (rawName === product_name) {
                    if (qtyMatch) qty = parseInt(qtyMatch[2], 10)
                    break
                }
            }

            // Order lookup mechanism
            const orderDate = target_date || log.collect_date || new Date().toISOString().split('T')[0]
            
            const { data: orders } = await supabase.from('orders')
                .select('id')
                .eq('store_id', store_id)
                .eq('pickup_date', orderDate)
                .eq('customer_nickname', log.nickname)
                .limit(1)

            let orderId = orders?.[0]?.id

            if (!orderId) {
                // Retroactively generate missing order wrapper if missing completely
                const { data: newOrder } = await supabase.from('orders').insert({
                    store_id,
                    pickup_date: orderDate,
                    customer_nickname: log.nickname,
                    is_received: false,
                    customer_memo_1: "자동 처리 동기화 (사후등록)"
                }).select().single()

                if (newOrder) orderId = newOrder.id
            }

            if (orderId) {
                // Verify order_item absence to preempt duplicates
                const { data: existingItems } = await supabase.from('order_items')
                    .select('id')
                    .eq('order_id', orderId)
                    .eq('product_id', product_id)

                if (!existingItems || existingItems.length === 0) {
                    await supabase.from('order_items').insert({
                        order_id: orderId,
                        product_id: product_id,
                        quantity: qty
                    })
                    syncCount++
                }
            }
        }

        return NextResponse.json({ success: true, synced: syncCount })

    } catch (e: any) {
        console.error("sync-retroactive error:", e)
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}

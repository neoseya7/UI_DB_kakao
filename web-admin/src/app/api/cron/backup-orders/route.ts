import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function GET(request: Request) {
    // Verify cron secret
    const authHeader = request.headers.get('Authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    if (!supabaseUrl || !serviceKey) {
        return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, serviceKey)

    try {
        // 1. Get Google API key
        const { data: config } = await supabase.from('super_admin_config').select('gemini_api_key').eq('id', 1).single()
        const apiKey = config?.gemini_api_key
        if (!apiKey) {
            return NextResponse.json({ error: 'Google API key not configured' }, { status: 500 })
        }

        // 2. Get all stores with backup_spreadsheet_id
        const { data: storeSettings } = await supabase
            .from('store_settings')
            .select('store_id, backup_spreadsheet_id')
            .not('backup_spreadsheet_id', 'is', null)

        if (!storeSettings || storeSettings.length === 0) {
            return NextResponse.json({ success: true, message: 'No stores with backup configured' })
        }

        // 3. Get store names
        const storeIds = storeSettings.map(s => s.store_id)
        const { data: stores } = await supabase
            .from('stores')
            .select('id, name')
            .in('id', storeIds)

        const storeNameMap: Record<string, string> = {}
        stores?.forEach(s => { storeNameMap[s.id] = s.name })

        // 4. Calculate 7 days ago
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
        const sinceDate = sevenDaysAgo.toISOString().split('T')[0]

        const results: { store: string; status: string }[] = []

        // 5. Process each store
        for (const setting of storeSettings) {
            const { store_id, backup_spreadsheet_id } = setting
            const storeName = storeNameMap[store_id] || store_id

            try {
                // Fetch orders with items for last 7 days
                const { data: orders } = await supabase
                    .from('orders')
                    .select('pickup_date, customer_nickname, customer_memo_1, created_at, order_items(quantity, product_id)')
                    .eq('store_id', store_id)
                    .eq('is_hidden', false)
                    .gte('pickup_date', sinceDate)
                    .order('pickup_date', { ascending: false })

                if (!orders || orders.length === 0) {
                    results.push({ store: storeName, status: 'no_orders' })
                    continue
                }

                // Get product names
                const productIds = [...new Set(orders.flatMap(o => o.order_items?.map((oi: any) => oi.product_id) || []))]
                const { data: products } = await supabase
                    .from('products')
                    .select('id, display_name, collect_name')
                    .in('id', productIds)

                const productNameMap: Record<string, string> = {}
                products?.forEach(p => { productNameMap[p.id] = p.display_name || p.collect_name || '(상품명 없음)' })

                // Build rows: header + data
                const rows: string[][] = [['날짜', '닉네임', '상품명', '수량', '비고']]

                for (const order of orders) {
                    if (!order.order_items || order.order_items.length === 0) continue
                    for (const item of order.order_items as any[]) {
                        rows.push([
                            order.pickup_date || '',
                            order.customer_nickname || '',
                            productNameMap[item.product_id] || '(미등록)',
                            String(item.quantity || 0),
                            order.customer_memo_1 || ''
                        ])
                    }
                }

                // Clear sheet and write data
                // First, clear the sheet
                const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${backup_spreadsheet_id}/values/Sheet1?key=${apiKey}`
                await fetch(clearUrl, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        range: 'Sheet1',
                        majorDimension: 'ROWS',
                        values: [[]] // empty to clear
                    })
                })

                // Clear entire sheet using batch clear
                const batchClearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${backup_spreadsheet_id}/values:batchClear?key=${apiKey}`
                await fetch(batchClearUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ranges: ['Sheet1'] })
                })

                // Write all data
                const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${backup_spreadsheet_id}/values/Sheet1!A1?valueInputOption=RAW&key=${apiKey}`
                const writeRes = await fetch(writeUrl, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        range: `Sheet1!A1:E${rows.length}`,
                        majorDimension: 'ROWS',
                        values: rows
                    })
                })

                if (writeRes.ok) {
                    results.push({ store: storeName, status: `ok (${rows.length - 1} rows)` })
                } else {
                    const err = await writeRes.text()
                    results.push({ store: storeName, status: `write_error: ${err.slice(0, 100)}` })
                }

            } catch (err: any) {
                results.push({ store: storeName, status: `error: ${err.message}` })
            }
        }

        return NextResponse.json({ success: true, results })

    } catch (e: any) {
        console.error("Backup cron error:", e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}

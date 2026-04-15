import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// 검색어 없을 때 반환할 최대 수 (검색어 있으면 MAX_RESULTS까지)
const MAX_RESULTS = 200

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const callerStoreId = searchParams.get('store_id')
        const q = (searchParams.get('q') || '').trim()

        if (!callerStoreId) {
            return NextResponse.json({ success: false, error: 'Missing store_id parameter' }, { status: 400 })
        }

        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!serviceKey) return NextResponse.json({ success: false, error: 'Server misconfiguration' }, { status: 500 })

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        })

        // 1. stores_meta에서 호출자 brand_name 조회 (listUsers 대체)
        const { data: callerMeta, error: callerErr } = await supabaseAdmin
            .from('stores_meta')
            .select('brand_name')
            .eq('store_id', callerStoreId)
            .maybeSingle()
        if (callerErr) throw callerErr

        const callerBrandName = callerMeta?.brand_name
        if (!callerBrandName || callerBrandName === '브랜드없음') {
            return NextResponse.json({
                success: true,
                products: [],
                brand_name: callerBrandName || null,
                message: callerBrandName === '브랜드없음' ? 'Independent store — no product sharing.' : 'No brand_name found. Legacy store detected.',
            })
        }

        // 검색어 없으면 조회 생략 (D안: 검색 시에만 결과 반환)
        if (!q) {
            return NextResponse.json({
                success: true,
                brand_name: callerBrandName,
                products: [],
                message: 'Enter a search term to load products.',
            })
        }

        // 2. 형제 매장 id 조회 (index scan)
        const { data: siblings, error: sibErr } = await supabaseAdmin
            .from('stores_meta')
            .select('store_id')
            .eq('brand_name', callerBrandName)
            .neq('store_id', callerStoreId)
        if (sibErr) throw sibErr

        const siblingStoreIds = (siblings || []).map((s: any) => s.store_id)
        if (siblingStoreIds.length === 0) {
            return NextResponse.json({
                success: true,
                brand_name: callerBrandName,
                products: [],
                message: 'No sibling stores found under this brand.',
            })
        }

        // 3. 상품 조회: 필요한 컬럼만 + 검색 필터 + limit
        //    image_urls/image_url은 카드 미리보기에 쓰이므로 포함, 큰 description은 제외
        const columns = [
            'id', 'collect_name', 'display_name', 'unit_text',
            'price', 'incoming_price', 'deadline_date', 'deadline_time',
            'image_url', 'image_urls', 'tiered_prices', 'is_regular_sale',
            'box_quantity', 'target_date', 'product_memo',
        ].join(', ')

        const like = `%${q.replace(/[%_]/g, m => '\\' + m)}%`
        const { data: sharedProducts, error: prodError } = await supabaseAdmin
            .from('products')
            .select(columns)
            .in('store_id', siblingStoreIds)
            .or(`collect_name.ilike.${like},display_name.ilike.${like}`)
            .order('created_at', { ascending: false })
            .limit(MAX_RESULTS)

        if (prodError) throw prodError

        return NextResponse.json({
            success: true,
            brand_name: callerBrandName,
            products: sharedProducts || [],
        })

    } catch (e: any) {
        console.error("Shared Products API Error:", e)
        return NextResponse.json({ success: false, error: e.message || 'Server Error' }, { status: 500 })
    }
}

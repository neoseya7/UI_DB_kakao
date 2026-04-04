import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const callerStoreId = searchParams.get('store_id')

        if (!callerStoreId) {
            return NextResponse.json({ success: false, error: 'Missing store_id parameter' }, { status: 400 })
        }

        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!serviceKey) return NextResponse.json({ success: false, error: 'Server misconfiguration' }, { status: 500 })

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        })

        // 1. Fetch cross-store users via Admin API
        const { data: { users }, error: userError } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
        if (userError) throw userError

        const callerUser = users.find(u => u.id === callerStoreId)
        const callerBrandName = callerUser?.user_metadata?.brand_name

        if (!callerBrandName || callerBrandName === '브랜드없음') {
            return NextResponse.json({
                success: true,
                products: [],
                message: callerBrandName === '브랜드없음' ? 'Independent store — no product sharing.' : 'No brand_name found in caller metadata. Legacy store detected.',
                brand_name: callerBrandName || null
            })
        }

        // 2. Map sibling stores matching the exact Brand string
        const siblingStoreIds = users
            .filter(u => u.user_metadata?.brand_name === callerBrandName && u.id !== callerStoreId)
            .map(u => u.id)

        if (siblingStoreIds.length === 0) {
            return NextResponse.json({
                success: true,
                products: [],
                brand_name: callerBrandName,
                message: 'No sibling stores found under this brand.'
            })
        }

        // 3. Fetch all products originating from these sibling stores
        const { data: sharedProducts, error: prodError } = await supabaseAdmin
            .from('products')
            .select('*')
            .in('store_id', siblingStoreIds)
            .order('created_at', { ascending: false })

        if (prodError) throw prodError

        return NextResponse.json({
            success: true,
            brand_name: callerBrandName,
            products: sharedProducts || []
        })

    } catch (e: any) {
        console.error("Shared Products API Error:", e)
        return NextResponse.json({ success: false, error: e.message || 'Server Error' }, { status: 500 })
    }
}

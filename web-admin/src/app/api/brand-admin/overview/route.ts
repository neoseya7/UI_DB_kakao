import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }
        const token = authHeader.replace('Bearer ', '');

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
        
        // 1. Verify caller metadata securely
        const anonClient = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
        const { data: { user }, error: authErr } = await anonClient.auth.getUser(token)
        if (authErr || !user) throw new Error("Invalid Auth Verification Token")

        const role = user.user_metadata?.role
        const brand_name = user.user_metadata?.brand_name
        const isSuperAdmin = role === 'super_admin' || user.email?.toLowerCase().includes('admin')

        if (role !== 'brand_admin' && !isSuperAdmin) {
            return NextResponse.json({ success: false, error: '권한이 없습니다 (Permission Denied)' }, { status: 403 })
        }
        if (!brand_name && role === 'brand_admin') {
            return NextResponse.json({ success: false, error: '할당된 브랜드 속성이 없습니다.' }, { status: 400 })
        }

        // 2. Load Service Role Bypass to query Cross-Tenant Data securely inside the strict boundary
        const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        })

        const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
        if (error) throw error

        // 3. Filter stores strictly belonging to this brand
        const targetedUsers = users.filter(u => u.user_metadata?.brand_name === brand_name)
        const targetStoreIds = targetedUsers.map(u => u.id)

        if (targetStoreIds.length === 0) {
             return NextResponse.json({ success: true, brand_name, stores: [], stats: { totalOrders: 0, activeStores: 0 } })
        }

        const { data: dbStores } = await supabaseAdmin.from('stores')
            .select('*')
            .in('id', targetStoreIds)
            .order('created_at', { ascending: false })

        // 4. Fetch generic unified stats across these stores for the big numbers panel
        const { count: totalOrders } = await supabaseAdmin.from('orders')
            .select('*', { count: 'exact', head: true })
            .in('store_id', targetStoreIds)

        // Append metadata explicitly safely
        const finalStores = dbStores?.map(s => {
            const meta = targetedUsers.find(u => u.id === s.id)?.user_metadata || {}
            return {
                ...s,
                email: s.email,
                metadata: {
                    owner_name: meta.owner_name,
                    phone: meta.phone,
                    role: meta.role
                }
            }
        }) || []

        return NextResponse.json({ 
            success: true, 
            brand_name,
            stores: finalStores, 
            stats: { 
                totalOrders: totalOrders || 0, 
                totalStores: finalStores.length,
                activeStores: finalStores.filter(s => s.status === 'active').length 
            } 
        })

    } catch (e: any) {
        console.error("Brand Admin Overview Error:", e)
        return NextResponse.json({ success: false, error: e.message || 'Server Error' }, { status: 500 })
    }
}

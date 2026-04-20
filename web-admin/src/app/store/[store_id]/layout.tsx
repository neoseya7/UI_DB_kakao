import type { Metadata, ResolvingMetadata } from 'next'
import { createClient } from '@supabase/supabase-js'

export async function generateMetadata(
    { params }: { params: Promise<{ store_id: string }> },
    parent: ResolvingMetadata
): Promise<Metadata> {
    const { store_id } = await params
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    
    let storeName = '매장'
    let ogImageUrl: string | null = null

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (supabaseUrl && serviceKey && store_id && UUID_RE.test(store_id)) {
        const supabaseAdmin = createClient(supabaseUrl, serviceKey)
        const [{ data: storeData }, { data: settingsData }] = await Promise.all([
            supabaseAdmin.from('stores').select('name').eq('id', store_id).single(),
            supabaseAdmin.from('store_settings').select('og_image_url').eq('store_id', store_id).single()
        ])

        if (storeData?.name) storeName = storeData.name
        if (settingsData?.og_image_url) ogImageUrl = settingsData.og_image_url
    }

    const title = `${storeName} 간편 예약 및 주문 조회`
    const description = `${storeName}의 실시간 픽업 주문 및 예약 현황을 확인하고 접수할 수 있는 전용 페이지입니다.`

    return {
        title: title,
        description: description,
        openGraph: {
            title: title,
            description: description,
            siteName: storeName,
            type: 'website',
            locale: 'ko_KR',
            ...(ogImageUrl ? { images: [{ url: ogImageUrl, width: 800, height: 400 }] } : {}),
        },
        twitter: {
            card: ogImageUrl ? 'summary_large_image' : 'summary',
            title: title,
            description: description,
            ...(ogImageUrl ? { images: [ogImageUrl] } : {}),
        }
    }
}

export default function PublicStoreLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return <>{children}</>
}

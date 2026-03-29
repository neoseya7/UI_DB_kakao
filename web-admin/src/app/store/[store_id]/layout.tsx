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
    
    if (supabaseUrl && serviceKey && store_id) {
        const supabaseAdmin = createClient(supabaseUrl, serviceKey)
        const { data } = await supabaseAdmin
            .from('stores')
            .select('name')
            .eq('id', store_id)
            .single()
            
        if (data?.name) {
            storeName = data.name
        }
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
        },
        twitter: {
            card: 'summary',
            title: title,
            description: description,
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

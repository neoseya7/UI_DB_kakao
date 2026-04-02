import { createClient } from '@supabase/supabase-js'

// .env.local에 저장하신 환경변수를 불러옵니다.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('⚠️ Supabase 환경 변수가 누락되었습니다. .env.local 파일을 확인해주세요.')
}

// 앱 전역에서 재사용할 단일 Supabase 클라이언트 인스턴스입니다.
// 관리자 모드에서 다른 매장으로 다중 탭 접속 시 세션이 꼬이지 않도록 독립적인 방(sessionStorage)을 줍니다.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
        storageKey: 'sb-auth-token-isolated'
    }
})

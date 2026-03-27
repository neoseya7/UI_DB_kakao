import { createClient } from '@supabase/supabase-js'

// .env.local에 저장하신 환경변수를 불러옵니다.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('⚠️ Supabase 환경 변수가 누락되었습니다. .env.local 파일을 확인해주세요.')
}

// 앱 전역에서 재사용할 단일 Supabase 클라이언트 인스턴스입니다.
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

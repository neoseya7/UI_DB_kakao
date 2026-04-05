"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Building2, Store, ShoppingBag, Users, Activity, Power, ExternalLink } from "lucide-react"

export default function BrandAdminDashboard() {
    const [isLoading, setIsLoading] = useState(true)
    const [stats, setStats] = useState<any>(null)
    const [stores, setStores] = useState<any[]>([])
    const [brandName, setBrandName] = useState("")

    useEffect(() => {
        const fetchDashboard = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession()
                if (!session) return

                const res = await fetch('/api/brand-admin/overview', {
                    headers: { 'Authorization': `Bearer ${session.access_token}` }
                })
                
                const json = await res.json()
                if (json.success) {
                    setStats(json.stats)
                    setStores(json.stores)
                    setBrandName(json.brand_name)
                } else {
                    console.error("Failed to load generic overview:", json.error)
                }
            } catch (err) {
                console.error("Network fault:", err)
            } finally {
                setIsLoading(false)
            }
        }
        fetchDashboard()
    }, [])

    const handleImpersonate = async (email: string, storeName: string) => {
        if (!confirm(`[${storeName}] 매장으로 접속하시겠습니까?\n\n비밀번호 없이 해당 매장의 대시보드에 접속합니다.\n새 창으로 열립니다.`)) return
        try {
            const { data: { session } } = await supabase.auth.getSession()
            const res = await fetch('/api/admin/generate-login-link', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({ store_email: email })
            })
            const data = await res.json()
            if (data.success && data.link) {
                window.open(data.link, '_blank')
            } else {
                alert(`접속 실패: ${data.error}`)
            }
        } catch (err: any) {
            alert(`접속 중 오류 발생: ${err.message}`)
        }
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh] text-emerald-700 animate-pulse font-bold gap-2">
                <Store className="w-5 h-5" /> 본사 데이터를 통합 집계 중입니다...
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-6 w-full max-w-6xl mx-auto pb-10 px-2 lg:px-4">
            <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-bold tracking-tight text-slate-800 border-b border-border/80 pb-4 flex items-center gap-2">
                    <span className="bg-emerald-600 text-white px-3 py-1 rounded-md shadow-sm">본사 통합 관리</span>
                    <strong className="text-emerald-700 text-xl font-extrabold mx-1">{brandName}</strong> 프랜차이즈 대시보드
                </h2>
                <p className="text-slate-500 text-sm mt-1 mb-2">본사에 소속된 직영/가맹점들의 전체 운영 현황과 누적 데이터를 모니터링합니다.</p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="shadow-sm border-emerald-100 bg-emerald-50/30">
                    <CardContent className="p-6">
                        <div className="flex items-center gap-3">
                            <div className="bg-emerald-100 p-3 rounded-xl text-emerald-600">
                                <Building2 className="w-6 h-6" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-semibold text-slate-500">통합 브랜드</span>
                                <span className="text-xl font-extrabold text-slate-800">{brandName || '지정 안됨'}</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-slate-200">
                    <CardContent className="p-6">
                        <div className="flex items-center gap-3">
                            <div className="bg-blue-100 p-3 rounded-xl text-blue-600"><Store className="w-6 h-6" /></div>
                            <div className="flex flex-col">
                                <span className="text-sm font-semibold text-slate-500">정상 운영 중인 가맹점</span>
                                <span className="text-2xl font-extrabold text-slate-800">{stats?.activeStores || 0}<span className="text-sm font-medium text-slate-400 ml-1">/ {stats?.totalStores || 0}곳</span></span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-slate-200">
                    <CardContent className="p-6">
                        <div className="flex items-center gap-3">
                            <div className="bg-indigo-100 p-3 rounded-xl text-indigo-600"><ShoppingBag className="w-6 h-6" /></div>
                            <div className="flex flex-col">
                                <span className="text-sm font-semibold text-slate-500">본사 누적 주문(수집) 건수</span>
                                <span className="text-2xl font-extrabold text-slate-800">{stats?.totalOrders?.toLocaleString() || 0} <span className="text-sm font-medium text-slate-400">건</span></span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-slate-200">
                    <CardContent className="p-6">
                        <div className="flex items-center gap-3">
                            <div className="bg-amber-100 p-3 rounded-xl text-amber-600"><Activity className="w-6 h-6" /></div>
                            <div className="flex flex-col">
                                <span className="text-sm font-semibold text-slate-500">본사 서비스 상태</span>
                                <span className="text-xl font-extrabold text-emerald-600 mt-1">안정적</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="mt-4 shadow-sm border-slate-200 bg-white">
                <CardHeader className="bg-slate-50/80 border-b border-slate-100 py-5">
                    <CardTitle className="text-lg text-slate-800 font-extrabold flex items-center gap-2">
                        <Users className="w-5 h-5 text-emerald-600" />
                        소속 가맹점 리스트 조회
                    </CardTitle>
                </CardHeader>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-slate-50/50 border-b">
                            <tr>
                                <th className="px-5 py-3.5 font-semibold text-slate-600">지점명 / 대표자</th>
                                <th className="px-5 py-3.5 font-semibold text-slate-600">아이디 (ID)</th>
                                <th className="px-5 py-3.5 font-semibold text-slate-600">권한 구조</th>
                                <th className="px-5 py-3.5 font-semibold text-slate-600">상태</th>
                                <th className="px-5 py-3.5 font-semibold text-slate-600">매장 접근</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                            {stores.length === 0 && (<tr><td colSpan={5} className="p-8 text-center text-slate-400">소속된 가맹점이 없습니다.</td></tr>)}
                            {stores.map((s, i) => (
                                <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-5 py-4">
                                        <div className="font-bold text-slate-900 text-[15px]">{s.name}</div>
                                        <div className="text-slate-500 text-xs mt-1 font-medium">{s.metadata?.owner_name || '대표자 미상'} · {s.metadata?.phone || '연락처 미상'}</div>
                                    </td>
                                    <td className="px-5 py-4 font-mono text-slate-500 text-[13px]">{s.email}</td>
                                    <td className="px-5 py-4">
                                        {s.metadata?.role === 'brand_admin' 
                                            ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border-none shadow-sm px-2.5">본사 관리 권한 (Brand Admin)</Badge>
                                            : <Badge variant="outline" className="text-slate-600 bg-white shadow-sm px-2.5">일반 점장 (Store Owner)</Badge>
                                        }
                                    </td>
                                    <td className="px-5 py-4">
                                        {s.status === 'active'
                                            ? <div className="flex items-center gap-1.5 text-emerald-600 font-bold"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> 정상운영</div>
                                            : <div className="flex items-center gap-1.5 text-rose-500 font-bold"><div className="w-2 h-2 rounded-full bg-rose-500"></div> 승인보류 / 정지</div>
                                        }
                                    </td>
                                    <td className="px-5 py-4">
                                        {s.status === 'active' && s.email && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleImpersonate(s.email, s.name)}
                                                className="h-8 gap-1.5 font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200"
                                            >
                                                <ExternalLink className="w-3.5 h-3.5" /> 접속
                                            </Button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    )
}

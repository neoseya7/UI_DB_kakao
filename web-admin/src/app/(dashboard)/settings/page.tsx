"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Save, Loader2 } from "lucide-react"

export default function SettingsPage() {
    const [storeId, setStoreId] = useState<string | null>(null)
    const [isSaving, setIsSaving] = useState(false)
    const [isLoading, setIsLoading] = useState(true)

    // Main Master State matching Supabase `store_settings`
    const [settings, setSettings] = useState({
        show_price: true,
        show_stock: true,
        notice_texts: ["[필독] 설 연휴 기간은 딸기 수급 문제로 일부 주문이 제한될 수 있습니다."],
        badge_stock_level: 3,
        crm_tags: [] as any[],
        manager_nicks: [] as string[], // Extra local combined to CRM tags or just separate for UI
        order_alert_enabled: true,
        alert_minutes_before: 5
    })

    useEffect(() => {
        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                setStoreId(user.id)
                const { data } = await supabase.from('store_settings').select('*').eq('store_id', user.id).single()
                if (data) {
                    setSettings({
                        show_price: data.show_price ?? true,
                        show_stock: data.show_stock ?? true,
                        notice_texts: data.notice_texts || [],
                        badge_stock_level: data.badge_stock_level || 3,
                        crm_tags: data.crm_tags?.filter((t: any) => t.type === 'crm') || [],
                        manager_nicks: data.crm_tags?.filter((t: any) => t.type === 'manager').map((t: any) => t.name) || ["강남1점장"],
                        order_alert_enabled: data.order_alert_enabled ?? true,
                        alert_minutes_before: data.alert_minutes_before || 5
                    })
                }
            }
            setIsLoading(false)
        }
        init()
    }, [])

    const handleSave = async () => {
        if (!storeId) return
        setIsSaving(true)

        // Combine manager_nicks and crm_tags into one JSONB array for the DB
        const combinedTags = [
            ...settings.manager_nicks.map(n => ({ type: 'manager', name: n })),
            ...settings.crm_tags.map(t => ({ type: 'crm', ...t }))
        ]

        const payload = {
            show_price: settings.show_price,
            show_stock: settings.show_stock,
            notice_texts: settings.notice_texts,
            badge_stock_level: settings.badge_stock_level,
            crm_tags: combinedTags,
            order_alert_enabled: settings.order_alert_enabled,
            alert_minutes_before: settings.alert_minutes_before
        }

        // Use the secure API to handle possible missing store records (Foreign Key constraints)
        try {
            const res = await fetch('/api/stores/update-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ store_id: storeId, payload })
            })
            const result = await res.json()
            setIsSaving(false)

            if (!result.success) {
                alert(`설정 저장 실패: ${result.error}`)
                return
            }

            alert("✅ 매장 설정이 데이터베이스에 안전하게 저장되었습니다.")
        } catch (err: any) {
            setIsSaving(false)
            alert(`설정 저장 중 오류: ${err.message}`)
        }
    }

    // Handlers for dynamic array state
    const updateNotice = (index: number, val: string) => {
        const newNotices = [...settings.notice_texts]
        newNotices[index] = val
        setSettings({ ...settings, notice_texts: newNotices })
    }
    const removeNotice = (index: number) => {
        setSettings({ ...settings, notice_texts: settings.notice_texts.filter((_, i) => i !== index) })
    }
    const addNotice = () => {
        if (settings.notice_texts.length >= 10) return alert("공지사항은 최대 10개까지 가능합니다.")
        setSettings({ ...settings, notice_texts: [...settings.notice_texts, ""] })
    }

    // CRM Handlers
    const [newManager, setNewManager] = useState("")
    const addManager = () => {
        if (!newManager.trim()) return
        if (settings.manager_nicks.includes(newManager)) return alert("이미 등록된 점장 닉네임입니다.")
        setSettings({ ...settings, manager_nicks: [...settings.manager_nicks, newManager.trim()] })
        setNewManager("")
    }

    if (isLoading) {
        return <div className="flex h-[50vh] items-center justify-center text-muted-foreground"><Loader2 className="w-8 h-8 animate-spin" /></div>
    }

    return (
        <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto pb-24 relative">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 border-b pb-4">
                <div className="flex flex-col gap-2">
                    <h2 className="text-2xl font-bold tracking-tight">매장 상세 설정</h2>
                    <p className="text-muted-foreground">매장의 외부 노출용 웹페이지 옵션과 발주 알람, 태그를 실제 DB 단위로 관리합니다.</p>
                </div>
                <Button
                    onClick={handleSave}
                    disabled={isSaving}
                    size="lg"
                    className="font-bold bg-indigo-600 hover:bg-indigo-700 shadow-md gap-2 w-full sm:w-auto"
                >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    설정값 마스터 저장
                </Button>
            </div>

            <div className="grid gap-6">
                {/* 1. Global View Toggles */}
                <Card>
                    <CardHeader>
                        <CardTitle>1. 주문 검색 페이지 표시 설정</CardTitle>
                        <CardDescription>고객이 조회/검색할 때 노출되는 기본 정보를 제어합니다.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="show-price" className="flex flex-col gap-1 cursor-pointer">
                                <span className="text-base font-semibold">가격 표시 활성화</span>
                                <span className="font-normal text-sm text-muted-foreground">목록과 검색 결과에 상품 단가를 노출합니다.</span>
                            </Label>
                            <Switch
                                id="show-price"
                                checked={settings.show_price}
                                onCheckedChange={(v) => setSettings({ ...settings, show_price: v })}
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <Label htmlFor="show-stock" className="flex flex-col gap-1 cursor-pointer">
                                <span className="text-base font-semibold">실시간 재고 노출 활성화</span>
                                <span className="font-normal text-sm text-muted-foreground">품절 및 잔여 재고 상태를 밖으로 노출합니다.</span>
                            </Label>
                            <Switch
                                id="show-stock"
                                checked={settings.show_stock}
                                onCheckedChange={(v) => setSettings({ ...settings, show_stock: v })}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* 2. Notice Texts Array */}
                <Card>
                    <CardHeader>
                        <CardTitle>2. 외부 노출 공지사항 (배너/알림)</CardTitle>
                        <CardDescription>고객 메인 페이지 상단에 띄울 필독 공지사항입니다. 최대 10줄까지 등록할 수 있습니다.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {settings.notice_texts.map((text, i) => (
                            <div key={i} className="flex gap-2 items-center">
                                <span className="font-bold text-sm text-slate-400 w-4 text-center">{i + 1}.</span>
                                <Input
                                    value={text}
                                    onChange={(e) => updateNotice(i, e.target.value)}
                                    placeholder="공지사항 내용을 입력하세요"
                                    className="flex-1 bg-white shadow-sm"
                                />
                                <Button onClick={() => removeNotice(i)} variant="outline" className="text-destructive hover:bg-destructive/10 px-3">삭제</Button>
                            </div>
                        ))}
                        <Button onClick={addNotice} variant="secondary" className="w-full mt-2 font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 border-dashed">
                            + 텍스트 공지줄 새로 추가하기
                        </Button>
                    </CardContent>
                </Card>

                {/* 3. Product Badge Level Configuration */}
                <Card>
                    <CardHeader>
                        <CardTitle>3. 상품 품절 임박(재고 배지) 수량 기준</CardTitle>
                        <CardDescription>특정 수량 이하로 떨어졌을 때 상품 띠지가 '마감 임박' 등으로 변환되는 전역 허들 기준입니다.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between border-b pb-4 mb-4 mt-2">
                            <Label htmlFor="low-stock" className="flex flex-col gap-1">
                                <span className="text-base font-semibold text-slate-800">품절 임박 경고 허들 수량</span>
                                <span className="font-normal text-sm text-muted-foreground">이 숫자 이하로 남은 상품은 색상이 붉은 톤으로 자동 변경 노출됩니다.</span>
                            </Label>
                            <div className="flex items-center gap-2">
                                <Input
                                    id="low-stock" type="number"
                                    value={settings.badge_stock_level}
                                    onChange={e => setSettings({ ...settings, badge_stock_level: parseInt(e.target.value) || 0 })}
                                    className="w-24 text-center font-bold text-lg text-primary shadow-sm"
                                />
                                <span className="text-sm font-semibold">개 이하</span>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                            <div className="p-3 bg-muted/30 border rounded-md text-center">
                                <Label className="text-xs font-medium text-slate-500 block mb-1">허들 이상일 때 노출</Label>
                                <Badge className="bg-slate-200 text-slate-700 hover:bg-slate-200 text-sm">구매 가능</Badge>
                            </div>
                            <div className="p-3 bg-amber-50/50 border border-amber-200 rounded-md text-center">
                                <Label className="text-xs font-medium text-amber-700 block mb-1">허들 이하로 떨어질 때 노출 ({settings.badge_stock_level}개 이하)</Label>
                                <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 text-sm">마감 임박</Badge>
                            </div>
                            <div className="p-3 bg-red-50/50 border border-red-200 rounded-md text-center">
                                <Label className="text-xs font-medium text-red-500 block mb-1">재고가 아예 없을 때 (0개)</Label>
                                <Badge variant="destructive" className="bg-red-500 hover:bg-red-600 text-sm">SOLD OUT</Badge>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* 4. Manager Nicknames Set */}
                <Card>
                    <CardHeader>
                        <CardTitle>4. 점장 전용 챗봇 닉네임 필터링 (명령어 통과용)</CardTitle>
                        <CardDescription>고객 채팅이 아닌 '점장 명령'으로 강제 분류되어 스킵될 카카오 인증 닉네임 리스트입니다.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex gap-2">
                            <Input
                                value={newManager} onChange={e => setNewManager(e.target.value)}
                                placeholder="등록할 점장의 챗봇 닉네임 정확히 입력 (예: 강남단골1)"
                                className="max-w-[400px] shadow-sm bg-white"
                                onKeyDown={(e) => { if (e.key === 'Enter') addManager() }}
                            />
                            <Button onClick={addManager} className="font-semibold shadow-sm">닉네임 추가</Button>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2 pt-4 border-t">
                            {settings.manager_nicks.length === 0 && <span className="text-sm text-muted-foreground">등록된 점장 닉네임이 없습니다.</span>}
                            {settings.manager_nicks.map((nick, idx) => (
                                <Badge key={idx} variant="secondary" className="px-3 py-1.5 flex gap-2 items-center text-sm font-bold bg-slate-100 border text-slate-700 shadow-sm">
                                    {nick}
                                    <button onClick={() => setSettings({ ...settings, manager_nicks: settings.manager_nicks.filter((_, i) => i !== idx) })} className="hover:text-destructive opacity-70 hover:opacity-100 transition-opacity ml-1 p-0.5">×</button>
                                </Badge>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* 5. Production Orders Alert */}
                <Card className="border-red-100 shadow-sm">
                    <CardHeader className="bg-red-50/50 border-b border-red-100 py-4">
                        <CardTitle className="text-red-900 flex items-center gap-2">5. 자동 발주시간 도래 마감 알림 설정</CardTitle>
                        <CardDescription>각 상품 등록 시 개별 지정된 '발주 마감 시간'이 임박하면 화면 전체에 강제 팝업을 띄웁니다.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6 pt-5 bg-white rounded-b-lg">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="order-alert-enable" className="flex flex-col gap-1 cursor-pointer">
                                <span className="text-base font-bold text-slate-800">마감 알림 기능 전역 활성화 여부</span>
                                <span className="font-normal text-sm text-muted-foreground">이 기능을 끄면 발주 마감이 도래해도 대시보드 강제 팝업 스크립트가 중지됩니다.</span>
                            </Label>
                            <Switch
                                id="order-alert-enable"
                                checked={settings.order_alert_enabled}
                                onCheckedChange={v => setSettings({ ...settings, order_alert_enabled: v })}
                                className="data-[state=checked]:bg-red-500"
                            />
                        </div>

                        <div className="flex items-center justify-between pt-5 border-t border-slate-100">
                            <Label htmlFor="alert-minutes" className="flex flex-col gap-1">
                                <span className="text-base font-bold text-slate-800">마감 카운트다운 알림 타이머</span>
                                <span className="font-normal text-sm text-muted-foreground">발주 마감 시간이 되기 몇 분 전에 미리 팝업을 띄워 생산을 유도할지 정합니다.</span>
                            </Label>
                            <div className="flex items-center gap-2">
                                <Input
                                    id="alert-minutes"
                                    type="number"
                                    value={settings.alert_minutes_before}
                                    onChange={e => setSettings({ ...settings, alert_minutes_before: parseInt(e.target.value) || 0 })}
                                    className="w-24 text-center font-bold text-lg border-red-200 focus-visible:ring-red-400 focus-visible:ring-offset-0 bg-red-50 text-red-900 shadow-sm"
                                />
                                <span className="text-sm font-bold text-red-800">분 전</span>
                            </div>
                        </div>

                        <div className="pt-2">
                            <Button
                                variant="outline"
                                className="w-full text-red-700 font-bold border-red-200 border-dashed bg-white hover:bg-red-50 hover:text-red-900 transition-colors"
                                onClick={() => {
                                    if (!settings.order_alert_enabled) return alert("먼저 위쪽의 [알림 기능 활성화] 스위치를 켜주세요!");
                                    window.dispatchEvent(new CustomEvent('simulate-deadline-alert', { detail: { minutes: settings.alert_minutes_before, productName: '[테스트] 벚꽃 한정 마카롱 5구' } }))
                                }}
                            >
                                🔔 설정된 {settings.alert_minutes_before}분 전 상태로 모의 팝업 테스트 실행해보기
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

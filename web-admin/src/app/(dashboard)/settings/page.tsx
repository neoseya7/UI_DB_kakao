"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Save, Loader2, Trash2 } from "lucide-react"
import { GuideBadge } from "@/components/ui/guide-badge"

export default function SettingsPage() {
    const [storeId, setStoreId] = useState<string | null>(null)
    const [isSaving, setIsSaving] = useState(false)
    const [isLoading, setIsLoading] = useState(true)

    // Main Master State matching Supabase `store_settings`
    const [settings, setSettings] = useState({
        show_price: true,
        show_stock: true,
        show_product_image: true,
        show_product_desc: true,
        show_stock_badge: true,
        notice_texts: ["[필독] 설 연휴 기간은 딸기 수급 문제로 일부 주문이 제한될 수 있습니다."],
        badge_stock_level: 3,
        crm_tags: [] as any[],
        manager_nicks: [] as string[], // Extra local combined to CRM tags or just separate for UI
        order_alert_enabled: true,
        alert_minutes_before: 5,
        pos_sync_enabled: false
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
                        show_product_image: data.show_product_image ?? true,
                        show_product_desc: data.show_product_desc ?? true,
                        show_stock_badge: data.show_stock_badge ?? true,
                        notice_texts: data.notice_texts || [],
                        badge_stock_level: data.badge_stock_level || 3,
                        crm_tags: data.crm_tags?.filter((t: any) => t.type === 'crm') || [],
                        manager_nicks: data.crm_tags?.filter((t: any) => t.type === 'manager').map((t: any) => t.name) || ["강남1점장"],
                        order_alert_enabled: data.order_alert_enabled ?? true,
                        alert_minutes_before: data.alert_minutes_before || 5,
                        pos_sync_enabled: data.crm_tags?.find((t: any) => t.type === 'setting' && t.key === 'pos_sync_enabled')?.value ?? false
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
            ...settings.crm_tags.map(t => ({ type: 'crm', ...t })),
            { type: 'setting', key: 'pos_sync_enabled', value: settings.pos_sync_enabled }
        ]

        const payload = {
            show_price: settings.show_price,
            show_stock: settings.show_stock,
            show_product_image: settings.show_product_image,
            show_product_desc: settings.show_product_desc,
            show_stock_badge: settings.show_stock_badge,
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

    const [newCrmNick, setNewCrmNick] = useState("")
    const [newCrmCat, setNewCrmCat] = useState("노쇼")
    const [newCrmMemo, setNewCrmMemo] = useState("")

    const addCrmTag = () => {
        if (!newCrmNick.trim()) return alert("닉네임을 입력해주세요.")
        if (settings.crm_tags.find(t => t.name === newCrmNick.trim())) return alert("이미 등록된 닉네임입니다.")
        setSettings({ ...settings, crm_tags: [...settings.crm_tags, { name: newCrmNick.trim(), category: newCrmCat, memo: newCrmMemo.trim() }] })
        setNewCrmNick("")
        setNewCrmMemo("")
    }

    const removeCrmTag = (idx: number) => {
        if(!confirm("해당 고객의 분류 태그를 삭제하시겠습니까?")) return
        setSettings({ ...settings, crm_tags: settings.crm_tags.filter((_, i) => i !== idx) })
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
                    설정 저장
                </Button>
            </div>

            <div className="grid gap-6">
                {/* 1. POS Sync Settings */}
                <GuideBadge text="포스와 연동해 주문정보를 한번에 결제까지 이어집니다. 연동을 켠 뒤 설정값 저장 후 주문관리에서 주문앞 체크박스를 체크해보세요. pos로 가는 팝업이 활성화됩니다." className="block">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md text-sm">1</span> 
                            포스와 연동
                        </CardTitle>
                        <CardDescription>매장의 오프라인 POS 기기와의 양방향 데이터 연동 여부를 결정합니다.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="pos-sync" className="flex flex-col gap-1 cursor-pointer">
                                <span className="text-base font-semibold">본사 POS 시스템 연동 켜기</span>
                                <span className="font-normal text-sm text-amber-600 font-medium">[현재 개발 중입니다. 주문관리에 결제창이 생깁니다. 결제 버튼을 누르면 바로 결제가 이루어집니다.]</span>
                            </Label>
                            <Switch
                                id="pos-sync"
                                checked={settings.pos_sync_enabled}
                                onCheckedChange={(v) => setSettings({ ...settings, pos_sync_enabled: v })}
                                className="data-[state=checked]:bg-indigo-600"
                            />
                        </div>
                    </CardContent>
                </Card>
                </GuideBadge>

                {/* 2. Global View Toggles */}
                <GuideBadge text="고객이 보는 주문검색페이지의 주문정보 내용의 노출 여부를 선택합니다." className="block">
                <Card>
                    <CardHeader>
                        <CardTitle>2. 주문 검색 페이지 표시 설정</CardTitle>
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
                                <span className="text-base font-semibold">상품 입고/미입고 노출 활성화</span>
                                <span className="font-normal text-sm text-muted-foreground">고객용 상품 카드의 하단에 구체적 수량 대신 '입고 완료🟢 / 미입고🔴' 상태를 표시합니다.</span>
                            </Label>
                            <Switch
                                id="show-stock"
                                checked={settings.show_stock}
                                onCheckedChange={(v) => setSettings({ ...settings, show_stock: v })}
                            />
                        </div>
                    </CardContent>
                </Card>
                </GuideBadge>

                {/* 3. Notice Texts Array */}
                <GuideBadge text="주문검색페이지 상단의 공지사항 정보를 입력할 수 있습니다." className="block">
                <Card>
                    <CardHeader>
                        <CardTitle>3. 공지사항 추가</CardTitle>
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
                                <Button onClick={() => removeNotice(i)} variant="outline" className="text-destructive hover:bg-destructive/10 px-3 shrink-0">삭제</Button>
                            </div>
                        ))}
                        <Button onClick={addNotice} variant="secondary" className="w-full mt-2 font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 border-dashed">
                            + 텍스트 공지줄 새로 추가하기
                        </Button>
                    </CardContent>
                </Card>
                </GuideBadge>

                {/* 4. Product Guide Page Configuration */}
                <GuideBadge text="노출되는 상품의 이미지, 상세정보, 재고배지의 노출 여부를 선택할 수 있습니다. 마감 임박 버튼의 수량을 설정할 수 있습니다." className="block">
                <Card>
                    <CardHeader>
                        <CardTitle>4. 상품리스트 페이지 설정</CardTitle>
                        <CardDescription>고객에게 노출되는 개별 상품 페이지의 디자인 요소 활성화 및 재고 배지 임계값을 설정합니다.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex flex-col gap-4 border-b border-slate-200/60 pb-6 pt-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="show-image" className="flex flex-col gap-1 cursor-pointer">
                                    <span className="text-base font-semibold">상품 이미지 노출 여부</span>
                                    <span className="font-normal text-sm text-muted-foreground">상품 목록 및 상세 모달창에 대표 이미지를 표시합니다.</span>
                                </Label>
                                <Switch id="show-image" checked={settings.show_product_image} onCheckedChange={(v) => setSettings({ ...settings, show_product_image: v })} />
                            </div>
                            <div className="flex items-center justify-between">
                                <Label htmlFor="show-desc" className="flex flex-col gap-1 cursor-pointer">
                                    <span className="text-base font-semibold">상품 안내문(Description) 노출 여부</span>
                                    <span className="font-normal text-sm text-muted-foreground">상품 세부 안내글 및 유의사항을 노출할지 결정합니다.</span>
                                </Label>
                                <Switch id="show-desc" checked={settings.show_product_desc} onCheckedChange={(v) => setSettings({ ...settings, show_product_desc: v })} />
                            </div>
                            <div className="flex items-center justify-between">
                                <Label htmlFor="show-badge" className="flex flex-col gap-1 cursor-pointer">
                                    <span className="text-base font-semibold">마감임박 배지 노출 여부</span>
                                    <span className="font-normal text-sm text-muted-foreground">목록의 특정 상품명 옆에 시각적인 재고 배지를 띄웁니다.</span>
                                </Label>
                                <Switch id="show-badge" checked={settings.show_stock_badge} onCheckedChange={(v) => setSettings({ ...settings, show_stock_badge: v })} />
                            </div>
                        </div>

                        {/* Inventory Threshold Section */}
                        <div className={`transition-opacity duration-200 ${!settings.show_stock_badge ? 'opacity-40 pointer-events-none' : ''}`}>
                            <div className="flex items-center justify-between pb-4 mb-4">
                                <Label htmlFor="low-stock" className="flex flex-col gap-1">
                                    <span className="text-base font-semibold text-slate-800">마감임박 배지 노출 수량 설정</span>
                                    <span className="font-normal text-sm text-muted-foreground">이 숫자 이하로 남은 상품은 마감임박으로 표시됩니다.</span>
                                </Label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        id="low-stock" type="number" disabled={!settings.show_stock_badge}
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
                        </div>
                    </CardContent>
                </Card>
                </GuideBadge>

                {/* 5. Manager Nicknames Set */}
                <GuideBadge text="점장님의 닉네임이나 지인의 닉네임을 등록하면 주문 형식의 대화도 주문으로 분류되지 않습니다." className="block">
                <Card>
                    <CardHeader>
                        <CardTitle>5. 주문제외 닉네임 설정</CardTitle>
                        <CardDescription>고객 채팅이 아닌 '점장 명령'으로 강제 분류되어 스킵될 카카오 인증 닉네임 리스트입니다.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex flex-col sm:flex-row gap-2">
                            <Input
                                value={newManager} onChange={e => setNewManager(e.target.value)}
                                placeholder="예: 강남점점장(띄어쓰기 없이 작성해주세요)"
                                className="w-full sm:max-w-[400px] shadow-sm bg-white"
                                onKeyDown={(e) => { if (e.key === 'Enter') addManager() }}
                            />
                            <Button onClick={addManager} className="font-semibold shadow-sm w-full sm:w-auto shrink-0">닉네임 추가</Button>
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
                </GuideBadge>

                {/* 6. Customer CRM Tags */}
                <GuideBadge text="노쇼 고객, 단골 고객 등을 사전 등록하여 오늘의 대화 및 주문관리 창에서 뱃지로 즉각 식별할 수 있습니다." className="block">
                <Card>
                    <CardHeader>
                        <CardTitle>6. 고객 분류 (CRM 태그) 설정</CardTitle>
                        <CardDescription>특정 닉네임의 고객을 사전에 분류해 두면 대시보드 리스트에서 이름 아래에 아이콘과 메모가 나타납니다.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex flex-col md:flex-row gap-3">
                            <Input
                                value={newCrmNick} onChange={e => setNewCrmNick(e.target.value)}
                                placeholder="고객 닉네임"
                                className="w-full md:w-[200px] shadow-sm bg-white font-bold"
                            />
                            <Select value={newCrmCat} onValueChange={setNewCrmCat}>
                                <SelectTrigger className="w-full md:w-[150px] shadow-sm bg-white font-bold">
                                    <SelectValue placeholder="분류 선택" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="노쇼"><span className="text-red-600 font-bold">노쇼/블랙</span></SelectItem>
                                    <SelectItem value="단골"><span className="text-blue-600 font-bold">단골/VIP</span></SelectItem>
                                    <SelectItem value="기타"><span className="text-slate-600 font-bold">특이사항(기타)</span></SelectItem>
                                </SelectContent>
                            </Select>
                            <Input
                                value={newCrmMemo} onChange={e => setNewCrmMemo(e.target.value)}
                                placeholder="간단한 메모 (선택사항, 예: 항상 10분 늦음)"
                                className="w-full flex-1 shadow-sm bg-white"
                                onKeyDown={(e) => { if (e.key === 'Enter') addCrmTag() }}
                            />
                            <Button onClick={addCrmTag} className="font-semibold shadow-sm w-full md:w-auto shrink-0 bg-emerald-600 hover:bg-emerald-700">추가하기</Button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-4 pt-4 border-t">
                            {settings.crm_tags.length === 0 && <span className="text-sm text-muted-foreground w-full col-span-full">현재 등록된 고객 분류 태그가 없습니다.</span>}
                            {settings.crm_tags.map((tag, idx) => (
                                <div key={idx} className="flex flex-col gap-1 p-3 border rounded-lg bg-slate-50 relative group">
                                    <button onClick={() => removeCrmTag(idx)} className="absolute top-2 right-2 p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"><Trash2 className="w-4 h-4" /></button>
                                    <div className="flex items-center gap-2 pr-6">
                                        <Badge variant="outline" className={`shrink-0 ${tag.category === '노쇼' ? 'border-red-200 bg-red-50 text-red-700' : tag.category === '단골' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-slate-100 text-slate-700'}`}>
                                            {tag.category === '노쇼' ? '🔴 노쇼' : tag.category === '단골' ? '🔵 단골' : '⚪ 기타'}
                                        </Badge>
                                        <span className="font-bold text-sm truncate">{tag.name}</span>
                                    </div>
                                    {tag.memo && <div className="text-xs text-slate-500 truncate pl-1 mt-1">- {tag.memo}</div>}
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
                </GuideBadge>

                {/* 7. Production Orders Alert */}
                <GuideBadge text="상품정보에 발주마감시간을 입력하면 시간에 맞춰 발주마감을 알리는 팝업이 실행됩니다." className="block">
                <Card className="border-red-100 shadow-sm">
                    <CardHeader className="bg-red-50/50 border-b border-red-100 py-4">
                        <CardTitle className="text-red-900 flex items-center gap-2">7. 발주시간 안내 팝업 설정</CardTitle>
                        <CardDescription>각 상품 등록 시 개별 지정된 '발주 마감 시간'이 임박하면 화면 전체에 강제 팝업을 띄웁니다.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6 pt-5 bg-white rounded-b-lg">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="order-alert-enable" className="flex flex-col gap-1 cursor-pointer">
                                <span className="text-base font-bold text-slate-800">발주마감시간 팝업 활성화 여부</span>
                                <span className="font-normal text-sm text-muted-foreground">기능을 활성화하면 설정된 발주시간에 팝업이 실행됩니다.</span>
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
                </GuideBadge>
            </div>
        </div>
    )
}

"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Copy, Blocks, RefreshCw, MessageCircle, Plus, Trash2 } from "lucide-react"
import { GuideBadge } from "@/components/ui/guide-badge"

export default function UtilitiesPage() {
    const [products, setProducts] = useState<any[]>([])
    const [orders, setOrders] = useState<any[]>([])
    const [orderItems, setOrderItems] = useState<any[]>([])
    const [qtyMap, setQtyMap] = useState<Record<string, number>>({})
    const [crmTags, setCrmTags] = useState<any[]>([])
    const [isSaving, setIsSaving] = useState(false)
    
    // Fetch real products and orders from DB
    useEffect(() => {
        const fetchData = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            const user = session?.user
            if (!user) return

            const { data: storeSet } = await supabase.from('store_settings').select('crm_tags').eq('store_id', user.id).single()
            if (storeSet?.crm_tags) {
                setCrmTags(storeSet.crm_tags)
                const utilT = storeSet.crm_tags.find((t: any) => t.type === 'util_template')
                if (utilT && Array.isArray(utilT.templates) && utilT.templates.length > 0) {
                    setTemplates(utilT.templates)
                }
            }

            // products — 필요한 컬럼만 (egress 절감)
            const { data: pData } = await supabase
                .from('products')
                .select('id, collect_name, display_name, target_date, is_regular_sale, allocated_stock, box_quantity')
                .eq('store_id', user.id)
                .eq('is_hidden', false)
                .order('created_at', { ascending: false })

            if (pData) setProducts(pData)

            // 재고 합계는 서버사이드 RPC로 정확히 집계 (target_date=pickup_date 매칭, 상시판매는 전기간)
            if (pData && pData.length > 0) {
                const { data: rpcData } = await supabase.rpc('get_product_sales_sum', {
                    p_store_id: user.id,
                    p_product_ids: pData.map(p => p.id)
                })
                const map: Record<string, number> = {}
                for (const r of (rpcData || [])) map[r.product_id] = Number(r.total_quantity) || 0
                setQtyMap(map)
            }

            // orders — 노쇼/[노쇼고객] 계산용. 최근 30일 이후만 (임박 주문 대상)
            // range() 페이지네이션으로 매장 규모와 무관하게 전량 수집
            const fromDate = new Date()
            fromDate.setDate(fromDate.getDate() - 30)
            const sinceDate = fromDate.toISOString().split('T')[0]

            let allOrders: any[] = []
            const PAGE = 1000
            let ofrom = 0
            while (true) {
                const { data } = await supabase.from('orders')
                    .select('id, pickup_date, customer_nickname, is_received, customer_memo_2')
                    .eq('store_id', user.id).eq('is_hidden', false)
                    .gte('pickup_date', sinceDate)
                    .range(ofrom, ofrom + PAGE - 1)
                if (!data || data.length === 0) break
                allOrders = allOrders.concat(data)
                if (data.length < PAGE) break
                ofrom += PAGE
            }

            if (allOrders.length > 0) {
                const orderIds = allOrders.map(o => o.id)
                const chunkSize = 250
                let allItems: any[] = []
                for (let i = 0; i < orderIds.length; i += chunkSize) {
                    const chunk = orderIds.slice(i, i + chunkSize)
                    const { data: itemsData } = await supabase.from('order_items').select('order_id, product_id, quantity').in('order_id', chunk)
                    if (itemsData) allItems = allItems.concat(itemsData)
                }
                setOrders(allOrders)
                setOrderItems(allItems)
            }
        }
        fetchData()
    }, [])

    const [filterType, setFilterType] = useState<string>("soldout") // "all" | "soldout" | "instock"
    const [selectedDate, setSelectedDate] = useState<string>("all") // "all" | "regular" | "YYYY-MM-DD"
    
    // Derived dates for filter
    const uniqueDates = Array.from(new Set(products.filter(p => !p.is_regular_sale && p.target_date).map(p => p.target_date))).sort()
    const hasRegular = products.some(p => p.is_regular_sale)

    // 5 Templates State
    const [templates, setTemplates] = useState([
        "✅️[상품명] ❌️마감❌️",
        "✅️[상품명] [수량]개 남았습니다! 🎉",
        "★ [상품명] 준비 완료되었습니다.",
        "",
        ""
    ])

    const [activeTemplateIdx, setActiveTemplateIdx] = useState(0)

    // The manually editable text area content
    const [editableText, setEditableText] = useState("")

    // 미수령 판단: is_received=false 이면서 고객찜(customer_memo_2) 비어있을 때만 노쇼로 간주
    const isNoshow = (o: any) => !o.is_received && !(o.customer_memo_2 && String(o.customer_memo_2).trim())

    // Generate Message function mapping multiple products
    useEffect(() => {
        const template = templates[activeTemplateIdx];
        if (!template) {
            setEditableText("");
            return;
        }

        const filtered = products.filter(p => {
            // Date logic
            if (selectedDate !== "all") {
                if (selectedDate === "regular" && !p.is_regular_sale) return false;
                if (selectedDate !== "regular" && p.target_date !== selectedDate) return false;
            }
            
            // Calculate remaining stock
            let relevantOrderIds: string[] = []
            let noshowNames: string[] = []
            
            if (selectedDate !== "all" && selectedDate !== "regular") {
                const dateOrders = orders.filter(o => o.pickup_date === selectedDate)
                relevantOrderIds = dateOrders.map(o => o.id)
                noshowNames = Array.from(new Set(dateOrders.filter(isNoshow).map(o => o.customer_nickname || "알수없음")))
            } else {
                relevantOrderIds = orders.map(o => o.id)
                noshowNames = Array.from(new Set(orders.filter(isNoshow).map(o => o.customer_nickname || "알수없음")))
            }
            
            const noshowString = noshowNames.length > 0 ? noshowNames.map(n => `@${n}`).join(" ") : "(미수령고객 없음)"
            
            // 재고: RPC가 target_date=pickup_date 매칭(일반) + 전기간(상시판매)로 정확히 집계
            const orderSum = qtyMap[p.id] || 0
            const remaining = Math.max(0, (p.allocated_stock || 0) - orderSum)

            // 노쇼 매핑: 상품별 주문 id는 여전히 order_items로 계산 (선택 날짜 범위 내)
            const relevantItems = orderItems.filter(oi => oi.product_id === p.id && relevantOrderIds.includes(oi.order_id))
            const prodOrderIds = relevantItems.map(oi => oi.order_id);
            const prodNoshowOrders = orders.filter(o => prodOrderIds.includes(o.id) && isNoshow(o));
            const prodNoshowNames = Array.from(new Set(prodNoshowOrders.map(o => o.customer_nickname || "알수없음")));
            const prodNoshowString = prodNoshowNames.length > 0 ? prodNoshowNames.map(n => `@${n}`).join(" ") : "(미수령고객 없음)";

            // Inject calculated remaining stock into the product object temporarily for mapping
            p._calculated_remaining = remaining;
            p._order_sum = orderSum;
            p._noshow_string = prodNoshowString;

            // Stock logic
            if (filterType === "all") return true;
            if (filterType === "soldout") return (p.allocated_stock !== null && remaining <= 0);
            if (filterType === "instock") return remaining > 0;
            if (filterType === "noshow") return prodNoshowOrders.length > 0;
            return true;
        });

        // If template doesn't use product-specific variables, generate it just once
        const hasProductVariables = /\[(상품명|수량|재고|주문수량)\]/.test(template);

        if (!hasProductVariables) {
            let globalNoshow = "(미수령고객 없음)";
            if (selectedDate !== "all" && selectedDate !== "regular") {
                const currentNoshows = Array.from(new Set(orders.filter(o => o.pickup_date === selectedDate && isNoshow(o)).map(o => o.customer_nickname || "알수없음")));
                globalNoshow = currentNoshows.length > 0 ? currentNoshows.map(n => `@${n}`).join(" ") : "(미수령고객 없음)";
            } else {
                const currentNoshows = Array.from(new Set(orders.filter(isNoshow).map(o => o.customer_nickname || "알수없음")));
                globalNoshow = currentNoshows.length > 0 ? currentNoshows.map(n => `@${n}`).join(" ") : "(미수령고객 없음)";
            }
            
            const result = template.replace(/\[노쇼고객\]/g, globalNoshow).replace(/@@/g, '@');
            setEditableText(result);
            return;
        }

        const result = filtered.map(p => {
            const prodName = p.display_name || p.collect_name;
            const stockStr = (p._calculated_remaining || 0).toString();
            let orderSumStr = (p._order_sum || 0).toString();
            
            if (p.box_quantity && p.box_quantity > 0 && p._order_sum > 0) {
                const boxes = (p._order_sum / p.box_quantity).toFixed(1).replace('.0', '');
                orderSumStr = `${p._order_sum}(${boxes}box)`;
            }

            return template
                .replace(/\[상품명\]/g, prodName)
                .replace(/\[수량\]/g, stockStr)
                .replace(/\[재고\]/g, stockStr)
                .replace(/\[주문수량\]/g, orderSumStr)
                .replace(/\[노쇼고객\]/g, p._noshow_string || "")
                .replace(/@@/g, '@')
        }).join("\n");

        setEditableText(result);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterType, activeTemplateIdx, templates, selectedDate, products, orders, orderItems, qtyMap]);

    const updateTemplate = (idx: number, val: string) => {
        const newT = [...templates]
        newT[idx] = val
        setTemplates(newT)
    }

    const addTemplate = () => {
        setTemplates([...templates, ""])
        setActiveTemplateIdx(templates.length)
    }

    const deleteTemplate = (idx: number) => {
        if (templates.length <= 1) return alert("최소 1개의 템플릿은 유지해야 합니다.")
        if (!confirm("이 템플릿을 삭제하시겠습니까?")) return
        const newT = templates.filter((_, i) => i !== idx)
        setTemplates(newT)
        // Adjust active index
        if (activeTemplateIdx >= newT.length) {
            setActiveTemplateIdx(newT.length - 1)
        } else if (activeTemplateIdx === idx) {
            setActiveTemplateIdx(0)
        } else if (activeTemplateIdx > idx) {
            setActiveTemplateIdx(activeTemplateIdx - 1)
        }
    }

    const saveTemplatesToDB = async () => {
        setIsSaving(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const filteredTags = crmTags.filter((t: any) => t.type !== 'util_template')
        const newTags = [...filteredTags, { type: 'util_template', templates }]
        
        const { error } = await supabase.from('store_settings').upsert({
            store_id: user.id,
            crm_tags: newTags
        })
        
        if (error) {
            alert("저장 중 오류가 발생했습니다: " + error.message)
        } else {
            setCrmTags(newTags)
            alert("템플릿이 영구 저장되었습니다. 나중에 다시 로그인해도 그대로 불러옵니다!")
        }
        setIsSaving(false)
    }

    const copyToClipboard = () => {
        if (!editableText) return alert("생성된 문구가 없습니다.")
        navigator.clipboard.writeText(editableText)
        alert("✅ 메시지가 복사되었습니다!\n\n카카오채널이나 인스타그램 공지에 바로 붙여넣기 하세요.")
    }

    return (
        <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto pb-10 px-2 lg:px-4">
            <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 border-b border-border/80 pb-4">
                    <span className="bg-orange-500 text-white px-2 py-0.5 rounded-md text-xl mr-2 shadow-sm">부가기능</span>
                    단축 문구 템플릿 생성기
                </h2>
                <p className="text-muted-foreground">
                    현재 등록된 전체 상품의 마감/재고 리스트를 템플릿과 합성하여 한 번에 생성합니다. 자동 생성된 텍스트를 복사하기 전에 미리보기 창에서 직접 편집할 수 있습니다.
                </p>
            </div>

            <div className="grid md:grid-cols-[1fr_1fr] gap-6 mt-2">
                {/* Left Col: Setup */}
                <div className="space-y-6">
                    <GuideBadge text="특정 날짜의 품절 혹은 재고가 남은 상품을 선택할 수 있습니다." className="block">
                    <Card className="shadow-sm border-blue-100 bg-white">
                        <CardHeader className="bg-blue-50/50 pb-4 border-b border-blue-100">
                            <CardTitle className="text-lg flex items-center gap-2 text-blue-900">
                                <Blocks className="w-5 h-5 text-blue-500" />
                                1. 대상 상품 필터
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 pb-5 grid sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold text-slate-700">판매 일자 기준</Label>
                                <Select value={selectedDate} onValueChange={setSelectedDate}>
                                    <SelectTrigger className="w-full bg-slate-50 border-input h-10 shadow-sm font-bold text-sm">
                                        <SelectValue placeholder="일자 선택" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">전체 일자 및 상시판매</SelectItem>
                                        {hasRegular && <SelectItem value="regular">상시판매제품</SelectItem>}
                                        {uniqueDates.map((date: any) => (
                                            <SelectItem key={date} value={date}>{date} 픽업/예약건</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold text-slate-700">상태 기준</Label>
                                <Select value={filterType} onValueChange={setFilterType}>
                                    <SelectTrigger className="w-full bg-slate-50 border-input h-10 shadow-sm font-bold text-sm">
                                        <SelectValue placeholder="재고 상태" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">상태 무관 (전체)</SelectItem>
                                        <SelectItem value="soldout"><span className="text-rose-600">품절 (마감) 처리된 상품만</span></SelectItem>
                                        <SelectItem value="instock"><span className="text-emerald-600">현재 잔여 재고가 있는 상품만</span></SelectItem>
                                        <SelectItem value="noshow"><span className="text-indigo-600">미수령 고객이 있는 상품만</span></SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                    </Card>
                    </GuideBadge>

                    <GuideBadge text="템플릿을 추가하거나 삭제할 수 있습니다. 템플릿 지정 후 문구를 생성해 카톡에 복사해 원활히 소통하세요." className="block h-full">
                    <Card className="shadow-sm border-indigo-100 bg-white h-full flex flex-col">
                        <CardHeader className="bg-indigo-50/50 pb-4 border-b border-indigo-100">
                            <CardTitle className="text-lg flex items-center gap-2 text-indigo-900">
                                <MessageCircle className="w-5 h-5 text-indigo-500" />
                                2. 메시지 템플릿 저장소
                            </CardTitle>
                            <CardDescription className="text-xs mt-1">
                                자동 치환 가능한 변수: <strong className="text-indigo-700 font-mono bg-indigo-100 px-1 rounded">[상품명]</strong>, <strong className="text-indigo-700 font-mono bg-indigo-100 px-1 rounded">[수량]</strong>, <strong className="text-indigo-700 font-mono bg-indigo-100 px-1 rounded">[주문수량]</strong>, <strong className="text-indigo-700 font-mono bg-indigo-100 px-1 rounded">[노쇼고객]</strong>
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-4 grid gap-3">
                            {templates.map((t, i) => (
                                <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${activeTemplateIdx === i ? 'border-indigo-400 bg-indigo-50/40 shadow-sm' : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100/50'}`}>
                                    <div className="mt-2.5">
                                        <input
                                            type="radio"
                                            name="templateGroup"
                                            checked={activeTemplateIdx === i}
                                            onChange={() => setActiveTemplateIdx(i)}
                                            className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                        />
                                    </div>
                                    <div className="w-full space-y-1.5 focus-within:text-indigo-900">
                                        <Label className={`text-xs font-bold ${activeTemplateIdx === i ? 'text-indigo-700' : 'text-slate-500'}`}>템플릿 {i + 1} 슬롯</Label>
                                        <div className="flex gap-2">
                                            <Input
                                                value={t}
                                                onChange={e => updateTemplate(i, e.target.value)}
                                                onFocus={() => setActiveTemplateIdx(i)}
                                                placeholder="자주 쓰는 공지 문구를 입력하세요. (예: [상품명] 마감)"
                                                className={`h-9 font-medium shadow-sm active:ring-indigo-500 focus-visible:ring-indigo-500 ${activeTemplateIdx === i ? 'bg-white border-indigo-300' : 'bg-transparent border-slate-300 text-slate-500 shadow-none'}`}
                                            />
                                            <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-400 hover:text-rose-500 hover:bg-rose-50/50 shrink-0" onClick={() => deleteTemplate(i)}>
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <Button variant="outline" className="w-full mt-2 border-dashed border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700" onClick={addTemplate}>
                                <Plus className="w-4 h-4 mr-2" />
                                템플릿 추가하기
                            </Button>
                            <Button onClick={saveTemplatesToDB} disabled={isSaving} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-sm gap-1.5">
                                {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Blocks className="w-3.5 h-3.5" />}
                                템플릿 저장
                            </Button>
                        </CardContent>
                    </Card>
                    </GuideBadge>
                </div>

                {/* Right Col: Result */}
                <div className="space-y-6">
                    <Card className="shadow-md border-emerald-200 h-full flex flex-col bg-gradient-to-br from-white to-emerald-50/50 sticky top-4">
                        <CardHeader className="pb-4 border-b border-emerald-100 bg-white/50 backdrop-blur-sm">
                            <CardTitle className="text-xl flex items-center gap-2 text-emerald-900">
                                <RefreshCw className="w-5 h-5 text-emerald-600" />
                                자동 완성 대시보드
                            </CardTitle>
                            <CardDescription>조건에 맞는 여러 상품이 나열됩니다. 직접 텍스트를 수정하거나 덧붙인 후 복사하세요.</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6 flex-1 flex flex-col p-6 md:p-8 relative">

                            <textarea
                                value={editableText}
                                onChange={(e) => setEditableText(e.target.value)}
                                placeholder="생성된 텍스트가 없습니다."
                                className="w-full h-[350px] min-h-[250px] bg-white border-2 border-emerald-300 rounded-xl p-4 shadow-inner text-base font-semibold text-slate-800 leading-relaxed resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                            />

                            <div className="absolute top-1 right-2 flex gap-1">
                                <Badge className="bg-emerald-100/50 text-emerald-800 hover:bg-emerald-200 border-none font-medium">실시간 변환 완료</Badge>
                            </div>

                        </CardContent>
                        <CardFooter className="bg-emerald-100/30 border-t border-emerald-200 p-6 flex flex-col gap-3 mt-auto">
                            <Button onClick={copyToClipboard} size="lg" className="w-full text-lg h-14 font-extrabold bg-emerald-600 hover:bg-emerald-700 gap-2.5 shadow-md transition-transform active:scale-[0.98]">
                                <Copy className="w-5 h-5" /> 생성된 문구 일괄 복사하기
                            </Button>
                            <p className="text-xs text-center text-emerald-800 font-semibold opacity-80">템플릿 변경 시 수동으로 입력한 내용은 덮어씌워지니 주의하세요.</p>
                        </CardFooter>
                    </Card>
                </div>
            </div>
        </div>
    )
}

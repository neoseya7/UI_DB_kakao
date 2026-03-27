"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Copy, Blocks, RefreshCw, MessageCircle } from "lucide-react"

export default function UtilitiesPage() {
    const [products, setProducts] = useState<any[]>([])
    
    // Fetch real products from DB
    useEffect(() => {
        const fetchProducts = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data, error } = await supabase
                .from('products')
                .select('*')
                .eq('store_id', user.id)
                .order('created_at', { ascending: false })
            
            if (data) setProducts(data)
        }
        fetchProducts()
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
            
            // Stock logic
            if (filterType === "all") return true;
            if (filterType === "soldout") return p.allocated_stock === 0;
            if (filterType === "instock") return p.allocated_stock > 0;
            return true;
        });

        const result = filtered.map(p => {
            const prodName = p.display_name || p.collect_name;
            const stockStr = (p.allocated_stock || 0).toString();
            return template
                .replace(/\[상품명\]/g, prodName)
                .replace(/\[수량\]/g, stockStr)
                .replace(/\[재고\]/g, stockStr)
        }).join("\n");

        setEditableText(result);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterType, activeTemplateIdx, templates]);

    const updateTemplate = (idx: number, val: string) => {
        const newT = [...templates]
        newT[idx] = val
        setTemplates(newT)
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
                    <Card className="shadow-sm border-blue-100 bg-white">
                        <CardHeader className="bg-blue-50/50 pb-4 border-b border-blue-100">
                            <CardTitle className="text-lg flex items-center gap-2 text-blue-900">
                                <Blocks className="w-5 h-5 text-blue-500" />
                                1. 대상 상품 필터
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 grid sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold text-slate-700">판매 일자 기준</Label>
                                <Select value={selectedDate} onValueChange={setSelectedDate}>
                                    <SelectTrigger className="w-full bg-slate-50 border-input h-10 shadow-sm font-bold text-sm">
                                        <SelectValue placeholder="일자 선택" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">전체 일자 및 상시판매</SelectItem>
                                        {hasRegular && <SelectItem value="regular">매장 구비 제품 (상시판매)</SelectItem>}
                                        {uniqueDates.map((date: any) => (
                                            <SelectItem key={date} value={date}>{date} 픽업/예약건</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold text-slate-700">재고 상태 기준</Label>
                                <Select value={filterType} onValueChange={setFilterType}>
                                    <SelectTrigger className="w-full bg-slate-50 border-input h-10 shadow-sm font-bold text-sm">
                                        <SelectValue placeholder="재고 상태" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">상태 무관 (전체)</SelectItem>
                                        <SelectItem value="soldout"><span className="text-rose-600">품절 (마감) 처리된 상품만</span></SelectItem>
                                        <SelectItem value="instock"><span className="text-emerald-600">현재 잔여 재고가 있는 상품만</span></SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm border-indigo-100 bg-white">
                        <CardHeader className="bg-indigo-50/50 pb-4 border-b border-indigo-100">
                            <CardTitle className="text-lg flex items-center gap-2 text-indigo-900">
                                <MessageCircle className="w-5 h-5 text-indigo-500" />
                                2. 메시지 템플릿 저장소 (최대 5개)
                            </CardTitle>
                            <CardDescription className="text-xs">
                                자동 치환 가능한 변수: <strong className="text-indigo-700 font-mono bg-indigo-100 px-1 rounded">[상품명]</strong>, <strong className="text-indigo-700 font-mono bg-indigo-100 px-1 rounded">[수량]</strong>
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
                                        <Input
                                            value={t}
                                            onChange={e => updateTemplate(i, e.target.value)}
                                            onFocus={() => setActiveTemplateIdx(i)}
                                            placeholder="자주 쓰는 공지 문구를 입력하세요. (예: [상품명] ма감)"
                                            className={`h-9 font-medium shadow-sm active:ring-indigo-500 focus-visible:ring-indigo-500 ${activeTemplateIdx === i ? 'bg-white border-indigo-300' : 'bg-transparent border-slate-300 text-slate-500 shadow-none'}`}
                                        />
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
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

"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Search, CalendarDays, ImageIcon, Eye, EyeOff, Trash2 } from "lucide-react"
import { GuideBadge } from "@/components/ui/guide-badge"

export default function ProductsPage() {
    const [storeId, setStoreId] = useState<string | null>(null)
    const [products, setProducts] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [filterDate, setFilterDate] = useState<string>("all")
    const [editingProductId, setEditingProductId] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState("")
    const [sortOrder, setSortOrder] = useState("latest")

    // Shared Clone Dialog States
    const [isSharedDialogOpen, setIsSharedDialogOpen] = useState(false)
    const [sharedProducts, setSharedProducts] = useState<any[]>([])
    const [isLoadingShared, setIsLoadingShared] = useState(false)
    const [sharedBrandName, setSharedBrandName] = useState<string>("")
    const [searchSharedQuery, setSearchSharedQuery] = useState("")

    // Delete Mode states
    const [isDeleteMode, setIsDeleteMode] = useState(false)
    const [selectedDeleteProductIds, setSelectedDeleteProductIds] = useState<string[]>([])

    // Form states
    const [formData, setFormData] = useState({
        target_date: new Date().toISOString().split('T')[0],
        collect_name: "",
        display_name: "",
        price: "",
        incoming_price: "",
        allocated_stock: "",
        deadline_date: "",
        deadline_time: "",
        description: "",
        image_url: "",
        image_urls: [] as string[],
        is_visible: true,
        is_stocked: false,
        box_quantity: ""
    })
    const [selectedImageFiles, setSelectedImageFiles] = useState<File[]>([])
    const [isSaving, setIsSaving] = useState(false)

    // Search and filter UX (Duplicate detection logic)
    const isDuplicate = formData.collect_name.length > 0 && products.some(p => p.collect_name === formData.collect_name && p.target_date !== formData.target_date)
    const duplicateProduct = products.find(p => p.collect_name === formData.collect_name && p.target_date !== formData.target_date)

    useEffect(() => {
        let channel: any = null;

        const initData = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                setStoreId(user.id)
                await fetchProducts(user.id)

                channel = supabase
                    .channel('products_realtime')
                    .on(
                        'postgres_changes',
                        { event: '*', schema: 'public', table: 'products' },
                        (payload) => {
                            fetchProducts(user.id)
                        }
                    )
                    .subscribe()
            }
            setIsLoading(false)
        }
        initData()

        return () => {
            if (channel) supabase.removeChannel(channel)
        }
    }, [])

    const fetchProducts = async (sid: string) => {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('store_id', sid)
            .eq('is_hidden', false)
            .order('created_at', { ascending: false })
            
        if (data) {
            const productIds = data.map(p => p.id);
            const qtyMap: Record<string, number> = {};
            
            if (productIds.length > 0) {
                const { data: rpcData, error: rpcErr } = await supabase.rpc('get_product_sales_sum', {
                    p_store_id: sid,
                    p_product_ids: productIds
                });

                if (rpcData && !rpcErr) {
                    for (const item of rpcData) {
                        qtyMap[item.product_id] = parseInt(item.total_quantity, 10) || 0;
                    }
                } else {
                    console.error("RPC Error:", rpcErr);
                }
            }

            const enhancedProducts = data.map(p => ({
                ...p,
                orderSum: qtyMap[p.id] || 0,
                remainingStock: p.allocated_stock !== null ? Math.max(0, p.allocated_stock - (qtyMap[p.id] || 0)) : null
            }))

            setProducts(enhancedProducts)
        }
    }

    const handleSaveProduct = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!storeId) return

        if (editingProductId) {
            const originalProduct = products.find(p => p.id === editingProductId)
            const oldDate = originalProduct?.target_date || ""
            const newDate = formData.target_date || ""

            if (originalProduct && oldDate !== newDate) {
                const { count, error } = await supabase.from('order_items').select('*', { count: 'exact', head: true }).eq('product_id', editingProductId)
                
                if (count && count > 0) {
                    alert("⚠️ 이미 주문이 있는 상품입니다.\n날짜를 변경하시려면 반드시 [주문관리] 메뉴의 '상품 픽업일 변경' 버튼을 이용해주세요.")
                    return
                }
            }
        }

        setIsSaving(true)
        
        const finalImageUrls = [...formData.image_urls]

        if (selectedImageFiles.length > 0) {
            for (const file of selectedImageFiles) {
                const fileExt = file.name.split('.').pop()
                const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`
                const filePath = `${storeId}/${fileName}`

                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('product-images')
                    .upload(filePath, file)

                if (uploadError) {
                    alert(`이미지 업로드 실패 (${file.name}): ` + uploadError.message)
                    continue
                }

                if (uploadData) {
                    const { data: publicUrlData } = supabase.storage
                        .from('product-images')
                        .getPublicUrl(filePath)
                    finalImageUrls.push(publicUrlData.publicUrl)
                }
            }
        }

        const strictFinalImageUrls = finalImageUrls.slice(0, 10)
        let primaryImageUrl = strictFinalImageUrls.length > 0 ? strictFinalImageUrls[0] : ""

        // 2. 최종 Payload 구성
        let finalStock = 0;
        if (formData.allocated_stock === "") {
            finalStock = 500;
        } else {
            const parsed = parseInt(formData.allocated_stock);
            finalStock = isNaN(parsed) ? 0 : parsed;
        }
        let finalBoxQty = null;
        if (formData.box_quantity !== "") {
            const parsedBox = Number(formData.box_quantity);
            if (!isNaN(parsedBox) && parsedBox > 0) finalBoxQty = parsedBox;
        }

        const payload = {
            store_id: storeId,
            target_date: formData.target_date || null,
            is_regular_sale: !formData.target_date,
            collect_name: formData.collect_name,
            display_name: formData.display_name || formData.collect_name,
            price: parseInt(formData.price) || 0,
            incoming_price: parseInt(formData.incoming_price) || 0,
            allocated_stock: finalStock,
            box_quantity: finalBoxQty,
            deadline_date: formData.deadline_date || null,
            deadline_time: formData.deadline_time || null,
            description: formData.description,
            image_url: primaryImageUrl,
            image_urls: strictFinalImageUrls,
            is_visible: formData.is_visible,
            is_stocked: formData.is_stocked
        }

        if (editingProductId) {
            // Edit existing product
            const { error } = await supabase.from('products').update(payload).eq('id', editingProductId)
            if (!error) {
                alert("상품 정보가 성공적으로 수정되었습니다!")
                setIsDialogOpen(false)
                setEditingProductId(null)
                fetchProducts(storeId)
            } else {
                alert("상품 수정 중 오류가 발생했습니다: " + error.message)
            }
        } else {
            // Create new product
            if (isDuplicate && duplicateProduct) {
                await supabase.from('products').update({ allocated_stock: 0 }).eq('id', duplicateProduct.id)
            }

            const { data: newProd, error } = await supabase.from('products').insert(payload).select().single()

            if (!error && newProd) {
                try {
                    const res = await fetch('/api/products/sync-retroactive', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            store_id: storeId, 
                            product_id: newProd.id, 
                            product_name: newProd.collect_name,
                            target_date: newProd.target_date
                        })
                    })
                    const result = await res.json()
                    if (result.success && result.synced > 0) {
                        alert(`상품 등록 완료! (최근 2일 내 누락되었던 주문 ${result.synced}건이 자동 연동 복구되었습니다 🎉)`)
                    } else {
                        alert("상품이 데이터베이스에 성공적으로 등록되었습니다!")
                    }
                } catch (e) {
                    console.error("Sync Error", e)
                    alert("상품이 데이터베이스에 성공적으로 등록되었습니다!")
                }

                setIsDialogOpen(false)
                setFormData({
                    target_date: new Date().toISOString().split('T')[0],
                    collect_name: "", display_name: "", price: "", incoming_price: "", allocated_stock: "", box_quantity: "", deadline_date: "", deadline_time: "", description: "", image_url: "", image_urls: [], is_visible: true, is_stocked: false
                })
                setSelectedImageFiles([])
                fetchProducts(storeId)
            } else {
                alert("상품 등록 중 오류가 발생했습니다: " + (error?.message || "알 수 없는 에러"))
            }
        }
        setIsSaving(false)
    }

    const openNewProductDialog = () => {
        setEditingProductId(null)
        setFormData({
            target_date: new Date().toISOString().split('T')[0],
            collect_name: "", display_name: "", price: "", incoming_price: "", allocated_stock: "", box_quantity: "", deadline_date: "", deadline_time: "", description: "", image_url: "", image_urls: [], is_visible: true, is_stocked: false
        })
        setSelectedImageFiles([])
        setIsDialogOpen(true)
    }

    const openEditProductDialog = (product: any) => {
        setEditingProductId(product.id)
        
        let loadedUrls: string[] = []
        if (Array.isArray(product.image_urls) && product.image_urls.length > 0) {
            loadedUrls = product.image_urls
        } else if (product.image_url) {
            loadedUrls = [product.image_url]
        }

        setFormData({
            target_date: product.target_date || "",
            collect_name: product.collect_name || "",
            display_name: product.display_name || "",
            price: product.price?.toString() || "",
            incoming_price: product.incoming_price?.toString() || "",
            allocated_stock: product.allocated_stock?.toString() || "0",
            deadline_date: product.deadline_date || "",
            deadline_time: product.deadline_time || "",
            description: product.description || "",
            image_url: product.image_url || "",
            image_urls: loadedUrls,
            is_visible: product.is_visible !== false,
            is_stocked: product.is_stocked === true,
            box_quantity: product.box_quantity?.toString() || ""
        })
        setSelectedImageFiles([])
        setIsDialogOpen(true)
    }

    const handleUpdateStock = async (id: string, newStock: number) => {
        const { error } = await supabase.from('products').update({ allocated_stock: newStock }).eq('id', id)
        if (!error) {
            setProducts(products.map(p => p.id === id ? { 
                ...p, 
                allocated_stock: newStock,
                remainingStock: Math.max(0, newStock - (p.orderSum || 0))
            } : p))
        }
    }

    const handleDeleteProduct = async (id: string) => {
        if (!confirm("이 상품을 삭제하시겠습니까? (기존 주문 기록은 보존됩니다)")) return
        const { error } = await supabase.from('products').update({ is_hidden: true }).eq('id', id)
        if (!error) {
            setProducts(products.filter(p => p.id !== id))
            setIsDialogOpen(false)
        }
    }

    const openSharedProductsDialog = async () => {
        setIsSharedDialogOpen(true)
        setIsLoadingShared(true)
        setSearchSharedQuery("")
        try {
            const res = await fetch(`/api/products/shared?store_id=${storeId}`)
            const json = await res.json()
            if (json.success) {
                setSharedProducts(json.products || [])
                if (json.brand_name) setSharedBrandName(json.brand_name)
            } else {
                setSharedProducts([])
            }
        } catch (e) {
            console.error(e)
            setSharedProducts([])
        } finally {
            setIsLoadingShared(false)
        }
    }

    const handleCloneProduct = async (prod: any) => {
        if (!confirm(`[${prod.display_name || prod.collect_name}] 상품 정보와 이미지를 내 매장으로 복사하시겠습니까?`)) return

        setIsLoadingShared(true)
        const newPayload = {
            store_id: storeId,
            collect_name: prod.collect_name,
            display_name: prod.display_name,
            price: prod.price,
            incoming_price: prod.incoming_price,
            allocated_stock: null, // Reset stock logic on clone
            deadline_date: prod.deadline_date,
            deadline_time: prod.deadline_time,
            description: prod.description,
            image_url: prod.image_url,
            image_urls: prod.image_urls || (prod.image_url ? [prod.image_url] : []),
            is_visible: true,
            is_regular_sale: prod.is_regular_sale,
            box_quantity: prod.box_quantity || null,
            target_date: prod.target_date || new Date().toISOString().split('T')[0]
        }

        const { error } = await supabase.from('products').insert(newPayload)
        setIsLoadingShared(false)

        if (error) {
            alert("상품 복사 실패: " + error.message)
        } else {
            alert("✅ 상품을 성공적으로 복사했습니다! 이제 내 매장 상황에 맞게 수정할 수 있습니다.")
            fetchProducts(storeId!)
            setIsSharedDialogOpen(false)
        }
    }

    const handleBulkStockUpdate = async (status: boolean) => {
        if (!storeId || products.length === 0) return;
        
        const targetProducts = products
            .filter(p => filterDate === "all" || (filterDate === "regular" && p.is_regular_sale) || p.target_date === filterDate)
            .filter(p => {
                if (!searchQuery) return true
                const lowerQ = searchQuery.toLowerCase()
                return (p.collect_name && p.collect_name.toLowerCase().includes(lowerQ)) ||
                       (p.display_name && p.display_name.toLowerCase().includes(lowerQ))
            });

        if (targetProducts.length === 0) {
            alert("변경할 수 있는 상품이 현재 화면에 없습니다.");
            return;
        }

        if (!confirm(`현재 화면에 필터링된 ${targetProducts.length}개의 상품을 모두 [${status ? '입고 완료🟢' : '미입고🔴'}] 상태로 일괄 변경하시겠습니까?`)) return;

        setIsLoading(true);
        const ids = targetProducts.map(p => p.id);
        const { error } = await supabase.from('products').update({ is_stocked: status }).in('id', ids);

        if (!error) {
            setProducts(products.map(p => ids.includes(p.id) ? { ...p, is_stocked: status } : p));
        } else {
            alert("일괄 변경 중 오류가 발생했습니다: " + error.message);
        }
        setIsLoading(false);
    }

    const executeBulkDelete = async () => {
        if (selectedDeleteProductIds.length === 0) return alert("삭제할 상품을 선택해주세요.");
        if (!confirm(`선택된 ${selectedDeleteProductIds.length}개의 상품을 삭제하시겠습니까? (기존 주문 기록은 보존됩니다)`)) return;

        setIsLoading(true);
        const { error } = await supabase.from('products').update({ is_hidden: true }).in('id', selectedDeleteProductIds);
        if (error) {
            console.error(error);
            alert("일부 상품 삭제 중 오류가 발생했습니다: " + error.message);
        } else {
            alert(`총 ${selectedDeleteProductIds.length}개의 상품이 삭제되었습니다.`);
            setIsDeleteMode(false);
            setSelectedDeleteProductIds([]);
            fetchProducts(storeId!);
        }
        setIsLoading(false);
    }

    return (
        <div className="flex flex-col gap-6 w-full max-w-[1900px] mx-auto pb-10 px-2 md:px-4">
            <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-bold tracking-tight">상품 관리</h2>
            </div>

            <div className="flex flex-col xl:flex-row justify-between xl:items-center gap-4 bg-muted/30 p-4 rounded-lg border shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold mr-2 flex items-center gap-1"><CalendarDays className="h-4 w-4" /> 판매 일자 필터:</span>
                    <Button
                        variant={filterDate === "all" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setFilterDate("all")}
                        className="rounded-full shadow-sm transition-all"
                    >
                        전체보기
                    </Button>
                    <Button
                        variant={filterDate === "regular" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setFilterDate("regular")}
                        className="rounded-full shadow-sm transition-all border-emerald-200 text-emerald-700 hover:bg-emerald-50 relative overflow-hidden"
                    >
                        <span className="relative z-10 font-bold">🌟 상시판매</span>
                        {filterDate === "regular" && <div className="absolute inset-0 bg-emerald-100/50 z-0"></div>}
                    </Button>

                    {Array.from(new Set(products.map(p => p.target_date).filter(Boolean))).sort().map(date => (
                        <Button
                            key={date}
                            variant={filterDate === date ? "default" : "outline"}
                            size="sm"
                            onClick={() => setFilterDate(date)}
                            className="rounded-full shadow-sm transition-all"
                        >
                            {date} ({new Date(date).toLocaleDateString('ko-KR', { weekday: 'short' })})
                        </Button>
                    ))}
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-2 w-full xl:w-auto mt-2 xl:mt-0">
                    <div className="flex items-center gap-1.5 mr-auto md:mr-2 shrink-0">
                        <GuideBadge text="특정날짜의 상품을 모두 입고로 전환합니다. 특정 제품만 미입고로 전환하시려면 해당 제품의 수정메뉴에서 가능합니다.">
                        <Button onClick={() => handleBulkStockUpdate(true)} variant="outline" size="sm" className="h-9 border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 font-bold px-2 shadow-sm">전체 입고전환</Button>
                        </GuideBadge>
                        <Button onClick={() => handleBulkStockUpdate(false)} variant="outline" size="sm" className="h-9 border-slate-200 text-slate-600 bg-slate-50 hover:bg-slate-100 font-bold px-2 shadow-sm">미입고로 전환</Button>
                        
                        {isDeleteMode ? (
                            <>
                                <Button onClick={() => { setIsDeleteMode(false); setSelectedDeleteProductIds([]); }} variant="outline" size="sm" className="h-9 font-bold px-2 shadow-sm border-slate-300">취소</Button>
                                <Button onClick={executeBulkDelete} variant="destructive" size="sm" className="h-9 font-bold px-2 shadow-sm gap-1.5"><Trash2 className="w-3.5 h-3.5" />선택 삭제 ({selectedDeleteProductIds.length})</Button>
                            </>
                        ) : (
                            <Button onClick={() => setIsDeleteMode(true)} variant="outline" size="sm" className="h-9 border-rose-200 text-rose-600 hover:bg-rose-50 font-bold px-2 gap-1.5 transition-all shadow-sm"><Trash2 className="w-3.5 h-3.5" />삭제 모드</Button>
                        )}
                    </div>

                    <div className="relative w-full sm:w-[200px]">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="상품명 검색..."
                            className="pl-8 bg-white h-9 text-sm"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <Select value={sortOrder} onValueChange={setSortOrder}>
                        <SelectTrigger className="w-full sm:w-[130px] h-9 bg-white text-sm">
                            <SelectValue placeholder="정렬 방식" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="latest">최신 등록순</SelectItem>
                            <SelectItem value="name_asc">이름 가나다순</SelectItem>
                        </SelectContent>
                    </Select>
                    <GuideBadge text="다른 매장이 먼저등록한 상품을 선택해 빠르게 상품정보를 업데이트할 수 있습니다.">
                    <Button onClick={openSharedProductsDialog} variant="secondary" className="shrink-0 font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 shadow-sm h-9">
                        🎁 타 매장 상품 불러오기
                    </Button>
                    </GuideBadge>
                    <GuideBadge text="새로운 상품을 등록합니다. 박스당 수량을 입력하면 상품카드에 주문수량에 맞춰 박스수량이 표기됩니다.">
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <Button onClick={openNewProductDialog} className="shrink-0 font-medium shadow-sm transition-transform active:scale-95 text-sm h-9">+ 새 상품 등록</Button>
                        </DialogTrigger>
                    </Dialog>
                    </GuideBadge>
                </div>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
                    <form onSubmit={handleSaveProduct}>
                        <DialogHeader>
                            <DialogTitle>{editingProductId ? "상품 정보 수정" : "새 상품 등록"}</DialogTitle>
                            <DialogDescription>특정 날짜에 판매할 상품 정보를 {editingProductId ? "수정" : "입력"}합니다.<br /><span className="text-destructive font-medium">수집상품명과 적용 날짜는 필수 정보입니다.</span></DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-5 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="date">적용 날짜 <span className="text-destructive">*</span></Label>
                                    <Input id="date" type="date" value={formData.target_date} onChange={e => setFormData({ ...formData, target_date: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="collect-name">수집상품명 <span className="text-destructive">*</span></Label>
                                    <Input id="collect-name" placeholder="예: 바닐라마카롱5구" value={formData.collect_name} onChange={e => setFormData({ ...formData, collect_name: e.target.value })} required className="bg-muted/50 focus:bg-background" />
                                </div>
                            </div>

                            <div className="space-y-2 border-t pt-4">
                                <div className="flex items-center justify-between pb-3 mb-1">
                                    <div className="space-y-0.5">
                                        <Label className="text-base text-slate-800 font-bold">상품 카탈로그 노출</Label>
                                        <p className="text-[12px] text-muted-foreground leading-tight">이 상품을 고객 방문자용 상품 리스트에 보여줄지 결정합니다.</p>
                                    </div>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={formData.is_visible ? "default" : "secondary"}
                                        className={`w-24 gap-1.5 shadow-sm transition-all ${formData.is_visible ? 'bg-emerald-600 hover:bg-emerald-700' : 'text-slate-500 bg-slate-200 hover:bg-slate-300'}`}
                                        onClick={() => setFormData({ ...formData, is_visible: !formData.is_visible })}
                                    >
                                        {formData.is_visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                        {formData.is_visible ? "노출 켜짐" : "숨김 처리"}
                                    </Button>
                                </div>
                                <div className="flex items-center justify-between pb-3 mb-1">
                                    <div className="space-y-0.5">
                                        <Label className="text-base text-slate-800 font-bold">오프라인 현장 입고 여부</Label>
                                        <p className="text-[12px] text-muted-foreground leading-tight">입고 처리 시 상품 카드에 강조 스티커가 나타납니다.</p>
                                    </div>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={formData.is_stocked ? "default" : "secondary"}
                                        className={`w-28 gap-1.5 shadow-sm transition-all ${formData.is_stocked ? 'bg-indigo-600 hover:bg-indigo-700 text-white font-bold' : 'text-slate-500 bg-slate-200 hover:bg-slate-300 font-bold'}`}
                                        onClick={() => setFormData({ ...formData, is_stocked: !formData.is_stocked })}
                                    >
                                        {formData.is_stocked ? "🟢 입고 완료" : "🔴 미입고"}
                                    </Button>
                                </div>
                                <Label htmlFor="name">상품명 (고객 노출용 - <span className="font-normal text-muted-foreground">선택사항</span>)</Label>
                                <Input
                                    id="name"
                                    placeholder="미입력 시 수집상품명으로 노출됩니다."
                                    value={formData.display_name}
                                    onChange={e => setFormData({ ...formData, display_name: e.target.value })}
                                />
                                {isDuplicate && duplicateProduct && (
                                    <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-800 text-[13px] font-medium animate-in fade-in slide-in-from-top-1 shadow-sm leading-normal">
                                        ⚠️ <strong>{duplicateProduct.target_date}</strong>에 판매 등록된 동일한 수집상품명이 있습니다.<br />
                                        재고 혼선을 막기 위해, 즉시 자동 이관(기존 재고 0 처리) 로직이 트리거됩니다.
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4 mt-3">
                                <div className="space-y-2">
                                    <Label htmlFor="price">최종 판매 가격</Label>
                                    <Input id="price" type="number" value={formData.price} onChange={e => setFormData({ ...formData, price: e.target.value })} placeholder="예: 15000" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="incoming_price">입고가 (원가)</Label>
                                    <Input id="incoming_price" type="number" value={formData.incoming_price} onChange={e => setFormData({ ...formData, incoming_price: e.target.value })} placeholder="예: 10000" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label htmlFor="stock">발주수량</Label>
                                        {editingProductId && (() => {
                                            const p = products.find(prod => prod.id === editingProductId)
                                            if (p && p.allocated_stock !== null) {
                                                return (
                                                    <div className="flex gap-3 text-[11px] bg-slate-50 px-2 py-0.5 rounded-sm border text-slate-500 shadow-sm mt-1">
                                                        <span className="font-medium tracking-tight">주문: <b className="text-slate-800">{p.orderSum || 0}</b></span>
                                                    </div>
                                                )
                                            }
                                            return null
                                        })()}
                                    </div>
                                    <Input id="stock" type="number" value={formData.allocated_stock} onChange={e => setFormData({ ...formData, allocated_stock: e.target.value })} placeholder="예: 20" />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label htmlFor="box_qty" className="text-emerald-700">1박스당 수량 <span className="text-[10px] text-emerald-600 font-normal">(카드뉴스 표시용)</span></Label>
                                    </div>
                                    <Input id="box_qty" type="number" value={formData.box_quantity} onChange={e => setFormData({ ...formData, box_quantity: e.target.value })} placeholder="예: 10" className="border-emerald-200 focus-visible:ring-emerald-500" />
                                </div>
                            </div>

                            <div className="space-y-3 border-t pt-4">
                                <div className="flex items-center justify-between">
                                    <Label>상품 이미지 첨부 (최대 10장)</Label>
                                    <Badge variant="outline" className="font-mono bg-slate-50 border-slate-200 text-slate-500 shadow-sm">{formData.image_urls.length + selectedImageFiles.length} / 10</Badge>
                                </div>
                                <div className="flex flex-wrap gap-3">
                                    {/* Existing Uploaded Images */}
                                    {formData.image_urls.map((url, idx) => (
                                        <div key={`exist-${idx}`} className="h-20 w-20 relative bg-muted rounded-md overflow-hidden border shadow-sm group">
                                            <img src={url} alt={`저장된 이미지 ${idx + 1}`} className="w-full h-full object-cover" />
                                            <button 
                                                type="button"
                                                onClick={() => setFormData({...formData, image_urls: formData.image_urls.filter((_, i) => i !== idx)})}
                                                className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                                            </button>
                                            {idx === 0 && <span className="absolute bottom-0 inset-x-0 bg-primary/90 text-[9px] text-white text-center font-bold py-0.5">대표</span>}
                                        </div>
                                    ))}
                                    
                                    {/* New Selected Files Preview */}
                                    {selectedImageFiles.map((file, idx) => (
                                        <div key={`new-${idx}`} className="h-20 w-20 relative bg-indigo-50/50 rounded-md overflow-hidden border border-indigo-200 shadow-sm group">
                                            <img src={URL.createObjectURL(file)} alt={`새 첨부 이미지 ${idx + 1}`} className="w-full h-full object-cover opacity-80" />
                                            <div className="absolute inset-x-0 top-0 h-full ring-2 ring-inset ring-indigo-400/50 pointer-events-none rounded-md"></div>
                                            <button 
                                                type="button"
                                                onClick={() => setSelectedImageFiles(selectedImageFiles.filter((_, i) => i !== idx))}
                                                className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                                            </button>
                                            <span className="absolute bottom-1 right-1 bg-indigo-600 text-[8px] text-white px-1 leading-tight rounded-sm font-bold shadow-sm">NEW</span>
                                        </div>
                                    ))}

                                    {/* Add Button */}
                                    {(formData.image_urls.length + selectedImageFiles.length) < 10 && (
                                        <label className="h-20 w-20 cursor-pointer bg-muted/20 hover:bg-indigo-50/50 rounded-md border-2 border-dashed border-slate-300 hover:border-indigo-300 flex flex-col items-center justify-center text-muted-foreground hover:text-indigo-600 transition-colors group shadow-sm">
                                            <input 
                                                type="file" 
                                                multiple 
                                                accept="image/png, image/jpeg, image/jpg, image/webp" 
                                                className="hidden" 
                                                onChange={e => {
                                                    const files = Array.from(e.target.files || [])
                                                    const availableSlots = 10 - (formData.image_urls.length + selectedImageFiles.length)
                                                    const filesToAdd = files.slice(0, availableSlots)
                                                    if (filesToAdd.length > 0) {
                                                        setSelectedImageFiles([...selectedImageFiles, ...filesToAdd])
                                                    }
                                                    if (files.length > availableSlots) {
                                                        alert(`최대 10장까지만 업로드 가능합니다. 초과된 ${files.length - availableSlots}장은 제외되었습니다.`)
                                                    }
                                                    e.target.value = ""
                                                }} 
                                            />
                                            <div className="bg-white rounded-full p-1 shadow-sm mb-1 group-hover:scale-110 transition-transform">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                                            </div>
                                            <span className="text-[10px] font-bold">사진 첨부</span>
                                        </label>
                                    )}
                                </div>
                                <p className="text-[11px] text-muted-foreground font-medium pt-0.5">여러 장을 선택할 수 있으며, 첫 번째 사진이 썸네일(대표 이미지)이 됩니다. 최대 5MB 권장.</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mt-1 pt-4 border-t border-red-100 bg-red-50/50 p-3 rounded-lg">
                                <div className="space-y-2">
                                    <Label htmlFor="deadline-date" className="text-red-900 font-bold">발주 마감 날짜</Label>
                                    <Input id="deadline-date" type="date" value={formData.deadline_date} onChange={e => setFormData({ ...formData, deadline_date: e.target.value })} className="border-red-200 bg-white" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="deadline-time" className="text-red-900 font-bold">발주 마감 시간</Label>
                                    <Input id="deadline-time" type="time" value={formData.deadline_time} onChange={e => setFormData({ ...formData, deadline_time: e.target.value })} className="border-red-200 bg-white" />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="desc">상세 설명</Label>
                                <textarea id="desc" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="상세 설명을 적어주세요." />
                            </div>
                        </div>
                        <DialogFooter className="flex-col sm:flex-row w-full gap-2 mt-4 sm:justify-between">
                            {editingProductId ? (
                                <Button type="button" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive w-full sm:w-auto" onClick={() => handleDeleteProduct(editingProductId)}>
                                    이 상품 영구 삭제
                                </Button>
                            ) : <div className="hidden sm:block" />}
                            <div className="flex flex-col-reverse sm:flex-row gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                                <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setIsDialogOpen(false)} disabled={isSaving}>취소</Button>
                                <Button type="submit" className="font-semibold w-full sm:w-auto" disabled={isSaving}>
                                    {isSaving ? "처리 중..." : "저장하기"}
                                </Button>
                            </div>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* BRAND TEMPLATE CLONE DIALOG (Option B) */}
            <Dialog open={isSharedDialogOpen} onOpenChange={setIsSharedDialogOpen}>
                <DialogContent className="sm:max-w-[700px] h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <span className="text-xl">🎁 우리 브랜드 상품 가져오기</span>
                            {sharedBrandName && <Badge variant="secondary" className="bg-indigo-100 text-indigo-800 border-indigo-200">{sharedBrandName}</Badge>}
                        </DialogTitle>
                        <DialogDescription>
                            다른 매장들이 올려둔 상품 템플릿입니다.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="relative w-full mt-2 shrink-0">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="불러올 템플릿 상품 이름 검색..."
                            className="pl-9 bg-slate-50 border-indigo-200 focus-visible:ring-indigo-500 shadow-sm"
                            value={searchSharedQuery}
                            onChange={(e) => setSearchSharedQuery(e.target.value)}
                        />
                    </div>

                    <div className="flex-1 overflow-y-auto pr-2 mt-4 space-y-4">
                        {isLoadingShared ? (
                            <div className="py-20 text-center text-muted-foreground animate-pulse font-medium">✨ 브랜드 카탈로그를 조회 중입니다...</div>
                        ) : sharedProducts.length === 0 ? (
                            <div className="py-20 text-center text-muted-foreground">
                                현재 등록된 [우리 브랜드] 상품 템플릿이 없습니다.<br />
                                <span className="text-sm">가맹점 가입 시 브랜드명을 정확히 입력했는지 확인해 주세요.</span>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {sharedProducts
                                    .filter(p => {
                                        if (!searchSharedQuery) return true;
                                        const q = searchSharedQuery.toLowerCase();
                                        return (p.collect_name && p.collect_name.toLowerCase().includes(q)) || 
                                               (p.display_name && p.display_name.toLowerCase().includes(q));
                                    })
                                    .map(prod => (
                                    <div key={prod.id} className="border rounded-lg overflow-hidden flex flex-col bg-white shadow-sm hover:border-indigo-300 transition-colors">
                                        {prod.image_url || (prod.image_urls && prod.image_urls.length > 0) ? (
                                            <div className="w-full h-32 bg-slate-100 relative">
                                                <img src={prod.image_urls && prod.image_urls.length > 0 ? prod.image_urls[0] : prod.image_url} alt="상품" className="w-full h-full object-cover" />
                                                {prod.image_urls && prod.image_urls.length > 1 && (
                                                    <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 font-bold shadow-sm backdrop-blur-sm">
                                                       <ImageIcon className="w-3 h-3" /> +{prod.image_urls.length - 1}
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="w-full h-32 bg-slate-50 flex items-center justify-center text-slate-300">
                                                <ImageIcon className="w-8 h-8 opacity-20" />
                                            </div>
                                        )}
                                        <div className="p-3 flex-1 flex flex-col">
                                            <div className="font-bold text-sm mb-1 truncate">{prod.display_name || prod.collect_name}</div>
                                            <div className="text-xs text-muted-foreground flex-1 line-clamp-2 mb-2">{prod.description || "상세 설명 없음"}</div>
                                            <div className="text-sm font-semibold text-slate-700 mb-3">{prod.price ? `${prod.price.toLocaleString()}원` : '가격 미정'}</div>
                                            <Button onClick={(e) => { e.preventDefault(); handleCloneProduct(prod); }} size="sm" className="w-full font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200">
                                                [내 매장으로 복사]
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {
                isLoading ? (
                    <div className="py-20 text-center text-muted-foreground animate-pulse">DB에서 상품 목록을 불러오는 중입니다...</div>
                ) : products.length === 0 ? (
                    <div className="py-20 text-center text-muted-foreground border-2 border-dashed rounded-xl border-muted">등록된 상품이 없습니다. [+ 새 상품 등록] 버튼을 눌러 추가해주세요.</div>
                ) : (
                    <GuideBadge text="발주량을 직접 수정할 수 있습니다. 주문과 잔여수량이 표기되며, 잔여가 0이 되면 주문이 수집되지 않습니다." className="w-full">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                        {products
                            .filter(p => filterDate === "all" || (filterDate === "regular" && p.is_regular_sale) || p.target_date === filterDate)
                            .filter(p => {
                                if (!searchQuery) return true
                                const lowerQ = searchQuery.toLowerCase()
                                return (p.collect_name && p.collect_name.toLowerCase().includes(lowerQ)) ||
                                    (p.display_name && p.display_name.toLowerCase().includes(lowerQ))
                            })
                            .sort((a, b) => {
                                if (sortOrder === "name_asc") {
                                    return (a.collect_name || "").localeCompare(b.collect_name || "")
                                }
                                return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
                            })
                            .map((product) => (
                                <Card
                                    key={product.id}
                                    className={`relative overflow-hidden flex flex-col shadow-sm border transition-all duration-200 cursor-pointer ${isDeleteMode ? (selectedDeleteProductIds.includes(product.id) ? 'ring-2 ring-rose-500 bg-rose-50/20 shadow-md transform scale-[0.98]' : 'hover:border-rose-300 opacity-90') : (product.allocated_stock === 0 ? 'border-red-200/60 bg-red-50/10' : 'hover:border-primary/50 hover:shadow-md')}`}
                                    onClick={() => {
                                        if (isDeleteMode) {
                                            setSelectedDeleteProductIds(prev => prev.includes(product.id) ? prev.filter(x => x !== product.id) : [...prev, product.id])
                                        } else {
                                            openEditProductDialog(product)
                                        }
                                    }}
                                >
                                    {isDeleteMode && (
                                        <div className="absolute top-2.5 right-2.5 z-20 pointer-events-none">
                                            <Checkbox
                                                checked={selectedDeleteProductIds.includes(product.id)}
                                                className="h-6 w-6 border-rose-300 data-[state=checked]:bg-rose-500 bg-white shadow-sm"
                                            />
                                        </div>
                                    )}
                                    <CardHeader className="pb-1 pt-3 flex flex-row items-start justify-between gap-1.5 px-3">
                                        <div className="flex flex-col gap-1 w-full">
                                            <CardTitle className="text-[14px] leading-tight font-bold text-slate-800 line-clamp-2" title={product.collect_name}>
                                                {product.is_visible === false && <span className="inline-flex items-center gap-0.5 bg-slate-100 text-slate-500 border border-slate-200 px-1 py-0 rounded-sm text-[9px] font-bold mr-1 align-middle shadow-sm"><EyeOff className="w-2.5 h-2.5" />숨김</span>}
                                                {product.is_stocked && <span className="inline-flex items-center gap-0.5 bg-indigo-100 text-indigo-700 border border-indigo-200 px-1 py-0 rounded-sm text-[10px] font-extrabold mr-1 align-middle shadow-sm tracking-tight">입고🟢</span>}
                                                {product.collect_name}
                                            </CardTitle>
                                            <div className="flex items-center gap-1.5">
                                                {product.is_regular_sale ? (
                                                    <Badge className="bg-blue-500 hover:bg-blue-600 shadow-sm px-1.5 py-0 text-[10px]">상시판매</Badge>
                                                ) : (
                                                    <Badge variant="secondary" className="shadow-sm px-1.5 py-0 bg-slate-100 border-slate-200 text-slate-700 text-[10px] font-mono">{product.target_date}</Badge>
                                                )}
                                            </div>
                                        </div>
                                        {product.allocated_stock === 0 && <Badge variant="destructive" className="shadow-sm shrink-0 whitespace-nowrap text-[10px] px-1.5 py-0">품절</Badge>}
                                    </CardHeader>
                                    <CardContent className="mt-auto px-3 pb-3 pt-0">
                                        <div className={`flex w-full items-center justify-between p-1 px-1.5 rounded-md border ${product.remainingStock === 0 ? 'bg-red-50/50 border-red-200/50' : 'bg-slate-50 border-slate-200'}`} onClick={(e) => e.stopPropagation()}>
                                            <div className="flex flex-col items-center">
                                                <span className={`text-[9px] font-bold whitespace-nowrap ${product.allocated_stock === 0 ? 'text-red-700' : 'text-slate-500'}`}>발주</span>
                                                <Input
                                                    type="number"
                                                    defaultValue={product.allocated_stock}
                                                    onBlur={(e) => {
                                                        if (e.target.value !== String(product.allocated_stock)) {
                                                            handleUpdateStock(product.id, parseInt(e.target.value) || 0)
                                                        }
                                                    }}
                                                    className={`w-[42px] h-5 text-[10px] text-center font-bold px-0 py-0 shadow-none border-b border-transparent hover:border-slate-300 bg-transparent focus:bg-white transition-colors ${product.allocated_stock === 0 ? 'text-red-700' : ''}`}
                                                    title="수정하려면 클릭하세요"
                                                />
                                            </div>
                                            <div className="w-[1px] h-6 bg-slate-200"></div>
                                            <div className="flex flex-col items-center pt-0.5">
                                                <span className="text-[9px] text-slate-500 font-bold whitespace-nowrap">주문</span>
                                                <div className="flex items-baseline gap-0.5 h-5">
                                                    <span className="text-[11px] font-bold text-slate-800">{product.orderSum || 0}</span>
                                                    {product.box_quantity && product.box_quantity > 0 && (product.orderSum || 0) > 0 && (
                                                        <span className="text-[10px] text-indigo-600 font-bold tracking-tighter">({((product.orderSum || 0) / product.box_quantity).toFixed(1).replace('.0', '')}bx)</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="w-[1px] h-6 bg-slate-200"></div>
                                            <div className="flex flex-col items-center pt-0.5 pr-1">
                                                <span className="text-[9px] text-slate-500 font-bold whitespace-nowrap items-center gap-0.5">잔여</span>
                                                <span className={`text-[11px] font-bold h-5 leading-5 tracking-tight ${product.remainingStock === 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                                    {product.remainingStock ?? '-'}
                                                </span>
                                            </div>
                                        </div>
                                        <p className="text-[8px] text-center text-muted-foreground mt-1.5 mb-0 tracking-tight font-medium">영역 클릭시 상품 상세 모달창 오픈</p>
                                    </CardContent>
                                </Card>
                            ))}
                    </div>
                    </GuideBadge>
                )
            }
        </div >
    )
}

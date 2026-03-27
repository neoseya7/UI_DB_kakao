"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Search, CalendarDays, ImageIcon, Eye, EyeOff } from "lucide-react"

export default function ProductsPage() {
    const [storeId, setStoreId] = useState<string | null>(null)
    const [products, setProducts] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [filterDate, setFilterDate] = useState<string>("all")
    const [editingProductId, setEditingProductId] = useState<string | null>(null)

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
        is_visible: true
    })
    const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null)
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
            .order('created_at', { ascending: false })
        if (data) setProducts(data)
    }

    const handleSaveProduct = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!storeId) return

        setIsSaving(true)
        let finalImageUrl = formData.image_url

        // 1. 이미지 파일이 새로 선택된 경우 Storage에 업로드
        if (selectedImageFile) {
            const fileExt = selectedImageFile.name.split('.').pop()
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`
            const filePath = `${storeId}/${fileName}`

            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('product-images')
                .upload(filePath, selectedImageFile)

            if (uploadError) {
                alert("이미지 업로드 실패 (버킷 권한 및 이름을 확인해주세요): " + uploadError.message)
                setIsSaving(false)
                return
            }

            if (uploadData) {
                const { data: publicUrlData } = supabase.storage
                    .from('product-images')
                    .getPublicUrl(filePath)
                finalImageUrl = publicUrlData.publicUrl
            }
        }

        // 2. 최종 Payload 구성
        let finalStock = parseInt(formData.allocated_stock) || 0
        const payload = {
            store_id: storeId,
            target_date: formData.target_date || null,
            is_regular_sale: !formData.target_date,
            collect_name: formData.collect_name,
            display_name: formData.display_name || formData.collect_name,
            price: parseInt(formData.price) || 0,
            incoming_price: parseInt(formData.incoming_price) || 0,
            allocated_stock: finalStock,
            deadline_date: formData.deadline_date || null,
            deadline_time: formData.deadline_time || null,
            description: formData.description,
            image_url: finalImageUrl,
            is_visible: formData.is_visible
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

            const { error } = await supabase.from('products').insert(payload)

            if (!error) {
                alert("상품이 데이터베이스에 성공적으로 등록되었습니다!")
                setIsDialogOpen(false)
                setFormData({
                    target_date: new Date().toISOString().split('T')[0],
                    collect_name: "", display_name: "", price: "", incoming_price: "", allocated_stock: "", deadline_date: "", deadline_time: "", description: "", image_url: ""
                })
                setSelectedImageFile(null)
                fetchProducts(storeId)
            } else {
                alert("상품 등록 중 오류가 발생했습니다: " + error.message)
            }
        }
        setIsSaving(false)
    }

    const openNewProductDialog = () => {
        setEditingProductId(null)
        setFormData({
            target_date: new Date().toISOString().split('T')[0],
            collect_name: "", display_name: "", price: "", incoming_price: "", allocated_stock: "", deadline_date: "", deadline_time: "", description: "", image_url: "", is_visible: true
        })
        setSelectedImageFile(null)
        setIsDialogOpen(true)
    }

    const openEditProductDialog = (product: any) => {
        setEditingProductId(product.id)
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
            is_visible: product.is_visible !== false
        })
        setSelectedImageFile(null)
        setIsDialogOpen(true)
    }

    const handleUpdateStock = async (id: string, newStock: number) => {
        const { error } = await supabase.from('products').update({ allocated_stock: newStock }).eq('id', id)
        if (!error) {
            setProducts(products.map(p => p.id === id ? { ...p, allocated_stock: newStock } : p))
        }
    }

    const handleDeleteProduct = async (id: string) => {
        if (!confirm("정말 이 상품을 영구 삭제하시겠습니까? (DB에서 제거됩니다)")) return
        const { error } = await supabase.from('products').delete().eq('id', id)
        if (!error) {
            setProducts(products.filter(p => p.id !== id))
            setIsDialogOpen(false)
        }
    }

    return (
        <div className="flex flex-col gap-6 w-full max-w-6xl mx-auto pb-10">
            <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-bold tracking-tight">상품 관리</h2>
                <p className="text-muted-foreground">특정 날짜에 고객에게 선보일 상품 정보가 실제 데이터베이스에 실시간 동기화됩니다.</p>
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
                            {date}
                        </Button>
                    ))}
                </div>

                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button onClick={openNewProductDialog} className="shrink-0 font-medium shadow-sm transition-transform active:scale-95 text-sm h-9">+ 새 상품 등록</Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[480px]">
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
                                <div className="space-y-2">
                                    <Label htmlFor="stock">당일 할당 픽업(재고) 수량</Label>
                                    <Input id="stock" type="number" value={formData.allocated_stock} onChange={e => setFormData({ ...formData, allocated_stock: e.target.value })} placeholder="예: 20" />
                                </div>

                                <div className="space-y-3 border-t pt-4">
                                    <Label>대표 이미지 첨부</Label>
                                    <div className="flex items-center gap-4">
                                        {formData.image_url || selectedImageFile ? (
                                            <div className="h-16 w-16 relative bg-muted rounded-md overflow-hidden border flex-shrink-0 shadow-sm">
                                                <img
                                                    src={selectedImageFile ? URL.createObjectURL(selectedImageFile) : formData.image_url}
                                                    alt="미리보기"
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                        ) : (
                                            <div className="h-16 w-16 bg-muted/40 rounded-md border-2 border-dashed flex items-center justify-center text-muted-foreground flex-shrink-0">
                                                <ImageIcon className="h-6 w-6 opacity-50" />
                                            </div>
                                        )}
                                        <div className="flex-1 space-y-1.5">
                                            <Input
                                                type="file"
                                                accept="image/png, image/jpeg, image/jpg, image/webp"
                                                onChange={e => {
                                                    const file = e.target.files?.[0];
                                                    if (file) setSelectedImageFile(file);
                                                }}
                                                className="cursor-pointer file:text-primary file:font-semibold file:bg-primary/10 file:border-0 file:rounded-md file:mr-4 file:px-3 file:-ml-2 file:-my-2 h-9"
                                            />
                                            <p className="text-[11px] text-muted-foreground font-medium">최대 5MB, 1:1 비율 이미지를 권장합니다.</p>
                                        </div>
                                    </div>
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
                            <DialogFooter className="sm:justify-between w-full gap-2 mt-4">
                                {editingProductId ? (
                                    <Button type="button" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive w-full sm:w-auto" onClick={() => handleDeleteProduct(editingProductId)}>
                                        이 상품 영구 삭제
                                    </Button>
                                ) : <div />}
                                <div className="flex gap-2 w-full sm:w-auto">
                                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSaving}>취소</Button>
                                    <Button type="submit" className="font-semibold" disabled={isSaving}>
                                        {isSaving ? "처리 중..." : "데이터베이스에 저장하기"}
                                    </Button>
                                </div>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            {isLoading ? (
                <div className="py-20 text-center text-muted-foreground animate-pulse">DB에서 상품 목록을 불러오는 중입니다...</div>
            ) : products.length === 0 ? (
                <div className="py-20 text-center text-muted-foreground border-2 border-dashed rounded-xl border-muted">등록된 상품이 없습니다. [+ 새 상품 등록] 버튼을 눌러 추가해주세요.</div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                    {products
                        .filter(p => filterDate === "all" || (filterDate === "regular" && p.is_regular_sale) || p.target_date === filterDate)
                        .map((product) => (
                            <Card
                                key={product.id}
                                className={`overflow-hidden flex flex-col shadow-sm border transition-all duration-200 cursor-pointer ${product.allocated_stock === 0 ? 'border-red-200/60 bg-red-50/10' : 'hover:border-primary/50 hover:shadow-md'}`}
                                onClick={() => openEditProductDialog(product)}
                            >
                                <CardHeader className="pb-2 pt-4 flex flex-row items-start justify-between gap-2">
                                    <div className="flex flex-col gap-1.5 w-full">
                                        <CardTitle className="text-base leading-tight font-bold text-slate-800 line-clamp-2" title={product.collect_name}>
                                            {product.is_visible === false && <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded-sm text-[10px] font-bold mr-1.5 align-text-bottom shadow-sm"><EyeOff className="w-3 h-3" />숨김</span>}
                                            {product.collect_name}
                                        </CardTitle>
                                        <div className="flex items-center gap-2">
                                            {product.is_regular_sale ? (
                                                <Badge className="bg-blue-500 hover:bg-blue-600 shadow-sm px-2 py-0 text-[11px]">상시판매</Badge>
                                            ) : (
                                                <Badge variant="secondary" className="shadow-sm px-2 py-0 bg-slate-100 border-slate-200 text-slate-700 text-[11px] font-mono">{product.target_date}</Badge>
                                            )}
                                        </div>
                                    </div>
                                    {product.allocated_stock === 0 && <Badge variant="destructive" className="shadow-sm shrink-0 whitespace-nowrap">품절</Badge>}
                                </CardHeader>
                                <CardContent className="mt-auto px-4 pb-4 pt-0">
                                    <div className={`flex items-center justify-between gap-3 p-2 rounded-md border ${product.allocated_stock === 0 ? 'bg-red-50/50 border-red-200/50' : 'bg-muted/30 border-border/50'}`} onClick={(e) => e.stopPropagation()}>
                                        <span className={`text-[11px] font-bold tracking-tight whitespace-nowrap ${product.allocated_stock === 0 ? 'text-red-700' : 'text-slate-500'}`}>수동재고 제한</span>
                                        <Input
                                            type="number"
                                            defaultValue={product.allocated_stock}
                                            onBlur={(e) => {
                                                if (e.target.value !== String(product.allocated_stock)) {
                                                    handleUpdateStock(product.id, parseInt(e.target.value) || 0)
                                                }
                                            }}
                                            className={`w-16 h-7 text-center font-bold px-1 py-0 shadow-inner ${product.allocated_stock === 0 ? 'text-red-700 border-red-300' : ''}`}
                                        />
                                    </div>
                                    <p className="text-[10px] text-center text-muted-foreground mt-2 mb-0">상세정보 열기 및 수정하기</p>
                                </CardContent>
                            </Card>
                        ))}
                </div>
            )}
        </div>
    )
}

"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Search, CalendarDays } from "lucide-react"

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
        allocated_stock: "",
        deadline_date: "",
        deadline_time: "",
        description: ""
    })

    // Search and filter UX (Duplicate detection logic)
    const isDuplicate = formData.collect_name.length > 0 && products.some(p => p.collect_name === formData.collect_name && p.target_date !== formData.target_date)
    const duplicateProduct = products.find(p => p.collect_name === formData.collect_name && p.target_date !== formData.target_date)

    useEffect(() => {
        const initData = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                setStoreId(user.id)
                await fetchProducts(user.id)
            }
            setIsLoading(false)
        }
        initData()
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

        let finalStock = parseInt(formData.allocated_stock) || 0

        const payload = {
            store_id: storeId,
            target_date: formData.target_date || null,
            is_regular_sale: !formData.target_date,
            collect_name: formData.collect_name,
            display_name: formData.display_name || formData.collect_name,
            price: parseInt(formData.price) || 0,
            allocated_stock: finalStock,
            deadline_date: formData.deadline_date || null,
            deadline_time: formData.deadline_time || null,
            description: formData.description
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
                    collect_name: "", display_name: "", price: "", allocated_stock: "", deadline_date: "", deadline_time: "", description: ""
                })
                fetchProducts(storeId)
            } else {
                alert("상품 등록 중 오류가 발생했습니다: " + error.message)
            }
        }
    }

    const openNewProductDialog = () => {
        setEditingProductId(null)
        setFormData({
            target_date: new Date().toISOString().split('T')[0],
            collect_name: "", display_name: "", price: "", allocated_stock: "", deadline_date: "", deadline_time: "", description: ""
        })
        setIsDialogOpen(true)
    }

    const openEditProductDialog = (product: any) => {
        setEditingProductId(product.id)
        setFormData({
            target_date: product.target_date || "",
            collect_name: product.collect_name || "",
            display_name: product.display_name || "",
            price: product.price?.toString() || "",
            allocated_stock: product.allocated_stock?.toString() || "0",
            deadline_date: product.deadline_date || "",
            deadline_time: product.deadline_time || "",
            description: product.description || ""
        })
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
                                        <Label htmlFor="stock">당일 할당 재고</Label>
                                        <Input id="stock" type="number" value={formData.allocated_stock} onChange={e => setFormData({ ...formData, allocated_stock: e.target.value })} placeholder="예: 20" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 mt-3 pt-4 border-t border-red-100 bg-red-50/50 p-3 rounded-lg">
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
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} className="w-full sm:w-auto">취소</Button>
                                <Button type="submit" className="w-full sm:w-auto font-semibold">데이터베이스에 저장하기</Button>
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
                <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 mt-2">
                    {products
                        .filter(p => filterDate === "all" || p.target_date === filterDate)
                        .map(product => (
                            <Card key={product.id} className={`overflow-hidden flex flex-col shadow-sm border-border/80 transition-colors duration-200 ${product.allocated_stock === 0 ? 'border-red-200/60 bg-red-50/10' : 'hover:border-primary/50'}`}>
                                <div className="h-40 bg-muted/40 relative flex flex-col items-center justify-center border-b group">
                                    <span className="text-muted-foreground text-sm flex flex-col items-center gap-2">이미지 (추후개발)</span>
                                    {product.is_regular_sale ? (
                                        <Badge className="absolute top-3 right-3 bg-blue-500 hover:bg-blue-600 shadow-sm px-2 py-0.5 z-10">상시 판매중</Badge>
                                    ) : (
                                        <Badge variant="secondary" className="absolute top-3 right-3 shadow-sm px-2 py-0.5 z-10 bg-white border-slate-200">{product.target_date}</Badge>
                                    )}
                                    {product.allocated_stock === 0 && <Badge variant="destructive" className="absolute top-3 left-3 px-2 py-0.5 shadow-sm z-10">품절</Badge>}
                                </div>
                                <CardHeader className="pb-2 pt-4">
                                    <CardDescription className="text-xs font-mono mb-1 truncate text-muted-foreground bg-muted/50 px-2 py-0.5 rounded w-fit">수집 ID: {product.collect_name}</CardDescription>
                                    <CardTitle className={`text-lg leading-tight line-clamp-1 mt-1 ${product.allocated_stock === 0 ? 'text-red-950' : ''}`}>{product.display_name}</CardTitle>
                                    <div className="flex justify-between items-end mt-2">
                                        <span className="font-semibold text-foreground text-lg tracking-tight">{product.price.toLocaleString()}<span className="text-sm font-normal text-muted-foreground">원</span></span>
                                    </div>
                                </CardHeader>
                                <CardContent className="mt-auto space-y-4 pt-3">
                                    <div className={`flex flex-col gap-1.5 p-3 rounded-md border ${product.allocated_stock === 0 ? 'bg-red-50/50 border-red-200/50' : 'bg-muted/20 border-border/50'}`}>
                                        <span className={`text-xs font-semibold uppercase tracking-wider flex justify-between ${product.allocated_stock === 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                                            <span>임의 수동 재고 변경</span>
                                        </span>
                                        <div className="flex items-center gap-2 mt-1">
                                            <Input
                                                type="number"
                                                defaultValue={product.allocated_stock}
                                                onBlur={(e) => {
                                                    if (e.target.value !== String(product.allocated_stock)) {
                                                        handleUpdateStock(product.id, parseInt(e.target.value) || 0)
                                                    }
                                                }}
                                                className="w-full font-bold h-9 bg-background focus:ring-1"
                                            />
                                        </div>
                                    </div>
                                </CardContent>
                                <CardFooter className="pt-0 flex gap-2">
                                    <Button onClick={() => openEditProductDialog(product)} variant="secondary" className="w-full text-primary border border-primary/20 hover:bg-primary/5 hover:text-primary font-bold shadow-sm">정보 수정</Button>
                                    <Button onClick={() => handleDeleteProduct(product.id)} variant="outline" className="w-full text-destructive border-destructive/20 hover:bg-destructive/10 hover:text-destructive font-bold shadow-sm">영구 삭제</Button>
                                </CardFooter>
                            </Card>
                        ))}
                </div>
            )}
        </div>
    )
}

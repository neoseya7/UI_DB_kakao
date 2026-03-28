"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Calendar as CalendarIcon, Printer, ListCollapse, Search, PlusCircle, ArrowRightLeft, UploadCloud, DownloadCloud, Trash2 } from "lucide-react"
import { useRef } from "react"
import * as XLSX from 'xlsx'

type Product = { id: string, name: string, price: number, required: number, stock: number, target_date?: string, is_regular_sale?: boolean }
type Order = { id: string, name: string, items: number[], memo1: string, memo2: string, checked: boolean }

export default function PickupCalendarPage() {
    const [storeId, setStoreId] = useState<string | null>(null)
    const [isMerged, setIsMerged] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0, isUploading: false })

    const [posSyncEnabled, setPosSyncEnabled] = useState(false)
    const [selectedPosOrders, setSelectedPosOrders] = useState<string[]>([])
    const [isPosPaying, setIsPosPaying] = useState(false)

    const [currentDate, setCurrentDate] = useState(() => {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    })

    const [searchTerm, setSearchTerm] = useState("")
    const [searchScope, setSearchScope] = useState("today")
    const [receiptFilter, setReceiptFilter] = useState("all")

    const [newNick, setNewNick] = useState("")
    const [newDate, setNewDate] = useState("")
    const [newProductId, setNewProductId] = useState<string>("")
    const [newQty, setNewQty] = useState("")

    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false)
    const [transferSourceDate, setTransferSourceDate] = useState("")
    const [transferProductIdx, setTransferProductIdx] = useState<string>("")
    const [transferNewDate, setTransferNewDate] = useState("")
    const [isTransferToRegular, setIsTransferToRegular] = useState(false)

    const [products, setProducts] = useState<Product[]>([])
    const [rawCustomers, setRawCustomers] = useState<Order[]>([])

    useEffect(() => {
        const initUser = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                setStoreId(user.id)
                const { data: sData } = await supabase.from('store_settings').select('crm_tags').eq('store_id', user.id).single()
                if (sData) {
                    const isPosEnabled = sData.crm_tags?.find((t:any) => t.type === 'setting' && t.key === 'pos_sync_enabled')?.value ?? false;
                    setPosSyncEnabled(isPosEnabled)
                }
            }
        }
        initUser()
    }, [])

    useEffect(() => {
        if (storeId) {
            fetchMatrixData()
            setSelectedPosOrders([])
        }
    }, [storeId, currentDate, searchScope])

    const fetchMatrixData = async () => {
        if (!storeId) return
        setIsLoading(true)

        // 1. Fetch active products
        let pQuery = supabase.from('products').select('*').eq('store_id', storeId)
        if (searchScope === "today") {
            pQuery = pQuery.or(`target_date.eq.${currentDate},is_regular_sale.eq.true`)
        }
        const { data: pData } = await pQuery

        const mappedProducts = (pData || []).map(p => ({
            id: p.id,
            name: p.display_name || p.collect_name,
            price: p.price || 0,
            required: p.allocated_stock || 0,
            stock: p.allocated_stock || 0,
            target_date: p.target_date,
            is_regular_sale: p.is_regular_sale
        }))
        setProducts(mappedProducts)

        // 2. Fetch orders
        let oQuery = supabase.from('orders').select('*').eq('store_id', storeId)
        if (searchScope === "today") oQuery = oQuery.eq('pickup_date', currentDate)
        const { data: oData } = await oQuery
        const orders = oData || []

        if (orders.length === 0) {
            setRawCustomers([])
            setIsLoading(false)
            return
        }

        const orderIds = orders.map(o => o.id)

        // 3. Fetch order items
        const { data: oiData } = await supabase.from('order_items').select('*').in('order_id', orderIds)
        const orderItems = oiData || []

        // 4. Transform into matrix rows
        const mappedCustomers = orders.map(o => {
            const myItems = orderItems.filter(oi => oi.order_id === o.id)
            const itemsArray = mappedProducts.map(p => {
                const match = myItems.find(oi => oi.product_id === p.id)
                return match ? match.quantity : 0
            })

            return {
                id: o.id,
                name: o.customer_nickname,
                items: itemsArray,
                memo1: o.customer_memo_1 || "",
                memo2: o.customer_memo_2 || "",
                checked: o.is_received || false
            }
        })

        setRawCustomers(mappedCustomers)
        setIsLoading(false)
    }

    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !storeId) return

        try {
            setIsLoading(true)
            const buffer = await file.arrayBuffer()
            const wb = XLSX.read(buffer, { type: 'array' })
            const ws = wb.Sheets[wb.SheetNames[0]]
            const data = XLSX.utils.sheet_to_json(ws) as any[]

            if (data.length === 0) {
                alert("엑셀 파일에 데이터가 없습니다.")
                return
            }

            const orderMap = new Map<string, any>()

            for (const row of data) {
                const customerName = (row['고객명'] || "").toString().trim()
                const pickupDateObj = row['픽업일']
                let productName = (row['상품명'] || "").toString().trim()
                const qty = parseInt(row['발주수량'] || row['수량'] || "1") || 1
                const priceStr = row['가격'] || row['단가'] || "0"
                const price = parseInt(priceStr.toString().replace(/,/g, '')) || 0
                const isConfirmed = row['주문확인'] === 'O' || row['주문확인'] === 'o' || row['주문확인'] === 'Y' || row['주문확인'] === true
                const memo1 = (row['고객비고1'] || "").toString().trim()
                const memo2 = (row['고객비고2'] || "").toString().trim()

                if (!customerName || !pickupDateObj || !productName) continue

                let formattedDate = pickupDateObj.toString().trim()
                if (typeof pickupDateObj === 'number') {
                    const dateObj = new Date(Math.round((pickupDateObj - 25569) * 86400 * 1000))
                    formattedDate = dateObj.toISOString().split('T')[0]
                }

                const key = `${customerName}_${formattedDate}`
                if (!orderMap.has(key)) {
                    orderMap.set(key, { customerName, pickupDate: formattedDate, memos: [memo1, memo2], items: [], isReceived: isConfirmed })
                }
                orderMap.get(key).items.push({ productName, qty, price })
            }

            const newOrders = Array.from(orderMap.values())
            if (newOrders.length === 0) {
                alert("유효한 데이터 포맷을 찾을 수 없습니다. (고객명, 픽업일, 상품명 필수)")
                return
            }

            setUploadProgress({ current: 0, total: newOrders.length, isUploading: true })

            let successCount = 0
            const localProducts = [...products]

            for (let i = 0; i < newOrders.length; i++) {
                const order = newOrders[i]
                const { data: oData, error: oErr } = await supabase.from('orders').insert({
                    store_id: storeId,
                    pickup_date: order.pickupDate,
                    customer_nickname: order.customerName,
                    is_received: order.isReceived,
                    customer_memo_1: order.memos[0] || "",
                    customer_memo_2: order.memos[1] || ""
                }).select().single()

                if (oData && !oErr) {
                    for (const item of order.items) {
                        let matchedProduct = localProducts.find(p => p.name === item.productName || p.name.includes(item.productName))

                        if (!matchedProduct) {
                            const { data: newProd, error: pErr } = await supabase.from('products').insert({
                                store_id: storeId,
                                collect_name: item.productName,
                                display_name: item.productName,
                                target_date: order.pickupDate,
                                is_regular_sale: false,
                                price: item.price || 0,
                                allocated_stock: 0
                            }).select().single()

                            if (newProd && !pErr) {
                                matchedProduct = { id: newProd.id, name: item.productName, price: item.price || 0, required: 0, stock: 0 }
                                localProducts.push(matchedProduct)
                            }
                        } else if (item.price && item.price > 0) {
                            await supabase.from('products').update({ price: item.price }).eq('id', matchedProduct.id)
                        }

                        if (matchedProduct) {
                            await supabase.from('order_items').insert({
                                order_id: oData.id,
                                product_id: matchedProduct.id,
                                quantity: item.qty
                            })
                        }
                    }
                    successCount++
                }
                setUploadProgress(prev => ({ ...prev, current: i + 1 }))
            }

            alert(`완료! 총 ${successCount}건의 주문 내역이 성공적으로 업로드되었습니다.`)
            fetchMatrixData()
        } catch (err: any) {
            console.error("Excel import error:", err)
            alert(`처리 중 에러가 발생했습니다: ${err.message}`)
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = ""
            setUploadProgress({ current: 0, total: 0, isUploading: false })
            setIsLoading(false)
        }
    }

    const handleDownloadTemplate = () => {
        const ws = XLSX.utils.json_to_sheet([{
            "고객명": "홍길동",
            "픽업일": "2026-03-31",
            "상품명": "딸기모찌",
            "발주수량": 2,
            "가격": 15000,
            "주문확인": "X",
            "고객비고1": "비고작성",
            "고객비고2": ""
        }])
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, "일괄등록양식")
        XLSX.writeFile(wb, "일괄등록_엑셀양식.xlsx")
    }

    const handleTransferDate = async () => {
        if (!transferProductIdx || !storeId) return alert("상품을 선택해주세요.")
        if (!isTransferToRegular && !transferNewDate) return alert("이동할 새로운 픽업 날짜나 '상시판매' 전환을 선택해주세요.")

        const idx = parseInt(transferProductIdx)
        const targetProduct = products[idx]
        const sourceDate = transferSourceDate || currentDate

        if (!confirm(`[${targetProduct.name}] 상품 속성과 대상 주문들을 일괄 반영하시겠습니까?`)) return

        setIsLoading(true)

        // Find orders on the specified sourceDate
        const { data: oData } = await supabase.from('orders').select('id').eq('store_id', storeId).eq('pickup_date', sourceDate)
        if (oData && oData.length > 0) {
            const orderIds = oData.map((o: any) => o.id)
            const { data: oiData } = await supabase.from('order_items').select('order_id').eq('product_id', targetProduct.id).in('order_id', orderIds)

            if (oiData && oiData.length > 0) {
                const affectedOrderIds = oiData.map((oi: any) => oi.order_id)
                if (isTransferToRegular) {
                    await supabase.from('products').update({ is_regular_sale: true, target_date: null }).eq('id', targetProduct.id)
                } else {
                    for (const oId of affectedOrderIds) {
                        await supabase.from('orders').update({ pickup_date: transferNewDate }).eq('id', oId)
                    }
                    await supabase.from('products').update({ target_date: transferNewDate, is_regular_sale: false }).eq('id', targetProduct.id)
                }
            } else {
                // Product has no orders but we update it anyway
                if (isTransferToRegular) await supabase.from('products').update({ is_regular_sale: true, target_date: null }).eq('id', targetProduct.id)
                else await supabase.from('products').update({ target_date: transferNewDate, is_regular_sale: false }).eq('id', targetProduct.id)
            }
        } else {
            // No orders exist on source date, just update the Product itself
            if (isTransferToRegular) await supabase.from('products').update({ is_regular_sale: true, target_date: null }).eq('id', targetProduct.id)
            else await supabase.from('products').update({ target_date: transferNewDate, is_regular_sale: false }).eq('id', targetProduct.id)
        }

        alert("✅ 이관 및 상품 동기화 반영이 완료되었습니다.")
        setIsTransferModalOpen(false)
        fetchMatrixData()
    }

    const handleAddOrder = async () => {
        if (!newNick || !newProductId || !newQty) {
            alert("입력값을 확인해주세요.")
            return
        }

        setIsLoading(true)
        const qty = parseInt(newQty)
        const pId = newProductId
        const actualDate = newDate || currentDate

        const { data: oData, error: oErr } = await supabase.from('orders').insert({
            store_id: storeId,
            pickup_date: actualDate,
            customer_nickname: newNick,
            is_received: false
        }).select().single()

        if (oData) {
            await supabase.from('order_items').insert({
                order_id: oData.id,
                product_id: pId,
                quantity: qty
            })
            setNewNick("")
            setNewQty("")
            fetchMatrixData()
        } else {
            alert("주문 추가 실패: " + oErr?.message)
            setIsLoading(false)
        }
    }

    const toggleCheck = async (id: string, current: boolean) => {
        await supabase.from('orders').update({ is_received: !current }).eq('id', id)
        setRawCustomers(prev => prev.map(c => c.id === id ? { ...c, checked: !current } : c))
    }

    const handleDeleteOrder = async (id: string, name: string) => {
        if (!confirm(`[${name}] 고객의 이 주문 내역을 완전히 삭제하시겠습니까?`)) return

        setIsLoading(true)
        try {
            const res = await fetch('/api/orders/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
            const result = await res.json();
            
            if (result.success) {
                setRawCustomers(prev => prev.filter(c => c.id !== id))
            } else {
                alert("주문 삭제 실패: " + (result.error || "알 수 없는 오류"))
            }
        } catch (err: any) {
            alert("서버 통신 오류: " + err.message)
        }
        setIsLoading(false)
    }

    const handleUpdateMemo = async (id: string, field: 'customer_memo_1' | 'customer_memo_2', val: string) => {
        await supabase.from('orders').update({ [field]: val }).eq('id', id)
    }

    const handleUpdateProductField = async (productId: string, field: 'price' | 'allocated_stock', value: string) => {
        if (!productId) return;
        const numValue = parseInt(value) || 0
        const { error } = await supabase.from('products').update({ [field]: numValue }).eq('id', productId)
        if (!error) {
            setProducts(prev => prev.map(p => p.id === productId ? { ...p, [field === 'allocated_stock' ? 'stock' : 'price']: numValue } : p))
        } else {
            console.error(error)
            alert("상품 정보 업데이트 실패: " + error.message)
        }
    }

    const changeDate = (days: number) => {
        const d = new Date(currentDate)
        d.setDate(d.getDate() + days)
        const yyyy = d.getFullYear()
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const dd = String(d.getDate()).padStart(2, '0')
        setCurrentDate(`${yyyy}-${mm}-${dd}`)
    }

    const togglePosSelect = (id: string) => {
        setSelectedPosOrders(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    }

    const executePosPayment = async () => {
        setIsPosPaying(true)
        // Hardware delay mock
        await new Promise(r => setTimeout(r, 3500))
        
        alert("✅ POS 결제가 성공적으로 승인되었습니다!\n(실제 VAN사 연동 시 이 시점에 결제완료 데이터가 넘어옵니다.)")
        
        // Mock successful UI update
        for (const id of selectedPosOrders) {
            await supabase.from('orders').update({ is_received: true }).eq('id', id)
            setRawCustomers(prev => prev.map(c => c.id === id ? { ...c, checked: true } : c))
        }
        setSelectedPosOrders([])
        setIsPosPaying(false)
    }

    const customers = isMerged
        ? rawCustomers.reduce((acc, current) => {
            const existing = acc.find(item => item.name === current.name)
            if (existing) {
                const mergedItems = existing.items.map((qty, idx) => qty + current.items[idx])
                const mergedMemo1 = Array.from(new Set([existing.memo1, current.memo1].filter(Boolean))).join(", ")
                const mergedMemo2 = Array.from(new Set([existing.memo2, current.memo2].filter(Boolean))).join(", ")
                return acc.map(item => item.name === current.name ? {
                    ...item, items: mergedItems, memo1: mergedMemo1, memo2: mergedMemo2, checked: existing.checked && current.checked
                } : item)
            } else {
                return [...acc, { ...current }]
            }
        }, [] as Order[])
        : rawCustomers

    const filteredCustomers = customers.filter(c => {
        const matchName = c.name.toLowerCase().includes(searchTerm.toLowerCase())
        const matchReceipt = receiptFilter === "unreceived" ? !c.checked : (receiptFilter === "received" ? c.checked : true)
        return matchName && matchReceipt
    })

    const getSummary = (items: number[]) => {
        return items.map((qty, index) => qty > 0 ? `${products[index]?.name} ${qty}개` : null).filter(Boolean).join(" / ")
    }

    const calculatePosTotal = () => {
        return filteredCustomers.filter(c => selectedPosOrders.includes(c.id)).reduce((total, c) => {
            return total + c.items.reduce((t, qty, idx) => t + (qty * (products[idx]?.price || 0)), 0)
        }, 0)
    }

    const togglePosSelectAll = () => {
        const available = filteredCustomers.filter(c => !c.checked && c.id)
        if (selectedPosOrders.length === available.length) {
            setSelectedPosOrders([])
        } else {
            setSelectedPosOrders(available.map(c => c.id))
        }
    }

    const handleExportExcel = () => {
        if (filteredCustomers.length === 0) return alert("추출할 데이터가 없습니다.")

        const dataRows = filteredCustomers.map(c => {
            const row: any = {
                "고객명": c.name,
                "수령확인": c.checked ? "O" : "X",
                "주문 요약": getSummary(c.items),
                "결제 금액": c.items.reduce((total: number, qty: number, idx: number) => total + (qty * (products[idx]?.price || 0)), 0),
                "비고 1": c.memo1,
                "비고 2": c.memo2
            }
            products.forEach((p, i) => {
                row[p.name] = c.items[i] > 0 ? c.items[i] : ""
            })
            return row
        })

        const totalRow: any = {
            "고객명": "총 합계",
            "수령확인": "",
            "주문 요약": "",
            "결제 금액": rawCustomers.reduce((globalTotal, c) => globalTotal + c.items.reduce((t: number, q: number, idx: number) => t + (q * (products[idx]?.price || 0)), 0), 0),
            "비고 1": "",
            "비고 2": ""
        }
        products.forEach((p, i) => {
            const sum = rawCustomers.reduce((acc, curr) => acc + (curr.items[i] || 0), 0)
            totalRow[p.name] = sum > 0 ? sum : ""
        })
        dataRows.push(totalRow)

        const ws = XLSX.utils.json_to_sheet(dataRows)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, "픽업명단")

        const fileName = `픽업명단_${currentDate.replace(/-/g, '')}.xlsx`
        XLSX.writeFile(wb, fileName)
    }

    return (
        <div className="flex flex-col gap-6 w-full mx-auto pb-10 max-w-[1900px] px-2 md:px-4">
            {uploadProgress.isUploading && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-white p-8 rounded-xl shadow-2xl w-96 text-center flex flex-col gap-5 border border-slate-200">
                        <h3 className="text-xl font-bold text-slate-800">엑셀 데이터 업로드 중</h3>
                        <p className="text-sm text-slate-500">안전한 등록을 위해 창을 닫지 마세요...</p>
                        <div className="h-4 bg-slate-100 overflow-hidden rounded-full border border-slate-200 w-full relative">
                            <div className="absolute top-0 left-0 h-full bg-emerald-500 transition-all duration-300 ease-out shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                                style={{ width: `${Math.max(5, (uploadProgress.current / uploadProgress.total) * 100)}%` }} />
                        </div>
                        <p className="text-base font-bold text-emerald-600 font-mono tracking-wider">{uploadProgress.current} / {uploadProgress.total}</p>
                    </div>
                </div>
            )}

            <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-bold tracking-tight">주문관리</h2>
                <p className="text-muted-foreground">판매 등록된 상품과 수집된 주문정보를 교차 조회합니다.</p>
            </div>

            <div className="flex flex-col gap-4 bg-muted/20 p-4 rounded-lg border shadow-sm">
                {/* 1번째 줄: 날짜 선택과 검색 영역 */}
                <div className="flex flex-col xl:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-2 sm:gap-4 w-full xl:w-auto">
                        <CalendarIcon className="h-5 w-5 text-muted-foreground hidden sm:block shrink-0" />
                        <div className="flex flex-nowrap gap-1.5 sm:gap-2 items-center w-full xl:w-auto">
                            <Button onClick={() => changeDate(-1)} variant="outline" size="sm" className="font-semibold bg-background h-10 px-2.5 sm:px-4 shrink-0">
                                ◀<span className="hidden min-[380px]:inline ml-1">이전</span>
                            </Button>
                            <Input
                                type="date"
                                className="flex-1 xl:flex-none items-center justify-center px-2 sm:px-4 h-10 font-bold text-[15px] sm:text-lg bg-background border rounded-md min-w-[130px] shadow-sm text-center"
                                value={currentDate}
                                onChange={(e) => setCurrentDate(e.target.value)}
                            />
                            <Button onClick={() => changeDate(1)} variant="outline" size="sm" className="font-semibold bg-background h-10 px-2.5 sm:px-4 shrink-0">
                                <span className="hidden min-[380px]:inline mr-1">다음</span>▶
                            </Button>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 w-full xl:w-auto bg-muted/30 p-1.5 rounded-md border shrink-0">
                        <div className="flex gap-2">
                            <Select value={searchScope} onValueChange={setSearchScope}>
                                <SelectTrigger className="w-full sm:w-[130px] h-10 bg-white border-muted shadow-sm font-medium">
                                    <SelectValue placeholder="검색 범위" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="today">해당 날짜만</SelectItem>
                                    <SelectItem value="all_dates" className="text-blue-600 font-semibold">모든 날짜(전체)</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={receiptFilter} onValueChange={setReceiptFilter}>
                                <SelectTrigger className="w-full sm:w-[120px] h-10 bg-white border-muted shadow-sm font-medium">
                                    <SelectValue placeholder="수령 상태" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">모든 상태</SelectItem>
                                    <SelectItem value="unreceived" className="text-orange-600 font-semibold">미수령만</SelectItem>
                                    <SelectItem value="received" className="text-emerald-600 font-semibold">수령만</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="relative w-full sm:w-[220px]">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="닉네임 검색... (예: 김철)"
                                className="pl-9 bg-white h-10 w-full shadow-sm"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                {/* 2번째 줄: 액션 버튼 그룹 */}
                <div className="flex flex-col md:flex-row flex-wrap items-center justify-between xl:justify-end gap-3 border-t pt-4 border-slate-200/60 mt-2">
                    
                    <div className="flex flex-col sm:flex-row items-center gap-2 bg-indigo-50/50 p-1.5 rounded-md border border-indigo-100 shadow-sm w-full xl:w-auto xl:mr-auto">
                        <span className="text-sm font-bold flex items-center gap-1.5 min-w-[max-content] text-indigo-900 border-r border-indigo-200 px-2 shrink-0">
                            <PlusCircle className="h-4 w-4" /> 수동 추가
                        </span>
                        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                            <Input type="date" value={newDate || currentDate} onChange={e => { setNewDate(e.target.value); setNewProductId(""); }} className="w-[125px] h-9 bg-white shadow-sm shrink-0 px-2" />
                            <Input placeholder="닉네임" value={newNick} onChange={e => setNewNick(e.target.value)} className="w-[85px] h-9 bg-white shadow-sm shrink-0 px-2" />
                            <Select value={newProductId} onValueChange={setNewProductId}>
                                <SelectTrigger className="w-[130px] h-9 bg-white shadow-sm shrink-0 px-2">
                                    <SelectValue placeholder="상품명" />
                                </SelectTrigger>
                                <SelectContent>
                                    {products.filter(p => p.is_regular_sale || p.target_date === (newDate || currentDate)).map((p) => (
                                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Input type="number" placeholder="수량" value={newQty} onChange={e => setNewQty(e.target.value)} className="w-[60px] h-9 bg-white shadow-sm shrink-0 px-2" min="1" />
                            <Button onClick={handleAddOrder} size="sm" className="h-9 bg-indigo-600 hover:bg-indigo-700 text-white min-w-[50px] shadow-sm shrink-0 px-3">
                                등록
                            </Button>
                        </div>
                    </div>

                    <Dialog open={isTransferModalOpen} onOpenChange={setIsTransferModalOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline" className="gap-2 bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100 shadow-sm transition-all h-10 w-full sm:w-auto px-3 shrink-0">
                                <ArrowRightLeft className="h-4 w-4" /> 상품 픽업일 변경
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[480px]">
                            <DialogHeader>
                                <DialogTitle>픽업일 일괄 변경 및 상시판매 전환</DialogTitle>
                                <DialogDescription>
                                    기존 날짜에 속한 상품의 주문들을 다른 날짜로 일괄 이동하거나,<br />물품을 '상시판매' 카테고리로 강제 동기화합니다.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-5 py-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold">1. 기존 날짜 선택 (From)</label>
                                    <Input type="date" value={transferSourceDate || currentDate} onChange={e => setTransferSourceDate(e.target.value)} className="bg-white border-primary/40 focus-visible:ring-primary/50" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold">2. 대상 상품 선택</label>
                                    <Select value={transferProductIdx} onValueChange={setTransferProductIdx}>
                                        <SelectTrigger className="w-full bg-white">
                                            <SelectValue placeholder="상품 선택" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {products.map((p, i) => (
                                                <SelectItem key={i} value={i.toString()}>{p.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-3 border-t pt-4">
                                    <label className="text-sm font-semibold text-primary">3. 목적지 (변경 날짜 / 상시판매)</label>
                                    <div className="flex flex-col gap-3">
                                        <div className="flex items-center gap-2 mb-1 p-2 bg-emerald-50 rounded border border-emerald-100">
                                            <Checkbox id="regularSaleToggle" checked={isTransferToRegular} onCheckedChange={(val) => setIsTransferToRegular(!!val)} className="data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600" />
                                            <label htmlFor="regularSaleToggle" className="text-sm font-semibold text-emerald-800 cursor-pointer">이 상품을 '상시판매' 모드로 전환합니다.</label>
                                        </div>
                                        <Input type="date" value={transferNewDate} onChange={e => setTransferNewDate(e.target.value)} disabled={isTransferToRegular} className="bg-white border-primary/40 focus-visible:ring-primary/50 disabled:opacity-50 disabled:bg-slate-100" />
                                    </div>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsTransferModalOpen(false)}>취소</Button>
                                <Button onClick={handleTransferDate} className="bg-amber-600 hover:bg-amber-700 font-bold border-none text-white shadow-sm">이동 적용하기</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx, .xls" onChange={handleFileUpload} />

                    <div className="flex items-center gap-1.5 bg-emerald-50/50 p-1 border border-emerald-100 rounded-md w-full sm:w-auto justify-center">
                        <Button variant="outline" className="gap-1.5 bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-100 shadow-sm h-8 px-3 transition-colors" onClick={() => fileInputRef.current?.click()}>
                            <UploadCloud className="h-3.5 w-3.5" /> 엑셀 일괄등록
                        </Button>
                        <Button onClick={handleDownloadTemplate} variant="ghost" size="sm" className="h-8 px-2 text-emerald-700/80 hover:text-emerald-900 border border-transparent hover:bg-emerald-100" title="엑셀 등록 양식 다운로드">
                            <DownloadCloud className="h-3.5 w-3.5" /> 양식받기
                        </Button>
                        <div className="w-px h-4 bg-emerald-200 mx-1" />
                        <Button onClick={handleExportExcel} variant="default" size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm h-8 px-3 transition-colors">
                            <DownloadCloud className="h-3.5 w-3.5" /> 현재 날짜 추출
                        </Button>
                    </div>

                    <Button
                        variant={isMerged ? "default" : "outline"}
                        className={`gap-2 shadow-sm border transition-all h-10 w-full sm:w-auto px-3 ${isMerged ? 'bg-primary' : 'bg-white'}`}
                        onClick={() => setIsMerged(!isMerged)}
                    >
                        <ListCollapse className="h-4 w-4" /> {isMerged ? "병합 취소" : "이름 합치기"}
                    </Button>
                </div>
            </div>

            <Card className="overflow-hidden border-border/60 shadow-md bg-card">
                <div className="overflow-x-auto overflow-y-auto w-full" style={{ maxHeight: "calc(100vh - 360px)" }}>
                    <table className="w-full text-sm text-center border-collapse min-w-max relative">
                        <thead className="bg-muted/90 sticky top-0 z-30 shadow-[0_2px_4px_rgba(0,0,0,0.05)]">
                            <tr>
                                <th rowSpan={6} className="border-b border-r p-3 w-[100px] sm:w-[160px] min-w-[100px] sm:min-w-[160px] max-w-[100px] sm:max-w-[160px] bg-muted/90 sticky left-0 z-40 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)] whitespace-nowrap text-xs sm:text-sm">
                                    <div className="flex items-center gap-2 font-semibold">
                                        {posSyncEnabled && (
                                            <Checkbox 
                                                disabled={isMerged || filteredCustomers.filter(c => !c.checked).length === 0} 
                                                checked={selectedPosOrders.length > 0 && selectedPosOrders.length === filteredCustomers.filter(c => !c.checked && c.id).length}
                                                onCheckedChange={togglePosSelectAll} 
                                                className="h-4 w-4 shrink-0 border-indigo-300 data-[state=checked]:bg-indigo-600 cursor-pointer disabled:opacity-30" 
                                                title="전체 결제 선택" 
                                            />
                                        )}
                                        <span>고객 닉네임</span>
                                    </div>
                                </th>
                                <th rowSpan={6} className="border-b border-r px-1 sm:px-2 py-3 w-[45px] sm:w-[70px] min-w-[45px] sm:min-w-[70px] max-w-[45px] sm:max-w-[70px] bg-emerald-50/90 whitespace-nowrap align-bottom pb-4 shadow-sm sticky left-[100px] sm:left-[160px] z-40 text-[11px] sm:text-sm tracking-tighter sm:tracking-normal cursor-help" title="수령확인">수령</th>
                                <th rowSpan={6} className="border-b border-r px-2 py-3 min-w-[50px] bg-red-50/90 whitespace-nowrap align-bottom pb-4 shadow-sm">관리</th>
                                <th rowSpan={6} className="border-b border-r px-4 py-3 min-w-[240px] bg-slate-100/90 whitespace-nowrap align-bottom pb-4 shadow-sm text-left resize-x overflow-x-auto overflow-y-hidden">주문 상품 요약</th>
                                <th rowSpan={6} className="border-b border-r px-3 py-3 w-[110px] min-w-[110px] bg-blue-50/90 whitespace-nowrap align-bottom pb-4 shadow-sm text-center">결제 금액</th>
                                <th rowSpan={6} className="border-b border-r p-3 min-w-[120px] bg-indigo-50/90 align-bottom pb-4 shadow-sm resize-x overflow-x-auto overflow-y-hidden">고객 비고 1</th>
                                <th rowSpan={2} className="border-b border-r p-3 min-w-[100px] bg-indigo-50/90 align-bottom pb-4 shadow-sm resize-x overflow-x-auto overflow-y-hidden">고객찜</th>
                                {products.map((p, i) => <th key={i} className="border-b border-r p-1 bg-amber-50/80 font-normal"><Input placeholder="상품 비고 1" className="h-7 text-xs text-center border-transparent bg-transparent" /></th>)}
                            </tr>
                            <tr>
                                {products.map((p, i) => (
                                    <th key={p.id || i} className="border-b border-r p-3 min-w-[140px] max-w-[400px] font-bold text-[15px] whitespace-nowrap bg-muted/80 resize-x overflow-x-auto overflow-y-hidden">
                                        <div>{p.name}</div>
                                        <div className="flex items-center justify-center gap-1 mt-1">
                                            <Input type="number" defaultValue={p.price} onBlur={(e) => handleUpdateProductField(p.id, 'price', e.target.value)} className="h-6 w-[70px] text-[12px] font-mono text-center px-1 py-0 border-slate-300 bg-white shadow-sm" title="가격을 수정하고 바깥을 클릭하면 저장됩니다" />
                                            <span className="text-[12px] text-muted-foreground font-normal">원</span>
                                        </div>
                                    </th>
                                ))}
                            </tr>
                            <tr>
                                <th className="border-b border-r py-2 px-1 bg-blue-50/40 text-[12px] font-bold text-blue-800 tracking-tight">재고수량</th>
                                {products.map((p, i) => (
                                    <th key={p.id || i} className="border-b border-r py-2 px-1 bg-blue-50/40 text-[13px] font-semibold text-blue-800">
                                        <Input type="number" defaultValue={p.stock} onBlur={(e) => handleUpdateProductField(p.id, 'allocated_stock', e.target.value)} className="h-6 w-[50px] text-[13px] font-bold text-center px-1 py-0 mx-auto border-blue-200 bg-white text-blue-800 shadow-sm" title="수량을 수정하고 바깥을 클릭하면 저장됩니다" />
                                    </th>
                                ))}
                            </tr>
                            <tr>
                                <th className="border-b border-r py-2 px-1 bg-slate-50/80 text-[12px] font-bold text-slate-700 tracking-tight">합계수량</th>
                                {products.map((p, i) => {
                                    const orderSum = rawCustomers.reduce((acc, c) => acc + (c.items[i] || 0), 0);
                                    return (
                                        <th key={i} className="border-b border-r py-2 px-1 bg-slate-50/80 text-[13px] font-semibold text-slate-700">
                                            {orderSum}
                                        </th>
                                    )
                                })}
                            </tr>
                            <tr>
                                <th className="border-b border-r py-2 px-1 bg-amber-50/40 text-[12px] font-bold text-amber-700 tracking-tight">남은수량</th>
                                {products.map((p, i) => {
                                    const orderSum = rawCustomers.reduce((acc, c) => acc + (c.items[i] || 0), 0);
                                    const remaining = p.stock - orderSum;
                                    return (
                                        <th key={i} className="border-b border-r py-2 px-1 bg-amber-50/40 text-[13px] font-bold text-amber-700">
                                            {remaining}
                                        </th>
                                    )
                                })}
                            </tr>
                            <tr>
                                <th className="border-b border-r py-2 px-1 bg-emerald-50/60 text-[11px] font-bold text-emerald-800 tracking-tighter leading-tight">남은+미체크</th>
                                {products.map((p, i) => {
                                    const orderSum = rawCustomers.reduce((acc, c) => acc + (c.items[i] || 0), 0);
                                    const remaining = p.stock - orderSum;
                                    const unreceivedSum = rawCustomers.filter(c => !c.checked).reduce((acc, c) => acc + (c.items[i] || 0), 0);
                                    const physicalTarget = remaining + unreceivedSum;
                                    return (
                                        <th key={i} className="border-b border-r py-2 px-1 bg-emerald-50/60 text-[14px] font-extrabold text-emerald-800 shadow-inner">
                                            {physicalTarget}
                                        </th>
                                    )
                                })}
                            </tr>
                        </thead>

                        <tbody>
                            <tr><td colSpan={products.length + 6} className="h-2 bg-muted/10 border-b border-t border-t-slate-300"></td></tr>

                            {isLoading ? (
                                <tr><td colSpan={products.length + 7} className="p-8 text-center text-muted-foreground animate-pulse">데이터베이스에서 실시간 상태를 불러오는 중입니다...</td></tr>
                            ) : filteredCustomers.length === 0 ? (
                                <tr><td colSpan={products.length + 7} className="p-8 text-muted-foreground font-medium text-center">조회할 데이터가 없습니다. (해당 일자에 상품이나 주문이 없습니다)</td></tr>
                            ) : (
                                filteredCustomers.map((c, i) => (
                                    <tr key={`${isMerged}-${c.id || i}`} className={`hover:bg-muted/40 transition-colors group ${c.checked ? 'bg-emerald-50/30 opacity-70' : 'bg-background'} ${selectedPosOrders.includes(c.id) ? 'bg-indigo-50/40' : ''}`}>
                                        <td className="border-b border-r p-2 sm:p-3 text-xs sm:text-sm font-semibold bg-background group-hover:bg-muted/40 sticky left-0 z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)] whitespace-nowrap truncate w-[100px] sm:w-[160px] min-w-[100px] sm:min-w-[160px] max-w-[100px] sm:max-w-[160px]">
                                            <div className="flex items-center gap-2">
                                                {posSyncEnabled && (
                                                    <Checkbox 
                                                        disabled={c.checked || isMerged} 
                                                        checked={selectedPosOrders.includes(c.id)} 
                                                        onCheckedChange={() => togglePosSelect(c.id)} 
                                                        className="h-4 w-4 shrink-0 border-indigo-300 data-[state=checked]:bg-indigo-600 cursor-pointer disabled:opacity-30" 
                                                    />
                                                )}
                                                {c.checked ? <span className="line-through text-muted-foreground truncate">{c.name}</span> : <span className="truncate">{c.name}</span>}
                                            </div>
                                        </td>
                                        <td className="border-b border-r px-1 sm:px-2 py-1 bg-emerald-50/10 sticky left-[100px] sm:left-[160px] z-10 w-[45px] sm:w-[70px] min-w-[45px] sm:min-w-[70px] max-w-[45px] sm:max-w-[70px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)] group-hover:bg-emerald-50/20">
                                            <div className="flex justify-center items-center h-full pt-1">
                                                <Checkbox
                                                    checked={c.checked}
                                                    onCheckedChange={() => !isMerged && toggleCheck(c.id, c.checked)}
                                                    disabled={isMerged}
                                                    className="h-5 w-5 sm:h-6 sm:w-6 border-slate-300 data-[state=checked]:bg-emerald-500 rounded-sm cursor-pointer disabled:opacity-50"
                                                />
                                            </div>
                                        </td>
                                        <td className="border-b border-r px-1 py-1 bg-red-50/10">
                                            <div className="flex justify-center items-center h-full">
                                                {!isMerged && (
                                                    <Button variant="ghost" size="icon" onClick={() => handleDeleteOrder(c.id, c.name)} className="h-7 w-7 text-red-400 hover:text-red-700 hover:bg-red-100" title="이 주문 행 삭제">
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                )}
                                            </div>
                                        </td>
                                        <td className="border-b border-r px-3 py-2 bg-slate-50/40 text-left">
                                            <span className="text-sm font-medium text-slate-800 break-words leading-tight block">{getSummary(c.items)}</span>
                                        </td>
                                        <td className="border-b border-r px-3 py-2 bg-blue-50/20 text-right font-bold text-blue-900 border-x-blue-100 shadow-inner">
                                            {c.items.reduce((total: number, qty: number, idx: number) => total + (qty * (products[idx]?.price || 0)), 0).toLocaleString()}원
                                        </td>
                                        <td className="border-b border-r px-2 py-1 bg-indigo-50/10">
                                            <Input defaultValue={c.memo1} onBlur={(e) => handleUpdateMemo(c.id, 'customer_memo_1', e.target.value)} placeholder="메모" className="h-9 bg-transparent border-transparent" />
                                        </td>
                                        <td className="border-b border-r px-2 py-1 bg-indigo-50/10">
                                            <Input defaultValue={c.memo2} onBlur={(e) => handleUpdateMemo(c.id, 'customer_memo_2', e.target.value)} placeholder="메모" className="h-9 bg-transparent border-transparent" />
                                        </td>
                                        {c.items.map((qty, j) => (
                                            <td key={j} className={`border-b border-r p-3 text-lg font-bold ${qty > 0 ? 'bg-primary/5' : ''}`}>
                                                {qty > 0 ? <span className="text-primary">{qty}</span> : <span className="text-muted-foreground/20 font-normal">-</span>}
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Floating POS Action Bar */}
            {selectedPosOrders.length > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] bg-slate-900/95 backdrop-blur-md text-white rounded-full px-5 py-3 shadow-[0_10px_40px_rgba(0,0,0,0.4)] flex items-center gap-5 md:gap-8 animate-in slide-in-from-bottom-5 duration-300 border border-slate-700/50">
                    <div className="flex flex-col border-r border-slate-600/60 pr-5 md:pr-8">
                        <span className="text-[13px] font-semibold text-slate-400">결제 대기 리스트 <strong className="text-white bg-slate-800 px-1.5 py-0.5 rounded-md ml-1">{selectedPosOrders.length}</strong>건</span>
                        <span className="text-xl md:text-2xl font-black text-emerald-400 tracking-tight">{calculatePosTotal().toLocaleString()}<span className="text-base font-bold ml-0.5 text-emerald-500/80">원</span></span>
                    </div>
                    <Button 
                        onClick={executePosPayment} 
                        disabled={isPosPaying} 
                        className="bg-indigo-600 hover:bg-indigo-500 rounded-full font-bold px-6 md:px-8 text-white text-base h-12 shadow-lg transition-all active:scale-95"
                    >
                        {isPosPaying ? (
                            <span className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> 포스기 응답 대기중...</span>
                        ) : (
                            <span className="flex items-center gap-2">💳 POS 결제 전송</span>
                        )}
                    </Button>
                </div>
            )}
        </div>
    )
}

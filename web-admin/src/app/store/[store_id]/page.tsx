"use client"

import { useState, useEffect, use, useMemo, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Package, AlertCircle, CalendarDays, ShoppingBag, ImageIcon, Megaphone, ChevronLeft, ChevronRight } from "lucide-react"
import Image from "next/image"

export default function PublicStorePage({ params }: { params: Promise<{ store_id: string }> }) {
    const { store_id: storeId } = use(params)

    // Store State
    const [storeInfo, setStoreInfo] = useState<any>(null)
    const [settings, setSettings] = useState<any>(null)
    const [products, setProducts] = useState<any[]>([])
    const [isLoadingInit, setIsLoadingInit] = useState(true)
    const [fetchError, setFetchError] = useState("")

    // Order Search State
    const [nickname, setNickname] = useState("")
    const [isSearching, setIsSearching] = useState(false)
    const [queriedOrders, setQueriedOrders] = useState<any[] | null>(null)
    const [searchMessage, setSearchMessage] = useState("")
    const [selectedNickname, setSelectedNickname] = useState<string | null>(null)

    const [selectedProduct, setSelectedProduct] = useState<any>(null)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    
    // Pill Tabs Filter State
    const [activeFilter, setActiveFilter] = useState<string>("regular") // 'regular' or target_date string

    useEffect(() => {
        const initData = async () => {
            try {
                const res = await fetch(`/api/public/store/${storeId}`)
                const data = await res.json()
                if (data.success) {
                    setStoreInfo(data.store)
                    setSettings(data.settings)
                    setProducts(data.products || [])
                    
                    // Auto-select today's date or earliest future date by default
                    if (data.products && data.products.length > 0) {
                        const dates = Array.from(new Set(data.products.map((p: any) => p.target_date).filter(Boolean))).sort() as string[]
                        const hasRegular = data.products.some((p: any) => p.is_regular_sale)
                        
                        if (dates.length > 0) {
                            const today = new Date()
                            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
                            
                            if (dates.includes(todayStr)) {
                                setActiveFilter(todayStr)
                            } else {
                                const futureDates = dates.filter(d => d >= todayStr)
                                setActiveFilter(futureDates.length > 0 ? futureDates[0] : dates[0])
                            }
                        } else if (hasRegular) {
                            setActiveFilter('regular')
                        }
                    }
                } else {
                    setFetchError(data.error || "매장 정보를 불러올 수 없습니다.")
                }
            } catch (error) {
                setFetchError("서버와의 연결에 실패했습니다.")
            } finally {
                setIsLoadingInit(false)
            }
        }
        initData()
    }, [storeId])

    const handleSearchOrder = async (e?: React.FormEvent) => {
        if (e) e.preventDefault()
        if (!nickname.trim()) {
            setSearchMessage("조회할 닉네임을 정확히 입력해주세요.")
            setQueriedOrders(null)
            return
        }

        setIsSearching(true)
        setSearchMessage("")
        setQueriedOrders(null)
        setSelectedNickname(null)

        try {
            const res = await fetch(`/api/public/orders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ store_id: storeId, nickname })
            })
            const data = await res.json()
            if (data.success) {
                if (data.orders.length === 0) {
                    setSearchMessage(`'${nickname}' 님으로 접수된 픽업 대기 내역이 없습니다. (수령 완료된 주문은 노출되지 않습니다.)`)
                    setQueriedOrders(null)
                    setSelectedNickname(null)
                } else {
                    setQueriedOrders(data.orders)
                    
                    const uniqueNicks = Array.from(new Set(data.orders.map((o: any) => o.customer_nickname as string))) as string[]
                    if (uniqueNicks.length === 1) {
                        setSelectedNickname(uniqueNicks[0])
                    } else {
                        setSelectedNickname(null)
                    }
                }
            } else {
                setSearchMessage("조회 중 오류가 발생했습니다: " + data.error)
            }
        } catch (error) {
            setSearchMessage("조회 서버 연결에 실패했습니다.")
        } finally {
            setIsSearching(false)
        }
    }

    // Extract unique dates for Pill Tabs
    const filterTabs = useMemo(() => {
        const tabs = [{ id: 'regular', label: '상시판매제품' }]
        const dates = new Set<string>()
        products.forEach(p => {
            if (!p.is_regular_sale && p.target_date) {
                dates.add(p.target_date)
            }
        })
        const sortedDates = Array.from(dates).sort()
        sortedDates.forEach(date => {
            let formattedDate = date;
            if (date.match(/^\d{4}-\d{2}-\d{2}$/)) {
                const [_, m, d] = date.split('-');
                const dObj = new Date(date);
                if (!isNaN(dObj.getTime())) {
                    const days = ['일', '월', '화', '수', '목', '금', '토'];
                    formattedDate = `${m}-${d}(${days[dObj.getDay()]})`;
                }
            }
            tabs.push({ id: date, label: formattedDate })
        })
        return tabs
    }, [products])

    // Filtered products list
    const filteredProducts = useMemo(() => {
        let baseList = []
        if (activeFilter === 'regular') {
            baseList = products.filter(p => p.is_regular_sale)
        } else {
            baseList = products.filter(p => !p.is_regular_sale && p.target_date === activeFilter)
        }

        if (settings?.hide_soldout) {
            baseList = baseList.filter(p => p.allocated_stock === null || p.allocated_stock > 0)
        }

        const threshold = settings?.badge_stock_level || 3;

        return baseList.sort((a, b) => {
            const getRank = (p: any) => {
                if (p.allocated_stock === null) return 2;
                if (p.allocated_stock <= 0) return 3; // Sold Out
                if (p.allocated_stock <= threshold) return 1; // Closing Soon
                return 2; // Available
            }
            const rankA = getRank(a);
            const rankB = getRank(b);

            if (rankA !== rankB) return rankA - rankB;
            // secondary sort by ID or name to prevent hydration mismatches on same rank
            return (a.display_name || "").localeCompare(b.display_name || "", 'ko')
        })
    }, [products, activeFilter, settings])

    if (isLoadingInit) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center gap-4 animate-pulse">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                        <ShoppingBag className="w-6 h-6 text-blue-500" />
                    </div>
                    <p className="font-bold text-slate-500 text-lg">매장 정보를 불러오는 중입니다...</p>
                </div>
            </div>
        )
    }

    if (fetchError || !storeInfo) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-50">
                <AlertCircle className="w-12 h-12 text-destructive mb-4" />
                <h1 className="text-xl text-center font-bold text-slate-800">해당 매장을 찾을 수 없습니다</h1>
                <p className="text-muted-foreground mt-2">{fetchError}</p>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-slate-100 pb-20 font-sans tracking-tight">
            {/* Header */}
            <header className="bg-white shadow-sm border-b border-slate-200">
                <div className="max-w-[500px] mx-auto px-4 py-8 text-center flex flex-col items-center">
                    <h1 className="text-2xl font-black text-slate-900 tracking-tighter">주문 검색 및 상품리스트</h1>
                    <p className="text-slate-400 font-bold text-sm mt-1">{storeInfo.name}</p>
                </div>
            </header>

            <main className="max-w-[500px] mx-auto px-4 py-8">
                {/* Notice Banners */}
                {settings?.notice_texts && settings.notice_texts.length > 0 && (
                    <div className="mb-6 space-y-2">
                        {settings.notice_texts.map((text: string, i: number) => text.trim() && (
                            <div key={i} className="bg-white border border-slate-200 text-slate-700 px-4 py-3 rounded-2xl flex gap-3 shadow-sm items-start">
                                <Megaphone className="w-5 h-5 flex-shrink-0 mt-0.5 text-blue-500" />
                                <p className="font-bold text-[15px] leading-relaxed tracking-tight">{text}</p>
                            </div>
                        ))}
                    </div>
                )}

                {/* Section 1: Reservation Search */}
                <section className="mb-10 animate-in fade-in slide-in-from-bottom-2">
                    <h3 className="font-black text-lg text-slate-800 mb-3 flex items-center gap-2">
                        🔍 내 예약 확인
                    </h3>
                    <form onSubmit={handleSearchOrder} className="flex gap-2">
                        <Input
                            value={nickname}
                            onChange={(e) => setNickname(e.target.value)}
                            placeholder="닉네임 (일부분만 입력해도 OK)"
                            className="h-12 text-base font-medium shadow-sm bg-white border-slate-200 focus-visible:ring-blue-500 rounded-lg flex-1"
                        />
                        <Button 
                            type="submit" 
                            disabled={isSearching} 
                            className="h-12 px-6 font-bold text-base bg-blue-500 hover:bg-blue-600 shadow-sm transition-transform active:scale-95 rounded-lg text-white"
                        >
                            {isSearching ? '검색중' : '검색'}
                        </Button>
                    </form>
                    
                    {searchMessage && (
                        <p className="mt-3 text-sm font-bold text-rose-500 bg-rose-50 inline-block px-3 py-1 rounded-md border border-rose-100">
                            {searchMessage}
                        </p>
                    )}

                    {/* Queried Orders Inline */}
                    {queriedOrders && queriedOrders.length > 0 && (
                        <div className="mt-4 space-y-3 animate-in fade-in slide-in-from-top-2">
                            {/* Phase 1: Nickname Selection (If multiple unique nicknames exist and none selected) */}
                            {!selectedNickname && (
                                <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 text-center animate-in zoom-in-95 duration-200">
                                    <h4 className="font-black text-slate-800 text-lg mb-2">🤔 여러 개의 유사한 닉네임이 검색되었습니다</h4>
                                    <p className="text-slate-500 text-[13px] font-bold tracking-tight mb-5 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                        💡 본인의 닉네임을 정확히 <span className="text-blue-500">선택</span>해 주세요.<br/>
                                        (타인의 주문 내역은 보호됩니다)
                                    </p>
                                    <div className="flex flex-col gap-2">
                                        {Array.from(new Set(queriedOrders.map((o: any) => o.customer_nickname as string))).map((nick: string, idx: number) => (
                                            <Button 
                                                key={idx} 
                                                variant="outline" 
                                                onClick={() => setSelectedNickname(nick)}
                                                className="h-auto py-3.5 px-4 rounded-xl border-slate-200 shadow-sm hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 hover:shadow-md transition-all font-bold text-slate-700 w-full justify-between items-center group"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xl group-hover:scale-110 transition-transform">🍏</span>
                                                    <span className="text-base">{nick}</span>
                                                </div>
                                                <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-md group-hover:bg-blue-100 group-hover:text-blue-500 transition-colors">
                                                    {queriedOrders.filter(o => o.customer_nickname === nick).length}건
                                                </span>
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Phase 2: Order List for Selected Nickname */}
                            {selectedNickname && (
                                <div className="animate-in fade-in slide-in-from-right-2 duration-300">
                                    <div className="flex justify-between items-end mb-3 pl-1 pr-1 border-b border-slate-200 pb-2">
                                        <p className="font-bold text-slate-500 text-sm">
                                            <span className="text-blue-600 font-black text-base">🍏 {selectedNickname}</span> 님의 예약 내역
                                        </p>
                                        {Array.from(new Set(queriedOrders.map((o: any) => o.customer_nickname as string))).length > 1 && (
                                            <button 
                                                onClick={() => setSelectedNickname(null)}
                                                className="text-[13px] font-bold text-slate-400 hover:text-blue-500 flex items-center gap-1 transition-colors bg-slate-100 hover:bg-blue-50 px-2.5 py-1 rounded-md"
                                            >
                                                <ChevronLeft className="w-3.5 h-3.5" />
                                                다른 닉네임 선택
                                            </button>
                                        )}
                                    </div>
                                    <div className="space-y-3">
                                        {(() => {
                                            // 선택된 닉네임의 주문들을 픽업일별로 그룹핑 (오름차순)
                                            const ownOrders = queriedOrders.filter((order: any) => order.customer_nickname === selectedNickname)
                                            const groups = new Map<string, { pickup_date: string, items: any[], created_dates: Date[] }>()
                                            ownOrders.forEach((order: any) => {
                                                const key = order.pickup_date || ''
                                                if (!groups.has(key)) groups.set(key, { pickup_date: key, items: [], created_dates: [] })
                                                const g = groups.get(key)!
                                                ;(order.order_items || []).forEach((it: any) => g.items.push(it))
                                                if (order.created_at) g.created_dates.push(new Date(order.created_at))
                                            })
                                            const sortedGroups = Array.from(groups.values()).sort((a, b) => (a.pickup_date || '').localeCompare(b.pickup_date || ''))

                                            const formatPickupDate = (d: string) => {
                                                if (!d) return ''
                                                if (d === '1900-01-01') return '상시판매'
                                                const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/)
                                                if (!m) return d
                                                const dObj = new Date(d)
                                                if (isNaN(dObj.getTime())) return d
                                                const days = ['일', '월', '화', '수', '목', '금', '토']
                                                return `${m[2]}-${m[3]}(${days[dObj.getDay()]})`
                                            }

                                            return sortedGroups.map((g, gi) => {
                                                const showPrice = settings?.show_price ?? true
                                                const isAllItemsStocked = g.items.length > 0 && g.items.every((item: any) => item.product?.is_stocked)
                                                const earliestCreated = g.created_dates.length > 0
                                                    ? new Date(Math.min(...g.created_dates.map(d => d.getTime())))
                                                    : null
                                                const totalPrice = g.items.reduce((acc: number, item: any) => acc + (item.quantity * (item.product?.price || 0)), 0)

                                                return (
                                                    <div key={`${g.pickup_date}-${gi}`} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 relative overflow-hidden group hover:border-blue-200 transition-colors">
                                                        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-500 group-hover:bg-blue-400 transition-colors"></div>
                                                        <div className="flex justify-between items-start mb-3 pl-2">
                                                            <div>
                                                                {earliestCreated && (
                                                                    <span className="text-xs font-bold text-slate-400 block mb-1">
                                                                        접수일: {earliestCreated.toLocaleDateString()}
                                                                    </span>
                                                                )}
                                                                <strong className="text-lg font-black text-slate-800 tracking-tight">픽업일: {formatPickupDate(g.pickup_date)}</strong>
                                                            </div>
                                                            {isAllItemsStocked ? (
                                                                <Badge className="bg-emerald-50 text-emerald-600 border border-emerald-200 font-black px-2 py-0.5 shadow-none">입고</Badge>
                                                            ) : (
                                                                <Badge className="bg-slate-50 text-slate-500 border border-slate-200 font-bold px-2 py-0.5 shadow-none">미입고</Badge>
                                                            )}
                                                        </div>
                                                        <ul className="space-y-3 border-t border-slate-100 pt-3 pl-2">
                                                            {g.items.map((item: any) => {
                                                                const itemPrice = item.product?.price || 0
                                                                const totalItemPrice = itemPrice * item.quantity
                                                                return (
                                                                    <li key={item.id} className="flex justify-between items-start text-[15px]">
                                                                        <div className="flex flex-col">
                                                                            <span className="font-bold text-slate-700">
                                                                                {item.product?.display_name || item.product?.collect_name || "알 수 없는 상품"}
                                                                            </span>
                                                                            {showPrice && (
                                                                                <span className="text-[12px] font-semibold text-slate-400 mt-0.5 tracking-tight">
                                                                                    개당 {itemPrice.toLocaleString()}원
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <div className="flex flex-col items-end gap-1.5 mt-0.5">
                                                                            <span className="font-black text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md">{item.quantity}개</span>
                                                                            {showPrice && (
                                                                                <span className="text-[13px] font-bold text-slate-600">
                                                                                    {totalItemPrice.toLocaleString()}원
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </li>
                                                                )
                                                            })}
                                                        </ul>
                                                        {showPrice && (
                                                            <div className="border-t border-slate-100 mt-3 pt-3 pl-2 flex justify-between items-center bg-slate-50/50 rounded-b-xl -mx-4 -mb-4 px-4 pb-4">
                                                                <span className="text-[14px] font-bold text-slate-500">총 결제 추정 금액</span>
                                                                <span className="text-[18px] font-black text-slate-800">
                                                                    {totalPrice.toLocaleString()}원
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            })
                                        })()}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </section>

                {/* Section 2: Product List & Tabs */}
                <section className="animate-in fade-in slide-in-from-bottom-3 duration-500">
                    <h3 className="font-black text-lg text-slate-800 mb-4 flex items-center gap-2">
                        🛍️ 현재 구매 가능 제품(일자별 상품보기)
                    </h3>
                    
                    {/* Horizontal Pill Tabs */}
                    <div className="flex overflow-x-auto gap-2 pb-2 mb-4 scrollbar-hide [-ms-overflow-style:'none'] [scrollbar-width:'none'] [&::-webkit-scrollbar]:hidden">
                        {filterTabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveFilter(tab.id)}
                                className={`whitespace-nowrap px-4 py-2.5 rounded-full text-[14px] font-bold transition-all border shadow-sm ${
                                    activeFilter === tab.id 
                                    ? 'bg-blue-500 border-blue-500 text-white shadow-md shadow-blue-500/20' 
                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Products List (Vertical Cards) */}
                    <div className="grid grid-cols-1 gap-4">
                        {filteredProducts.length === 0 ? (
                            <div className="py-12 text-center text-slate-400 bg-white rounded-[2rem] border border-slate-100 shadow-sm">
                                <Package className="w-10 h-10 mx-auto mb-3 opacity-30 text-blue-400" />
                                <p className="font-bold">해당 날짜의 판매 상품이 없습니다.</p>
                            </div>
                        ) : (
                            filteredProducts.map((product) => {
                                const outOfStock = product.allocated_stock !== null && product.allocated_stock <= 0;
                                const lowStock = product.allocated_stock !== null && product.allocated_stock > 0 && product.allocated_stock <= (settings?.badge_stock_level || 3);
                                
                                const renderImage = settings?.show_product_image ?? true;
                                const renderConfigPrice = true; // Always show price in catalog
                                const renderStockBadge = settings?.show_stock_badge ?? true;

                                const displayImage = (product.image_urls && product.image_urls.length > 0) ? product.image_urls[0] : product.image_url;

                                return (
                                    <div 
                                        key={product.id} 
                                        onClick={() => setSelectedProduct(product)}
                                        className="bg-white rounded-[2rem] p-3 shadow-sm border border-slate-100 flex gap-4 cursor-pointer hover:shadow-md transition-shadow relative overflow-hidden group"
                                    >
                                        {/* Image Left */}
                                        {renderImage && (
                                            <div className="w-24 h-24 sm:w-[104px] sm:h-[104px] rounded-2xl bg-slate-100 flex-shrink-0 relative overflow-hidden border border-slate-100 shadow-[inset_0_2px_4px_rgba(0,0,0,0.03)]">
                                                {displayImage ? (
                                                    <Image
                                                        src={displayImage}
                                                        alt={product.display_name}
                                                        fill
                                                        sizes="104px"
                                                        className={`object-cover transition-transform group-hover:scale-105 ${outOfStock ? 'opacity-50 grayscale' : ''}`}
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                                                        <ImageIcon className="w-8 h-8 opacity-20" />
                                                    </div>
                                                )}
                                                {outOfStock && (
                                                    <div className="absolute inset-0 bg-slate-900/10 backdrop-blur-[1px] flex items-center justify-center pointer-events-none"></div>
                                                )}
                                            </div>
                                        )}

                                        {/* Content Right */}
                                        <div className="flex-1 flex flex-col justify-center min-w-0 py-1">
                                            <h4 className={`text-lg font-black truncate leading-tight tracking-tight mb-2 px-1 ${outOfStock ? 'text-slate-400 line-through decoration-slate-300' : 'text-slate-800'}`}>
                                                {product.display_name || product.collect_name}
                                            </h4>
                                            
                                            <div className="flex flex-col gap-1.5 px-1">
                                                {/* Meta Row: Date & Stock */}
                                                <div className="flex items-center gap-3 text-[13px] sm:text-[14px]">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-sm">📅</span>
                                                        <span className="font-semibold text-slate-500 truncate">
                                                            {product.is_regular_sale ? '매장상시' : product.target_date}
                                                        </span>
                                                    </div>
                                                    
                                                </div>

                                                {/* Price & Badges Row */}
                                                <div className="flex justify-between items-center mt-0.5">
                                                    <div className="flex items-center gap-1">
                                                        {renderConfigPrice ? (
                                                            <>
                                                                <span className="text-[13px] opacity-80">💰</span>
                                                                <span className="font-black text-slate-800 tracking-tighter">
                                                                    {product.price > 0 ? `${product.price.toLocaleString()}원` : '가격 미정'}
                                                                </span>
                                                            </>
                                                        ) : <span className="text-[13px] opacity-0 text-transparent">💰</span>}
                                                    </div>

                                                    <div className="flex items-center gap-1 pr-1">
                                                        {renderStockBadge && outOfStock && <span className="text-rose-500 font-black text-xs px-1.5 py-0.5 bg-rose-50 rounded-md border border-rose-100">SOLD OUT</span>}
                                                        {renderStockBadge && !outOfStock && lowStock && <span className="text-orange-500 font-bold text-xs bg-orange-50 px-1.5 py-0.5 rounded-md border border-orange-100">마감임박</span>}
                                                        {renderStockBadge && !outOfStock && !lowStock && <span className="text-emerald-600 font-bold text-xs bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100">구매가능</span>}
                                                        {product.collect_name?.includes('한정') && !outOfStock && <span className="text-orange-600 font-bold text-xs bg-orange-50 px-1.5 py-0.5 rounded-md border border-orange-100">한정판매</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>
                </section>
            </main>

            {/* Dialog Component (Swiper Modal) */}
            <Dialog open={!!selectedProduct} onOpenChange={(open) => !open && setSelectedProduct(null)}>
                <DialogContent className="w-[92vw] sm:max-w-[480px] p-0 overflow-hidden bg-slate-50 border-0 shadow-2xl rounded-[2rem]">
                    <DialogTitle className="sr-only">상품 상세 정보</DialogTitle>
                    <DialogDescription className="sr-only">상품에 대한 사진과 설명을 보여줍니다.</DialogDescription>
                    
                    {selectedProduct && (() => {
                        const outOfStock = selectedProduct.allocated_stock !== null && selectedProduct.allocated_stock <= 0;
                        const lowStock = selectedProduct.allocated_stock !== null && selectedProduct.allocated_stock > 0 && selectedProduct.allocated_stock <= (settings?.badge_stock_level || 3);
                        const renderImage = settings?.show_product_image ?? true;
                        const renderConfigPrice = true; // Always show price in detail modal
                        const renderDesc = settings?.show_product_desc ?? true;
                        const renderStockBadge = settings?.show_stock_badge ?? true;
                        
                        const images = (selectedProduct.image_urls && selectedProduct.image_urls.length > 0) 
                            ? selectedProduct.image_urls 
                            : (selectedProduct.image_url ? [selectedProduct.image_url] : []);

                        return (
                            <div className="flex flex-col max-h-[85vh]">
                                <div className="p-5 bg-white border-b border-slate-100 z-10 shrink-0">
                                    <div className="flex flex-wrap gap-1.5 mb-2">
                                        {!selectedProduct.is_regular_sale && (
                                            <Badge variant="secondary" className="bg-slate-100 font-bold border-slate-200 text-slate-600 shadow-none px-2">{selectedProduct.target_date} 예약</Badge>
                                        )}
                                        {renderStockBadge && outOfStock && <Badge variant="destructive" className="shadow-none px-2">품절</Badge>}
                                        {renderStockBadge && !outOfStock && lowStock && <Badge className="bg-orange-500 hover:bg-orange-600 shadow-none px-2">마감 임박</Badge>}
                                        {renderStockBadge && !outOfStock && !lowStock && <Badge className="bg-emerald-500 hover:bg-emerald-600 shadow-none px-2">구매 가능</Badge>}
                                        {renderStockBadge && selectedProduct.is_stocked && !outOfStock && <Badge className="bg-blue-500 hover:bg-blue-600 shadow-none px-2">입고 완료</Badge>}
                                    </div>
                                    <h2 className="text-xl sm:text-2xl font-black text-slate-800 leading-snug tracking-tight">
                                        {selectedProduct.display_name || selectedProduct.collect_name}
                                    </h2>
                                </div>

                                <div className="overflow-y-auto w-full">
                                    {renderImage && images.length > 0 && (
                                        <div className="bg-slate-100 relative w-full aspect-square border-b border-slate-200">
                                            {outOfStock && (
                                                <div className="absolute inset-x-0 inset-y-0 z-10 bg-slate-900/10 backdrop-blur-[1px] flex items-center justify-center pointer-events-none"></div>
                                            )}
                                            
                                            <div ref={scrollContainerRef} className="flex overflow-x-auto snap-x snap-mandatory w-full h-full [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
                                                {images.map((img: string, idx: number) => (
                                                    <div key={idx} className="w-full shrink-0 snap-center h-full relative">
                                                        <Image
                                                            src={img}
                                                            alt={`${selectedProduct.display_name || selectedProduct.collect_name} 이미지 ${idx + 1}`}
                                                            fill
                                                            sizes="(max-width: 640px) 100vw, 500px"
                                                            className={`object-cover ${outOfStock ? 'opacity-50 grayscale' : ''}`}
                                                        />
                                                        {images.length > 1 && (
                                                            <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur-md text-white font-black text-[11px] px-3 py-1 rounded-full shadow-sm z-20 pointer-events-none tracking-widest">
                                                                {idx + 1} / {images.length}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                            {images.length > 1 && (
                                                <>
                                                    <button 
                                                        onClick={() => scrollContainerRef.current?.scrollBy({ left: -scrollContainerRef.current.clientWidth, behavior: 'smooth' })}
                                                        className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center bg-white/90 hover:bg-white text-slate-800 rounded-full shadow-md z-20 backdrop-blur-sm transition-transform active:scale-95"
                                                    >
                                                        <ChevronLeft className="w-5 h-5 pr-0.5" />
                                                    </button>
                                                    <button 
                                                        onClick={() => scrollContainerRef.current?.scrollBy({ left: scrollContainerRef.current.clientWidth, behavior: 'smooth' })}
                                                        className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center bg-white/90 hover:bg-white text-slate-800 rounded-full shadow-md z-20 backdrop-blur-sm transition-transform active:scale-95"
                                                    >
                                                        <ChevronRight className="w-5 h-5 pl-0.5" />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    )}

                                    <div className="p-5 flex flex-col gap-4 bg-white pb-8">
                                        {renderConfigPrice && (
                                            <div className="flex items-center justify-between pb-4 border-b border-slate-100 border-dashed">
                                                <span className="text-[15px] font-bold text-slate-500">기본 가격</span>
                                                <span className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tighter">
                                                    {selectedProduct.price > 0 ? `${selectedProduct.price.toLocaleString()}원` : '가격 미정'}
                                                </span>
                                            </div>
                                        )}

                                        {renderDesc && selectedProduct.description && (
                                            <div className="mt-2 text-[15px] text-slate-600 leading-relaxed whitespace-pre-wrap">
                                                <h4 className="font-bold text-slate-800 mb-2 pb-2 border-b border-slate-100 flex items-center gap-1.5">
                                                    📝 상품 상세 설명
                                                </h4>
                                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                                    {selectedProduct.description}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    })()}
                </DialogContent>
            </Dialog>
        </div>
    )
}

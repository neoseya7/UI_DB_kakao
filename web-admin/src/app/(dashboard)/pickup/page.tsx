"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Calendar as CalendarIcon, Printer, ListCollapse, Search, PlusCircle, ArrowRightLeft, UploadCloud, DownloadCloud, Trash2, MoreVertical } from "lucide-react"
import { useRef } from "react"
import * as XLSX from 'xlsx'
import { makeCacheKey, getPickupCache, setPickupCache, clearPickupCache } from "@/lib/pickupCache"
import { GuideBadge } from "@/components/ui/guide-badge"
import PickupTable from "./components/PickupTable"
import PickupCardList from "./components/PickupCardList"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type Product = { id: string, name: string, price: number, required: number, stock: number, target_date?: string, is_regular_sale?: boolean, product_memo?: string, tiered_prices?: {qty: number, price: number}[], unit_text?: string }
type Order = { id: string, name: string, items: number[], memo1: string, memo2: string, checked: boolean, pickup_date?: string, originalIndex?: number, crm?: { category: string, memo: string } }

export default function PickupCalendarPage() {
    const [storeId, setStoreId] = useState<string | null>(null)
    const [isMerged, setIsMerged] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0, isUploading: false })
    const cancelUploadRef = useRef(false)

    const [posSyncEnabled, setPosSyncEnabled] = useState(false)
    const [selectedPosOrders, setSelectedPosOrders] = useState<string[]>([])
    const [isPosPaying, setIsPosPaying] = useState(false)

    // Delete Mode states
    const [isDeleteMode, setIsDeleteMode] = useState(false)
    const [selectedDeleteIds, setSelectedDeleteIds] = useState<string[]>([])

    const [currentDate, setCurrentDate] = useState(() => {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    })

    const [searchTerm, setSearchTerm] = useState("")
    const [activeSearchTerm, setActiveSearchTerm] = useState("")
    const [searchField, setSearchField] = useState<"all" | "nickname" | "product" | "memo">("all")
    const [searchScope, setSearchScope] = useState("today")
    const [customSearchDate, setCustomSearchDate] = useState("")
    const [customEndDate, setCustomEndDate] = useState("")
    const [focusedDate, setFocusedDate] = useState<string | null>(null)
    const [receiptFilter, setReceiptFilter] = useState("unreceived")

    const [newNick, setNewNick] = useState("")
    const [newDate, setNewDate] = useState("")
    const [newProductId, setNewProductId] = useState<string>("")
    const [newQty, setNewQty] = useState("")

    const [editingQty, setEditingQty] = useState<{ orderId: string, productIdx: number } | null>(null)
    const [tempQty, setTempQty] = useState<string>("")
    const [editingMemo, setEditingMemo] = useState<{ orderId: string, type: 'memo1' | 'memo2' } | null>(null)

    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false)
    const [transferSourceDate, setTransferSourceDate] = useState("")
    const [transferProductIdx, setTransferProductIdx] = useState<string>("")
    const [transferNewDate, setTransferNewDate] = useState("")
    const [isTransferToRegular, setIsTransferToRegular] = useState(false)
    const [transferAvailableProducts, setTransferAvailableProducts] = useState<Product[]>([])
    const [sortOrder, setSortOrder] = useState<"entered" | "name">("entered")

    const [availableDates, setAvailableDates] = useState<string[]>([])
    const [products, setProducts] = useState<Product[]>([])
    const [manualOrderProducts, setManualOrderProducts] = useState<Product[]>([])
    const [rawCustomers, setRawCustomers] = useState<Order[]>([])
    
    const [isSettingsLoaded, setIsSettingsLoaded] = useState(false)

    // Mobile detection
    const [isMobile, setIsMobile] = useState(false)
    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768)
        check()
        window.addEventListener('resize', check)
        return () => window.removeEventListener('resize', check)
    }, [])

    // Inline row add
    const [isAddingRow, setIsAddingRow] = useState(false)
    const [addRowNick, setAddRowNick] = useState("")
    const [addRowQtys, setAddRowQtys] = useState<Record<number, string>>({})

    useEffect(() => {
        if (storeId) {
            try {
                const saved = localStorage.getItem(`pickupSettings_${storeId}`)
                if (saved) {
                    const parsed = JSON.parse(saved)
                    if (parsed.searchScope) setSearchScope(parsed.searchScope)
                    if (parsed.customSearchDate) setCustomSearchDate(parsed.customSearchDate)
                    if (parsed.customEndDate) setCustomEndDate(parsed.customEndDate)
                    if (parsed.receiptFilter) setReceiptFilter(parsed.receiptFilter)
                    if (parsed.sortOrder) setSortOrder(parsed.sortOrder)
                }
            } catch (e) { console.error("Filter persistence load failed", e) }
            setIsSettingsLoaded(true)
        }
    }, [storeId])

    useEffect(() => {
        if (storeId && isSettingsLoaded) {
            const settingsToSave = { searchScope, customSearchDate, customEndDate, receiptFilter, sortOrder }
            localStorage.setItem(`pickupSettings_${storeId}`, JSON.stringify(settingsToSave))
        }
    }, [storeId, isSettingsLoaded, searchScope, customSearchDate, customEndDate, receiptFilter, sortOrder])

    // searchScope 가 date_range 가 아닐 때에만 검색어 초기화 (모든 날짜 진입 시 빈 화면 유지)
    useEffect(() => {
        if (searchScope === "all_dates") {
            setActiveSearchTerm("")
            setSearchTerm("")
        }
        // scope 변경 시 focusedDate 해제
        if (searchScope !== "date_range") {
            setFocusedDate(null)
        }
    }, [searchScope])

    // 기간검색 범위가 바뀌면 focusedDate 해제
    useEffect(() => {
        setFocusedDate(null)
    }, [customSearchDate, customEndDate])

    const getStickyClasses = (colName: 'name' | 'receive' | 'delete' | 'summary' | 'price' | 'memo') => {
        const base = "sticky z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)] bg-background group-hover:bg-muted/40"
        const headerBase = "sticky z-40 bg-muted/90 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]"
        
        switch (colName) {
            case 'name': return {
                td: `${base} left-0 w-[100px] sm:w-[160px] min-w-[100px] sm:min-w-[160px] max-w-[100px] sm:max-w-[160px]`,
                th: `${headerBase} left-0 w-[100px] sm:w-[160px] min-w-[100px] sm:min-w-[160px] max-w-[100px] sm:max-w-[160px]`
            }
            case 'receive': return {
                td: `${base} left-[100px] sm:left-[160px] w-[45px] sm:w-[70px] min-w-[45px] sm:min-w-[70px] max-w-[45px] sm:max-w-[70px] bg-emerald-50/10 group-hover:bg-emerald-50/20`,
                th: `${headerBase} left-[100px] sm:left-[160px] w-[45px] sm:w-[70px] min-w-[45px] sm:min-w-[70px] max-w-[45px] sm:max-w-[70px] bg-emerald-50/90`
            }
            case 'delete': return {
                td: `${base} left-[145px] sm:left-[230px] w-[45px] sm:w-[60px] min-w-[45px] sm:min-w-[60px] max-w-[45px] sm:max-w-[60px] bg-red-50/10 group-hover:bg-red-50/20`,
                th: `${headerBase} left-[145px] sm:left-[230px] w-[45px] sm:w-[60px] min-w-[45px] sm:min-w-[60px] max-w-[45px] sm:max-w-[60px] bg-red-50/90`
            }
            case 'summary':
                const sumLeft = isDeleteMode ? "left-[190px] sm:left-[290px]" : "left-[145px] sm:left-[230px]"
                return {
                    td: `${base} ${sumLeft} w-[150px] sm:w-[240px] min-w-[150px] sm:min-w-[240px] max-w-[150px] sm:max-w-[240px] bg-slate-50/40 text-left whitespace-normal break-words leading-tight`,
                    th: `${headerBase} ${sumLeft} w-[150px] sm:w-[240px] min-w-[150px] sm:min-w-[240px] max-w-[150px] sm:max-w-[240px] bg-slate-100/90`
                }
            case 'price':
                const priceLeft = isDeleteMode ? "left-[340px] sm:left-[530px]" : "left-[295px] sm:left-[470px]"
                return {
                    td: `${base} ${priceLeft} w-[90px] sm:w-[110px] min-w-[90px] sm:min-w-[110px] max-w-[90px] sm:max-w-[110px] bg-blue-50/20 text-right`,
                    th: `${headerBase} ${priceLeft} w-[90px] sm:w-[110px] min-w-[90px] sm:min-w-[110px] max-w-[90px] sm:max-w-[110px] bg-blue-50/90`
                }
            case 'memo':
                const mLeft = isDeleteMode ? "left-[430px] sm:left-[640px]" : "left-[385px] sm:left-[580px]"
                return {
                    td: `sticky z-10 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.15)] border-r-2 border-r-indigo-200 ${mLeft} w-[100px] sm:w-[130px] min-w-[100px] sm:min-w-[130px] max-w-[100px] sm:max-w-[130px]`,
                    th: `sticky z-40 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.15)] border-r-2 border-r-indigo-300 ${mLeft} w-[100px] sm:w-[130px] min-w-[100px] sm:min-w-[130px] max-w-[100px] sm:max-w-[130px]`
                }
        }
    }

    useEffect(() => {
        const initUser = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession()
                const user = session?.user
                if (user) {
                    setStoreId(user.id)
                    const { data: sData } = await supabase.from('store_settings').select('crm_tags').eq('store_id', user.id).single()
                    if (sData) {
                        const isPosEnabled = sData.crm_tags?.find((t:any) => t.type === 'setting' && t.key === 'pos_sync_enabled')?.value ?? false;
                        setPosSyncEnabled(isPosEnabled)
                    }
                }
            } catch (err) {
                console.warn("Auth initialization warning:", err)
            }
        }
        initUser()
    }, [])

    useEffect(() => {
        if (storeId) {
            fetchMatrixData()
            setSelectedPosOrders([])
        }
    }, [storeId, currentDate, searchScope, customSearchDate, customEndDate, activeSearchTerm])

    useEffect(() => {
        if (!storeId || !isTransferModalOpen) return;
        const fetchModalProducts = async () => {
            const date = transferSourceDate || currentDate;
            const { data } = await supabase.from('products').select('*').eq('store_id', storeId).eq('is_hidden', false).or(`target_date.eq.${date},is_regular_sale.eq.true`)
            if (data) {
                setTransferAvailableProducts(data.map(p => ({
                    id: p.id,
                    name: p.collect_name,
                    price: p.price || 0,
                    required: p.allocated_stock || 0,
                    stock: p.allocated_stock || 0,
                    target_date: p.target_date,
                    is_regular_sale: p.is_regular_sale,
                    product_memo: p.product_memo || "",
                    tiered_prices: p.tiered_prices || [],
                    unit_text: p.unit_text || ""
                })))
            }
        }
        fetchModalProducts()
    }, [storeId, isTransferModalOpen, transferSourceDate, currentDate])

    // Update manual order products when activeDate changes
    useEffect(() => {
        if (!storeId) return;
        const activeDate = newDate || currentDate;
        const fetchManualProducts = async () => {
            const { data } = await supabase.from('products')
                .select('*')
                .eq('store_id', storeId)
                .eq('is_hidden', false)
                .or(`target_date.eq.${activeDate},is_regular_sale.eq.true`)
            
            if (data) {
                setManualOrderProducts(data.map(p => ({
                    id: p.id,
                    name: p.collect_name,
                    price: p.price || 0,
                    required: p.allocated_stock || 0,
                    stock: p.allocated_stock || 0,
                    target_date: p.target_date,
                    is_regular_sale: p.is_regular_sale,
                    product_memo: p.product_memo || "",
                    tiered_prices: p.tiered_prices || [],
                    unit_text: p.unit_text || ""
                })))
            }
        }
        fetchManualProducts()
    }, [storeId, newDate, currentDate])

    const fetchMatrixData = async (forceRefresh = false) => {
        if (!storeId) return
        // 모든 날짜 모드에서 검색어가 없으면 데이터를 불러오지 않음 (대용량 보호)
        if (searchScope === "all_dates" && !activeSearchTerm.trim()) {
            setRawCustomers([])
            setProducts([])
            setIsLoading(false)
            return
        }

        // 데이터 변경 후 재조회 시 캐시 무효화
        if (forceRefresh) clearPickupCache()

        // 메모리 캐시 확인: 캐시가 있으면 즉시 표시 (백그라운드에서 최신 데이터 갱신)
        const cacheKey = makeCacheKey(storeId, searchScope, currentDate, customSearchDate, customEndDate, activeSearchTerm)
        const cached = getPickupCache(cacheKey)
        if (cached) {
            setRawCustomers(cached.rawCustomers)
            setProducts(cached.products)
            setAvailableDates(cached.availableDates)
            setIsLoading(false)
            // 캐시가 5분 이내면 갱신 생략
            if (Date.now() - cached.timestamp < 5 * 60 * 1000) return
        } else {
            setIsLoading(true)
        }

        // 세션 토큰을 미리 갱신하여 병렬 호출 시 토큰 충돌 방지
        await supabase.auth.getSession()

        // === 1단계: 날짜 목록 + 주문 조회를 병렬 실행 ===
        let pDate = null, startDate = null, endDate = null
        if (searchScope === "today") pDate = currentDate === "상시판매" ? "1900-01-01" : currentDate
        else if (searchScope === "date_range") {
            if (customSearchDate && customEndDate) { startDate = customSearchDate; endDate = customEndDate; }
            else if (customSearchDate && !customEndDate) { pDate = customSearchDate; }
        }

        const [dateResult, rpcResult] = await Promise.all([
            supabase.from('products').select('target_date, is_regular_sale').eq('store_id', storeId).eq('is_hidden', false),
            supabase.rpc('get_matrix_orders', {
                p_store_id: storeId,
                p_pickup_date: pDate,
                p_start_date: startDate,
                p_end_date: endDate
            }).limit(5000)
        ])

        // 날짜 목록 처리
        if (dateResult.data) {
            const uniqueDates = Array.from(new Set(dateResult.data.filter(p => !p.is_regular_sale).map(p => p.target_date))).filter(Boolean).sort() as string[]
            if (dateResult.data.some(p => p.is_regular_sale)) uniqueDates.push("상시판매")
            setAvailableDates(uniqueDates)
        }

        const rpcData = rpcResult.data
        const rpcError = rpcResult.error

        let orders: any[] = []
        if (!rpcError && rpcData) {
            orders = rpcData || []
        } else {
            console.warn("RPC fetch failed, falling back to legacy:", rpcError);
            let oQuery = supabase.from('orders').select('*').eq('store_id', storeId).eq('is_hidden', false)
            if (searchScope === "today") {
                const dbDate = currentDate === "상시판매" ? "1900-01-01" : currentDate
                oQuery = oQuery.or(`pickup_date.eq.${dbDate},pickup_date.eq.1900-01-01`)
            } else if (searchScope === "date_range" && customSearchDate && customEndDate) {
                oQuery = oQuery.or(`and(pickup_date.gte.${customSearchDate},pickup_date.lte.${customEndDate}),pickup_date.eq.1900-01-01`)
            } else if (searchScope === "date_range" && customSearchDate && !customEndDate) {
                oQuery = oQuery.or(`pickup_date.eq.${customSearchDate},pickup_date.eq.1900-01-01`)
            }
            const { data: oData } = await oQuery.limit(2000).order('pickup_date', { ascending: false })
            orders = oData || []
        }

        // 주문에서 product_id 추출
        const orderedProductIds = new Set<string>()
        if (!rpcError && rpcData) {
            orders.forEach((o: any) => {
                if (o.items) o.items.forEach((oi: any) => orderedProductIds.add(oi.product_id))
            })
        } else {
            for (let chunkFilter = 0; chunkFilter < orders.length; chunkFilter += 30) {
               const chunkIds = orders.slice(chunkFilter, chunkFilter + 30).map((o: any) => o.id)
               const { data: itemData } = await supabase.from('order_items').select('product_id').in('order_id', chunkIds)
               if (itemData) itemData.forEach(oi => orderedProductIds.add(oi.product_id))
            }
        }
        const strIdList = Array.from(orderedProductIds).join(',')

        // === 2단계: 상품 조회 + CRM 태그를 병렬 실행 ===
        let pQuery = supabase.from('products').select('*').eq('store_id', storeId).eq('is_hidden', false)
        if (searchScope === "today") {
            if (currentDate === "상시판매") {
                pQuery = strIdList.length > 0 ? pQuery.or(`is_regular_sale.eq.true,id.in.(${strIdList})`) : pQuery.eq('is_regular_sale', true)
            } else {
                pQuery = strIdList.length > 0 ? pQuery.or(`target_date.eq.${currentDate},id.in.(${strIdList})`) : pQuery.eq('target_date', currentDate)
            }
        } else if (searchScope === "date_range") {
            if (strIdList.length > 0) pQuery = pQuery.or(`id.in.(${strIdList}),is_regular_sale.eq.true`)
        }

        const [pResult, settingsResult] = await Promise.all([
            pQuery.limit(5000),
            supabase.from('store_settings').select('crm_tags').eq('store_id', storeId).single()
        ])

        const mappedProducts = (pResult.data || []).map(p => ({
            id: p.id,
            name: p.collect_name || p.name || "(이름없음)",
            price: p.price || 0,
            required: p.is_hidden ? 0 : (p.allocated_stock || 0),
            stock: p.is_hidden ? 0 : (p.allocated_stock || 0),
            target_date: p.target_date,
            is_regular_sale: p.is_regular_sale,
            product_memo: p.product_memo || "",
            tiered_prices: p.tiered_prices || [],
            unit_text: p.unit_text || ""
        }))
        setProducts(mappedProducts)

        // CRM 태그 처리
        const crmTagsList = settingsResult.data?.crm_tags?.filter((t: any) => t.type === 'crm') || []
        const crmDict = crmTagsList.reduce((acc: any, t: any) => {
            acc[t.name] = { category: t.category, memo: t.memo }
            return acc
        }, {})

        if (orders.length === 0) {
            setRawCustomers([])
            setIsLoading(false)
            return
        }

        // === 3단계: 주문-상품 매핑 (O(1) HashMap) ===
        if (!rpcError && rpcData) {
            // 상품 ID → 인덱스 Map (O(1) 조회)
            const productIdxMap = new Map<string, number>()
            mappedProducts.forEach((p, i) => productIdxMap.set(p.id, i))

            const mappedCustomers = orders.map((o: any, index: number) => {
                const itemsArray = new Array(mappedProducts.length).fill(0)
                if (o.items) {
                    for (const oi of o.items) {
                        const idx = productIdxMap.get(oi.product_id)
                        if (idx !== undefined) itemsArray[idx] = oi.quantity
                    }
                }
                return {
                    id: o.id,
                    name: o.customer_nickname,
                    items: itemsArray,
                    memo1: o.customer_memo_1 || "",
                    memo2: o.customer_memo_2 || "",
                    crm: crmDict[o.customer_nickname] || null,
                    checked: o.is_received || false,
                    pickup_date: o.pickup_date,
                    originalIndex: index
                }
            })

            setRawCustomers(mappedCustomers)
            setPickupCache(cacheKey, mappedCustomers, mappedProducts, availableDates)
            setIsLoading(false)
            return
        }

        // -- FALLBACK PATH (Legacy) --
        const orderIds = orders.map(o => o.id)
        let orderItems: any[] = []
        const CHUNK_SIZE = 30
        for (let i = 0; i < orderIds.length; i += CHUNK_SIZE) {
            const chunk = orderIds.slice(i, i + CHUNK_SIZE)
            const { data: chunkData } = await supabase.from('order_items').select('*').in('order_id', chunk)
            if (chunkData) orderItems = orderItems.concat(chunkData)
        }

        const itemsByOrderId: { [key: string]: any[] } = {}
        for(const item of orderItems) {
            if(!itemsByOrderId[item.order_id]) itemsByOrderId[item.order_id] = []
            itemsByOrderId[item.order_id].push(item)
        }

        const productIdxMap = new Map<string, number>()
        mappedProducts.forEach((p, i) => productIdxMap.set(p.id, i))

        const mappedCustomersLegacy = orders.map((o, index) => {
            const myItems = itemsByOrderId[o.id] || []
            const itemsArray = new Array(mappedProducts.length).fill(0)
            for (const oi of myItems) {
                const idx = productIdxMap.get(oi.product_id)
                if (idx !== undefined) itemsArray[idx] = oi.quantity
            }
            return {
                id: o.id,
                name: o.customer_nickname,
                items: itemsArray,
                memo1: o.customer_memo_1 || "",
                memo2: o.customer_memo_2 || "",
                crm: crmDict[o.customer_nickname] || null,
                checked: o.is_received || false,
                pickup_date: o.pickup_date,
                originalIndex: index
            }
        })

        setRawCustomers(mappedCustomersLegacy)
        setPickupCache(cacheKey, mappedCustomersLegacy, mappedProducts, availableDates)
        setIsLoading(false)
    }

    const toggleDeleteSelect = (id: string) => {
        setSelectedDeleteIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    }

    const executeBulkDelete = async () => {
        if (selectedDeleteIds.length === 0) return alert("삭제할 대상을 체크해주세요.");
        if (!confirm(`선택된 ${selectedDeleteIds.length}개의 주문을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return;

        setIsLoading(true);
        // Delete items from order_items first
        const { error: itemsErr } = await supabase.from('order_items').delete().in('order_id', selectedDeleteIds);
        if (itemsErr) console.error("Failed deleting items:", itemsErr);
        
        // Delete orders
        const { error: ordersErr } = await supabase.from('orders').delete().in('id', selectedDeleteIds);
        if (ordersErr) console.error("Failed deleting orders:", ordersErr);
        
        alert(`총 ${selectedDeleteIds.length}개의 주문이 일괄 삭제되었습니다.`);
        setIsDeleteMode(false);
        setSelectedDeleteIds([]);
        fetchMatrixData(true);
    }

    const handleDeleteReceivedOrders = async () => {
        if (!storeId) return
        // 현재 화면의 날짜 라벨
        const dateLabel = (() => {
            if (currentDate === "상시판매") return "상시판매"
            const parts = currentDate.split("-")
            if (parts.length === 3) return `${parts[1]}월${parts[2]}일`
            return currentDate
        })()

        // 1) 해당 날짜 + is_received=true 주문 조회
        const targetDbDate = currentDate === "상시판매" ? "1900-01-01" : currentDate
        const { data: receivedOrders, error: fErr } = await supabase
            .from("orders")
            .select("id, customer_nickname, pickup_date, customer_memo_1, customer_memo_2, is_received")
            .eq("store_id", storeId)
            .eq("is_hidden", false)
            .eq("is_received", true)
            .eq("pickup_date", targetDbDate)
        if (fErr) { alert("조회 실패: " + fErr.message); return }
        if (!receivedOrders || receivedOrders.length === 0) {
            alert(`${dateLabel}의 수령 완료 주문이 없습니다.`)
            return
        }

        if (!confirm(`${dateLabel}의 수령제품을 삭제하시겠습니까?\n대상: ${receivedOrders.length}건\n\n자동으로 엑셀 백업이 먼저 다운로드됩니다.`)) return

        setIsLoading(true)
        try {
            // 2) order_items 조회 (청크)
            const orderIds = receivedOrders.map(o => o.id)
            let allItems: any[] = []
            const CHUNK = 30
            for (let i = 0; i < orderIds.length; i += CHUNK) {
                const { data } = await supabase.from("order_items").select("*").in("order_id", orderIds.slice(i, i + CHUNK))
                if (data) allItems = allItems.concat(data)
            }

            // 3) 상품 dict
            const productIds = Array.from(new Set(allItems.map(it => it.product_id)))
            let prodDict: Record<string, { name: string; price: number }> = {}
            if (productIds.length > 0) {
                const { data: prodRows } = await supabase.from("products").select("id, collect_name, price").in("id", productIds)
                ;(prodRows || []).forEach(p => { prodDict[p.id] = { name: p.collect_name || "(이름없음)", price: p.price || 0 } })
            }

            // 4) 업로드 양식과 동일한 행 구성
            const rows: any[] = []
            for (const o of receivedOrders) {
                const items = allItems.filter(it => it.order_id === o.id)
                if (items.length === 0) {
                    rows.push({
                        "고객명": o.customer_nickname,
                        "픽업일": o.pickup_date === "1900-01-01" ? "상시판매" : o.pickup_date,
                        "상품명": "",
                        "발주수량": 0,
                        "가격": 0,
                        "주문확인": o.is_received ? "O" : "X",
                        "고객비고1": o.customer_memo_1 || "",
                        "고객비고2": o.customer_memo_2 || "",
                    })
                    continue
                }
                for (const it of items) {
                    const p = prodDict[it.product_id]
                    rows.push({
                        "고객명": o.customer_nickname,
                        "픽업일": o.pickup_date === "1900-01-01" ? "상시판매" : o.pickup_date,
                        "상품명": p?.name || "(삭제된 상품)",
                        "발주수량": it.quantity,
                        "가격": p?.price || 0,
                        "주문확인": o.is_received ? "O" : "X",
                        "고객비고1": o.customer_memo_1 || "",
                        "고객비고2": o.customer_memo_2 || "",
                    })
                }
            }

            // 5) 엑셀 저장
            const ws = XLSX.utils.json_to_sheet(rows)
            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, "수령주문백업")
            const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "")
            const safeLabel = dateLabel.replace(/[월일]/g, "")
            const fname = `수령백업_${safeLabel}_${stamp}.xlsx`
            XLSX.writeFile(wb, fname)

            // 6) DB 삭제 (order_items → orders 순)
            for (let i = 0; i < orderIds.length; i += CHUNK) {
                const chunk = orderIds.slice(i, i + CHUNK)
                const { error: iErr } = await supabase.from("order_items").delete().in("order_id", chunk)
                if (iErr) throw iErr
            }
            for (let i = 0; i < orderIds.length; i += CHUNK) {
                const chunk = orderIds.slice(i, i + CHUNK)
                const { error: oErr } = await supabase.from("orders").delete().in("id", chunk)
                if (oErr) throw oErr
            }

            alert(`${dateLabel}의 수령제품 ${receivedOrders.length}건 삭제 완료.\n백업 엑셀이 다운로드됐습니다.\n복원 시 '더보기(⋮) → 엑셀 일괄 등록' 메뉴로 재업로드하세요.`)
            await fetchMatrixData(true)
        } catch (e: any) {
            console.error(e)
            alert("삭제 중 오류: " + (e?.message || e))
        } finally {
            setIsLoading(false)
        }
    }

    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !storeId) return

        try {
            cancelUploadRef.current = false
            setIsLoading(true)
            const buffer = await file.arrayBuffer()
            const wb = XLSX.read(buffer, { type: 'array' })
            const ws = wb.Sheets[wb.SheetNames[0]]
            const data = XLSX.utils.sheet_to_json(ws) as any[]

            if (data.length === 0) {
                alert("엑셀 파일에 데이터가 없습니다.")
                return
            }

            const newOrders: any[] = []

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
                    // standard excel date format conversion
                    const dateObj = new Date(Math.round((pickupDateObj - 25569) * 86400 * 1000))
                    formattedDate = dateObj.toISOString().split('T')[0]
                } else {
                    // manual text parse fallback (e.g. "3월 31일", "03.31", "04-01(수)", "2026. 03. 31.")
                    let cleanedDate = formattedDate.replace(/\(.*?\)/g, '').trim();
                    const currentYear = new Date().getFullYear();
                    
                    // Match full year format first: YYYY년 M월 D일 or YYYY.MM.DD
                    const fullParts = cleanedDate.match(/(\d{4})[\-\.\/년\s]+(\d{1,2})[\-\.\/월\s]+(\d{1,2})[일\.]?/);
                    if (fullParts) {
                        formattedDate = `${fullParts[1]}-${fullParts[2].padStart(2, '0')}-${fullParts[3].padStart(2, '0')}`;
                    } else {
                        // Match partial format: M월 D일 or MM.DD or MM-DD
                        const partialParts = cleanedDate.match(/(\d{1,2})[\-\.\/월\s]+(\d{1,2})[일\.]?/);
                        if (partialParts) {
                            formattedDate = `${currentYear}-${partialParts[1].padStart(2, '0')}-${partialParts[2].padStart(2, '0')}`;
                        } else {
                            formattedDate = cleanedDate;
                        }
                    }
                }

                // 엑셀의 원본 내역 1줄을 1건의 주문으로 무조건 개별 등록
                newOrders.push({
                    customerName,
                    pickupDate: formattedDate,
                    memos: [memo1, memo2],
                    items: [{ productName, qty, price }],
                    isReceived: isConfirmed
                })
            }

            if (newOrders.length === 0) {
                alert("유효한 데이터 포맷을 찾을 수 없습니다. (고객명, 픽업일, 상품명 필수)")
                return
            }

            setUploadProgress({ current: 10, total: 100, isUploading: true })

            // 1. Bulk Insert Orders First
            const orderPayloads = newOrders.map(order => ({
                store_id: storeId,
                pickup_date: order.pickupDate,
                customer_nickname: order.customerName,
                is_received: order.isReceived,
                customer_memo_1: order.memos[0] || "",
                customer_memo_2: order.memos[1] || ""
            }))

            const { data: insertedOrders, error: bulkOrderErr } = await supabase.from('orders').insert(orderPayloads).select()

            if (bulkOrderErr || !insertedOrders || insertedOrders.length === 0) {
                console.error("Bulk Order Insert Error:", bulkOrderErr)
                alert(`오류 발생: 주문 데이터를 DB에 저장하지 못했습니다.\n네트워크 또는 제약 조건 오류: ${bulkOrderErr?.message || '알 수 없음'}`)
                setIsLoading(false)
                setUploadProgress({ current: 0, total: 0, isUploading: false })
                return
            }

            if (cancelUploadRef.current) {
                await supabase.from('orders').delete().in('id', insertedOrders.map(o => o.id))
                alert("엑셀 일괄 업로드가 중지되어, 방금 파일에 있던 모든 데이터가 안전하게 삭제(롤백)되었습니다.")
                return
            }

            setUploadProgress({ current: 50, total: 100, isUploading: true })

            let successCount = insertedOrders.length
            const localProducts = [...products]
            const orderItemsPayload: any[] = []

            for (let i = 0; i < insertedOrders.length; i++) {
                if (cancelUploadRef.current) {
                    await supabase.from('orders').delete().in('id', insertedOrders.map(o => o.id))
                    alert("엑셀 일괄 업로드가 중지되어, 방금 파일에 있던 모든 데이터가 안전하게 삭제(롤백)되었습니다.")
                    return
                }
                const dbOrder = insertedOrders[i]
                const originalOrder = newOrders[i]

                for (const item of originalOrder.items) {
                    let matchedProduct = localProducts.find(p => p.name === item.productName)

                    if (!matchedProduct) {
                        const { data: newProd, error: pErr } = await supabase.from('products').insert({
                            store_id: storeId,
                            collect_name: item.productName,
                            display_name: item.productName,
                            target_date: originalOrder.pickupDate,
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
                        orderItemsPayload.push({
                            order_id: dbOrder.id,
                            product_id: matchedProduct.id,
                            quantity: item.qty
                        })
                    }
                }
            }

            setUploadProgress({ current: 80, total: 100, isUploading: true })

            if (cancelUploadRef.current) {
                await supabase.from('orders').delete().in('id', insertedOrders.map(o => o.id))
                alert("엑셀 일괄 업로드가 중지되어, 방금 파일에 있던 모든 데이터가 안전하게 삭제(롤백)되었습니다.")
                return
            }

            // 2. Bulk Insert Order Items
            if (orderItemsPayload.length > 0) {
                const { error: itemBulkErr } = await supabase.from('order_items').insert(orderItemsPayload)
                if (itemBulkErr) {
                    console.error("Bulk Item Insert Error:", itemBulkErr)
                    alert(`일부 주문 상품 매핑에 실패했습니다: ${itemBulkErr.message}`)
                }
            }

            setUploadProgress({ current: 100, total: 100, isUploading: true })
            alert(`완료! 총 ${successCount}건의 개별 주문 내역이 묶임 없이 원본 그대로 성공적으로 일괄 업로드되었습니다.`)
            fetchMatrixData(true)
        } catch (err: any) {
            console.error("Excel import error:", err)
            alert(`처리 중 에러가 발생했습니다: ${err.message}`)
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = ""
            setUploadProgress({ current: 0, total: 0, isUploading: false })
            setIsLoading(false)
        }
    }

    const handleUpdateQuantity = async (orderId: string, productIdx: number, newQtyStr: string) => {
        setEditingQty(null)
        if (!storeId) return

        const targetProduct = products[productIdx]
        if (!targetProduct) return

        let validQty = parseInt(newQtyStr)
        if (isNaN(validQty) || validQty < 0) validQty = 0

        const order = rawCustomers.find(c => c.id === orderId)
        if (!order) return
        
        const oldQty = order.items[productIdx] || 0
        if (oldQty === validQty) return
        
        setIsLoading(true)

        try {
            if (validQty === 0) {
                await supabase.from('order_items').delete().eq('order_id', orderId).eq('product_id', targetProduct.id)
            } else {
                const { data: existing } = await supabase.from('order_items').select('id').eq('order_id', orderId).eq('product_id', targetProduct.id).single()
                if (existing) {
                    await supabase.from('order_items').update({ quantity: validQty }).eq('id', existing.id)
                } else {
                    await supabase.from('order_items').insert({ order_id: orderId, product_id: targetProduct.id, quantity: validQty })
                }
            }
            await fetchMatrixData(true)
        } catch (e) {
            console.error("Update quantity error", e)
            alert("수량 변경 중 오류가 발생했습니다.")
        } finally {
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
        const targetProduct = transferAvailableProducts[idx]
        const sourceDate = transferSourceDate || currentDate
        const newDate_tf = isTransferToRegular ? null : transferNewDate
        const newPickup = isTransferToRegular ? '1900-01-01' : transferNewDate

        if (!confirm(`[${targetProduct.name}] 상품을 ${isTransferToRegular ? '상시판매로 전환' : sourceDate + ' → ' + transferNewDate + '로 이동'}하시겠습니까?`)) return

        setIsLoading(true)
        const errors: string[] = []

        // 1. 상품 속성 변경
        const { error: pErr } = await supabase.from('products').update({
            target_date: newDate_tf,
            is_regular_sale: isTransferToRegular
        }).eq('id', targetProduct.id)
        if (pErr) errors.push(`상품 변경 실패: ${pErr.message}`)

        // 2. 해당 날짜의 주문 중 이 상품이 포함된 주문 처리 (주문 분리 방식)
        const { data: oData, error: oErr } = await supabase.from('orders').select('id, customer_nickname, is_received').eq('store_id', storeId).eq('pickup_date', sourceDate)
        if (oErr) errors.push(`주문 조회 실패: ${oErr.message}`)

        if (oData && oData.length > 0) {
            const orderIds = oData.map((o: any) => o.id)
            // 이동 대상 상품의 order_items 조회
            const { data: oiData, error: oiErr } = await supabase.from('order_items').select('id, order_id, quantity').eq('product_id', targetProduct.id).in('order_id', orderIds)
            if (oiErr) errors.push(`주문항목 조회 실패: ${oiErr.message}`)

            if (oiData && oiData.length > 0) {
                // 각 주문별로 다른 상품이 있는지 확인
                const affectedOrderIds = [...new Set(oiData.map((oi: any) => oi.order_id))]
                const { data: allItems, error: allErr } = await supabase.from('order_items').select('id, order_id').in('order_id', affectedOrderIds)
                if (allErr) errors.push(`전체 주문항목 조회 실패: ${allErr.message}`)

                const itemCountByOrder: Record<string, number> = {}
                if (allItems) {
                    for (const item of allItems) {
                        itemCountByOrder[item.order_id] = (itemCountByOrder[item.order_id] || 0) + 1
                    }
                }

                for (const oId of affectedOrderIds) {
                    const orderItemsToMove = oiData.filter((oi: any) => oi.order_id === oId)
                    const totalItemsInOrder = itemCountByOrder[oId] || 0
                    const movingCount = orderItemsToMove.length

                    if (movingCount >= totalItemsInOrder) {
                        // 이 주문에 이동 대상 상품만 있음 → 주문 자체의 pickup_date 변경
                        const { error: uErr } = await supabase.from('orders').update({ pickup_date: newPickup }).eq('id', oId)
                        if (uErr) errors.push(`주문 ${oId.slice(0,8)} 변경 실패: ${uErr.message}`)
                    } else {
                        // 이 주문에 다른 상품도 있음 → 새 주문으로 분리
                        const originalOrder = oData.find((o: any) => o.id === oId)
                        const { data: newOrder, error: nErr } = await supabase.from('orders').insert({
                            store_id: storeId,
                            pickup_date: newPickup,
                            customer_nickname: originalOrder?.customer_nickname || '',
                            is_received: originalOrder?.is_received || false
                        }).select().single()

                        if (nErr || !newOrder) {
                            errors.push(`주문 분리 실패 (${oId.slice(0,8)}): ${nErr?.message}`)
                            continue
                        }

                        // order_items를 새 주문으로 이동
                        const moveIds = orderItemsToMove.map((oi: any) => oi.id)
                        const { error: mvErr } = await supabase.from('order_items').update({ order_id: newOrder.id }).in('id', moveIds)
                        if (mvErr) errors.push(`주문항목 이동 실패 (${oId.slice(0,8)}): ${mvErr.message}`)
                    }
                }
            }
        }

        if (errors.length > 0) {
            alert(`⚠️ 일부 오류 발생:\n${errors.join('\n')}`)
            console.error("Transfer errors:", errors)
        } else {
            alert("✅ 이관 및 상품 동기화 반영이 완료되었습니다.")
        }
        setIsTransferModalOpen(false)
        fetchMatrixData(true)
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
        const dbDate = actualDate === "상시판매" ? "1900-01-01" : actualDate

        const { data: oData, error: oErr } = await supabase.from('orders').insert({
            store_id: storeId,
            pickup_date: dbDate,
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
            fetchMatrixData(true)
        } else {
            alert("주문 추가 실패: " + oErr?.message)
            setIsLoading(false)
        }
    }

    const handleAddRowSave = async () => {
        if (!addRowNick.trim()) return alert("닉네임을 입력해주세요.")
        const itemsToAdd = Object.entries(addRowQtys)
            .map(([idx, q]) => ({ productIndex: parseInt(idx), qty: parseInt(q) || 0 }))
            .filter(e => e.qty > 0)
        if (itemsToAdd.length === 0) return alert("최소 1개 상품의 수량을 입력해주세요.")

        setIsLoading(true)
        const actualDate = currentDate === "상시판매" ? "1900-01-01" : currentDate

        const { data: oData, error: oErr } = await supabase.from('orders').insert({
            store_id: storeId,
            pickup_date: actualDate,
            customer_nickname: addRowNick.trim(),
            is_received: false,
            is_hidden: false,
            customer_memo_1: "수기 등록"
        }).select().single()

        if (oData) {
            const orderItems = itemsToAdd.map(e => ({
                order_id: oData.id,
                product_id: products[e.productIndex].id,
                quantity: e.qty
            }))
            const { error: oiErr } = await supabase.from('order_items').insert(orderItems)
            if (oiErr) alert("주문항목 저장 실패: " + oiErr.message)

            setIsAddingRow(false)
            setAddRowNick("")
            setAddRowQtys({})
            fetchMatrixData(true)
        } else {
            alert("주문 추가 실패: " + oErr?.message)
            setIsLoading(false)
        }
    }

    const toggleCheck = async (id: string, current: boolean, name?: string) => {
        try {
            if (isMerged && name) {
                const targetIds = rawCustomers.filter(rc => rc.name === name).map(rc => rc.id).filter(Boolean) as string[]
                if (targetIds.length > 0) {
                    setRawCustomers(prev => prev.map(c => targetIds.includes(c.id) ? { ...c, checked: !current } : c))
                    const { error } = await supabase.from('orders').update({ is_received: !current }).in('id', targetIds)
                    if (error) throw error
                }
            } else {
                if (!id) return
                setRawCustomers(prev => prev.map(c => c.id === id ? { ...c, checked: !current } : c))
                const { error } = await supabase.from('orders').update({ is_received: !current }).eq('id', id)
                if (error) throw error
            }
        } catch (err: any) {
            console.error("수령 체크 변경 오류:", err)
            // Rollback optimistic state changes upon failure
            if (isMerged && name) {
                const targetIds = rawCustomers.filter(rc => rc.name === name).map(rc => rc.id).filter(Boolean) as string[]
                setRawCustomers(prev => prev.map(c => targetIds.includes(c.id) ? { ...c, checked: current } : c))
            } else {
                setRawCustomers(prev => prev.map(c => c.id === id ? { ...c, checked: current } : c))
            }
            alert(`옵티미스틱 업데이트 롤백: 상태 변경 실패 (${err.message})`)
        }
    }

    const handleHideDataByDate = async () => {
        if (!currentDate) return;
        const confirmMsg = `${currentDate} 일자의 모든 [상품]과 [주문 내역]을 숨김 처리하시겠습니까?\n이 작업 후에는 관리자 화면 및 고객 검색에서 해당 날짜의 데이터가 보이지 않게 됩니다.`;
        if (!confirm(confirmMsg)) return;

        try {
            setIsLoading(true);
            
            // 1. Hide Products for the target_date
            const { error: pErr } = await supabase
                .from('products')
                .update({ is_hidden: true })
                .eq('store_id', storeId)
                .eq('target_date', currentDate)
                .eq('is_regular_sale', false); // Do not hide regular items
            
            if (pErr) throw pErr;

            // 2. Hide Orders for the pickup_date
            const { error: oErr } = await supabase
                .from('orders')
                .update({ is_hidden: true })
                .eq('store_id', storeId)
                .eq('pickup_date', currentDate);
            
            if (oErr) throw oErr;

            alert(`${currentDate} 일자 데이터가 성공적으로 숨김 처리되었습니다.`);
            
            // Re-fetch data
            await fetchMatrixData(true);
            
        } catch (error: any) {
            console.error("Bulk hide by date error:", error);
            alert("일괄 숨김 처리 중 오류가 발생했습니다: " + error.message);
        } finally {
            setIsLoading(false);
        }
    }

    const handleUnhideDataByDate = async () => {
        if (!currentDate) return;
        const confirmMsg = `${currentDate} 일자의 숨겨진 [상품]과 [주문 내역]을 다시 화면에 보이도록 복구 (숨김 해제)하시겠습니까?`;
        if (!confirm(confirmMsg)) return;

        try {
            setIsLoading(true);
            
            // 1. Unhide Products for the target_date
            const { error: pErr } = await supabase
                .from('products')
                .update({ is_hidden: false })
                .eq('store_id', storeId)
                .eq('target_date', currentDate);
            
            if (pErr) throw pErr;

            // 2. Unhide Orders for the pickup_date
            const { error: oErr } = await supabase
                .from('orders')
                .update({ is_hidden: false })
                .eq('store_id', storeId)
                .eq('pickup_date', currentDate);
            
            if (oErr) throw oErr;

            alert(`${currentDate} 일자의 데이터가 성공적으로 복구(숨김 해제)되었습니다.`);
            
            // Re-fetch data
            await fetchMatrixData(true);
            
        } catch (error: any) {
            console.error("Bulk unhide by date error:", error);
            alert("일괄 숨김 해제 중 오류가 발생했습니다: " + error.message);
        } finally {
            setIsLoading(false);
        }
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

    const handleUpdateMemo = async (id: string, field: 'customer_memo_1' | 'customer_memo_2', val: string, customerName?: string) => {
        const memoKey = field === 'customer_memo_1' ? 'memo1' : 'memo2'
        if (isMerged && customerName) {
            // 합치기 모드: 같은 닉네임의 모든 주문에 동일 값 저장
            const targetIds = rawCustomers.filter(c => c.name === customerName).map(c => c.id).filter(Boolean)
            if (targetIds.length > 0) {
                const { error } = await supabase.from('orders').update({ [field]: val }).in('id', targetIds)
                if (!error) {
                    setRawCustomers(prev => prev.map(c => targetIds.includes(c.id) ? { ...c, [memoKey]: val } : c))
                }
            }
            return
        }
        const { error } = await supabase.from('orders').update({ [field]: val }).eq('id', id)
        if (!error) {
            setRawCustomers(prev => prev.map(c =>
                c.id === id ? { ...c, [memoKey]: val } : c
            ))
        }
    }

    const handleUpdateProductField = async (productId: string, field: 'price' | 'allocated_stock' | 'product_memo', value: string) => {
        if (!productId) return;
        const finalValue = field === 'product_memo' ? value : (parseInt(value) || 0)
        const { error } = await supabase.from('products').update({ [field]: finalValue }).eq('id', productId)
        if (!error) {
            setProducts(prev => prev.map(p => {
                if (p.id !== productId) return p;
                if (field === 'allocated_stock') return { ...p, stock: finalValue as number };
                if (field === 'price') return { ...p, price: finalValue as number };
                if (field === 'product_memo') return { ...p, product_memo: finalValue as string };
                return p;
            }))
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

    const getSummary = (items: number[]) => {
        return items.map((qty, index) => {
            if (qty <= 0) return null;
            const p = products[index];
            let datePrefix = "";
            if (p?.target_date) {
                const parts = p.target_date.split('-');
                if (parts.length === 3) {
                    datePrefix = `(${parts[1]}월${parts[2]}일) `;
                }
            } else if (p?.is_regular_sale) {
                datePrefix = "(상시) ";
            }
            const unitStr = p?.unit_text ? `(${p.unit_text})` : "";
            return `${datePrefix}${p?.name || "(이름없음)"}${unitStr} ${qty}개`;
        }).filter(Boolean).join(" / ")
    }

    // 주문이 1건이라도 있는 상품만 표시 (렌더링 최적화)
    const activeProductIndices = useMemo(() => {
        return products.map((_, i) => i).filter(i =>
            rawCustomers.some(c => c.items[i] > 0)
        )
    }, [products, rawCustomers])

    const displayProducts = useMemo(() =>
        activeProductIndices.map(i => products[i]),
        [activeProductIndices, products]
    )

    const toDisplayItems = (items: number[]) => activeProductIndices.map(i => items[i] || 0)

    const getDisplaySummary = (items: number[]) => {
        return activeProductIndices.map(di => {
            const qty = items[di] || 0
            if (qty <= 0) return null
            const p = products[di]
            let datePrefix = ""
            if (p?.target_date) {
                const parts = p.target_date.split('-')
                if (parts.length === 3) datePrefix = `(${parts[1]}월${parts[2]}일) `
            } else if (p?.is_regular_sale) {
                datePrefix = "(상시) "
            }
            const unitStr = p?.unit_text ? `(${p.unit_text})` : ""
            return `${datePrefix}${p?.name || "(이름없음)"}${unitStr} ${qty}개`
        }).filter(Boolean).join(" / ")
    }

    // 기간검색 드릴다운: focusedDate 가 설정되어 있으면 그 날짜의 주문만 남김 (병합 전 선-필터링)
    const dateFilteredRaw = (searchScope === "date_range" && focusedDate)
        ? rawCustomers.filter(c => {
            const target = focusedDate === "상시판매" ? "1900-01-01" : focusedDate
            return c.pickup_date === target
        })
        : rawCustomers

    const customers = isMerged
        ? dateFilteredRaw.reduce((acc, current) => {
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
        : dateFilteredRaw

    const filteredCustomers = customers.filter(c => {
        const lowerTerm = (activeSearchTerm || "").toLowerCase()
        const custName = (c.name || "").toLowerCase()
        const summaryText = getDisplaySummary(c.items).toLowerCase()
        const memo1 = (c.memo1 || "").toLowerCase()
        const memo2 = (c.memo2 || "").toLowerCase()

        let matchSearch = true
        if (lowerTerm) {
            if (searchField === "nickname") matchSearch = custName.includes(lowerTerm)
            else if (searchField === "product") matchSearch = summaryText.includes(lowerTerm)
            else if (searchField === "memo") matchSearch = memo1.includes(lowerTerm) || memo2.includes(lowerTerm)
            else matchSearch = custName.includes(lowerTerm) || summaryText.includes(lowerTerm) || memo1.includes(lowerTerm) || memo2.includes(lowerTerm)
        }
        const matchReceipt = receiptFilter === "unreceived" ? !c.checked : (receiptFilter === "received" ? c.checked : true)
        return matchSearch && matchReceipt
    }).sort((a, b) => {
        if (sortOrder === "name") return (a.name || "").localeCompare(b.name || "", 'ko')
        return (a.originalIndex || 0) - (b.originalIndex || 0)
    })

    const calculateItemPrice = (product: Product | undefined, qty: number) => {
        if (!product || qty <= 0) return 0;
        const tiers = product.tiered_prices;
        if (!tiers || tiers.length === 0) return qty * (product.price || 0);

        const sortedTiers = [...tiers].sort((a, b) => b.qty - a.qty);
        let remainingQty = qty;
        let totalPrice = 0;

        for (const tier of sortedTiers) {
            if (remainingQty >= tier.qty && tier.qty > 0) {
                const chunks = Math.floor(remainingQty / tier.qty);
                totalPrice += chunks * tier.price;
                remainingQty -= chunks * tier.qty;
            }
        }
        
        if (remainingQty > 0) {
            totalPrice += remainingQty * (product.price || 0);
        }
        return totalPrice;
    }

    const calculatePosTotal = () => {
        return filteredCustomers.filter(c => selectedPosOrders.includes(c.id)).reduce((total, c) => {
            return total + activeProductIndices.reduce((t, oi) => t + calculateItemPrice(products[oi], c.items[oi] || 0), 0)
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
                "주문 요약": getDisplaySummary(c.items),
                "결제 금액": activeProductIndices.reduce((total, oi) => total + ((c.items[oi] || 0) * (products[oi]?.price || 0)), 0),
                "비고 1": c.memo1,
                "비고 2": c.memo2
            }
            displayProducts.forEach((p, di) => {
                const oi = activeProductIndices[di]
                row[p.name] = (c.items[oi] || 0) > 0 ? c.items[oi] : ""
            })
            return row
        })

        const totalRow: any = {
            "고객명": "총 합계",
            "수령확인": "",
            "주문 요약": "",
            "결제 금액": rawCustomers.reduce((globalTotal, c) => globalTotal + activeProductIndices.reduce((t, oi) => t + ((c.items[oi] || 0) * (products[oi]?.price || 0)), 0), 0),
            "비고 1": "",
            "비고 2": ""
        }
        displayProducts.forEach((p, di) => {
            const oi = activeProductIndices[di]
            const sum = rawCustomers.reduce((acc, curr) => acc + (curr.items[oi] || 0), 0)
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
                        <div className="mt-2 text-center">
                            <Button variant="destructive" onClick={() => { cancelUploadRef.current = true }} className="w-full font-bold h-10 shadow-sm text-sm">업로드 중지 및 취소</Button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-bold tracking-tight">주문관리</h2>
                <div className="flex items-start gap-2 p-3 rounded-md border border-amber-200 bg-amber-50 text-amber-900 text-sm font-medium shadow-sm">
                    <span className="shrink-0">📢</span>
                    <span>주문정보가 많아지면 기능이 저하될 수 있습니다. 수령 완료된 과거 주문은 주기적으로 삭제해주세요.</span>
                </div>
            </div>

            <div className="flex flex-col gap-4 bg-muted/20 p-4 rounded-lg border shadow-sm">
                {/* 1번째 줄: 날짜 선택과 검색 영역 (상하 2줄 분리) */}
                <div className="flex flex-col gap-4 w-full">
                    <div className="flex items-center gap-2 sm:gap-4 w-full overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden">
                        <CalendarIcon className="h-5 w-5 text-muted-foreground hidden sm:block shrink-0" />
                        <div className="flex flex-nowrap gap-2 items-center w-max">
                            {availableDates.map(date => {
                                let label = date;
                                if (date !== "상시판매") {
                                    const d = new Date(date);
                                    if (!isNaN(d.getTime())) label = `${date} (${d.toLocaleDateString('ko-KR', { weekday: 'short' })})`;
                                }
                                const isFocused = searchScope === "date_range" && focusedDate === date
                                const isCurrent = searchScope !== "date_range" && currentDate === date
                                return (
                                <Button
                                    key={date}
                                    variant={isCurrent ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => {
                                        if (searchScope === "date_range") {
                                            // 기간검색 유지 상태에서는 focusedDate 토글 (드릴다운)
                                            setFocusedDate(prev => prev === date ? null : date)
                                        } else {
                                            setCurrentDate(date)
                                            setSearchScope("today")
                                        }
                                    }}
                                    className={`rounded-full shadow-sm transition-all whitespace-nowrap px-4 h-10 font-bold ${
                                        isCurrent
                                            ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-transparent'
                                            : isFocused
                                                ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-2 border-amber-400'
                                                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                                    }`}
                                    title={searchScope === "date_range" ? "기간검색 중 - 클릭하면 이 날짜 주문만 표시" : undefined}
                                >
                                    {isFocused && <span className="mr-1">🔍</span>}{label}
                                </Button>
                                )
                            })}
                            <Input
                                type="date"
                                className="w-[140px] h-10 font-bold bg-white border-slate-200 rounded-full shadow-sm text-center text-slate-600 focus-visible:ring-indigo-500 transition-colors cursor-pointer shrink-0"
                                value={searchScope === "date_range" && focusedDate && focusedDate !== "상시판매" ? focusedDate : (searchScope === "date_range" ? "" : currentDate)}
                                onChange={(e) => {
                                    const v = e.target.value
                                    if (!v) return
                                    if (searchScope === "date_range" && customSearchDate && customEndDate && v >= customSearchDate && v <= customEndDate) {
                                        // 기간 내: focusedDate 설정 (기간검색 유지)
                                        setFocusedDate(v)
                                    } else if (searchScope === "date_range" && customSearchDate && !customEndDate && v === customSearchDate) {
                                        setFocusedDate(v)
                                    } else {
                                        // 기간 밖 또는 다른 scope: scope 전환
                                        setCurrentDate(v)
                                        setSearchScope("today")
                                    }
                                }}
                                title={searchScope === "date_range" ? "기간 내 날짜는 드릴다운, 기간 밖 날짜는 이동" : "달력에서 날짜 직접 지정"}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-2 w-full bg-muted/30 p-1.5 rounded-md border shrink-0">
                        <div className="flex items-center gap-2 w-full">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder={
                                        searchField === "nickname" ? "닉네임 입력 후 엔터 또는 🔍 클릭"
                                        : searchField === "product" ? "상품명 입력 후 엔터 또는 🔍 클릭"
                                        : searchField === "memo" ? "비고 입력 후 엔터 또는 🔍 클릭"
                                        : (searchScope === "all_dates" ? "닉네임 또는 상품명 입력 후 엔터 또는 🔍 클릭" : "닉네임, 상품명, 비고 입력 후 엔터 또는 🔍 클릭")
                                    }
                                    className="pl-9 bg-white h-10 w-full shadow-sm pr-3"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") setActiveSearchTerm(searchTerm) }}
                                />
                            </div>
                            <Button
                                type="button"
                                onClick={() => setActiveSearchTerm(searchTerm)}
                                className="h-10 w-10 shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm p-0"
                                title="검색"
                            >
                                <Search className="h-4 w-4" />
                            </Button>
                            {activeSearchTerm && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => { setActiveSearchTerm(""); setSearchTerm("") }}
                                    className="h-10 px-3 shrink-0 shadow-sm"
                                    title="검색어 초기화"
                                >
                                    초기화
                                </Button>
                            )}
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <Select value={searchScope} onValueChange={setSearchScope}>
                                <SelectTrigger className="w-[calc(50%-4px)] sm:w-[130px] h-10 bg-white border-muted shadow-sm font-medium shrink-0">
                                    <SelectValue placeholder="검색 범위" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="today">해당 달력선택일</SelectItem>
                                    <SelectItem value="date_range" className="text-indigo-600 font-bold">특정 기간 검색</SelectItem>
                                    <SelectItem value="all_dates" className="text-blue-600 font-semibold">모든 날짜(전체)</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={receiptFilter} onValueChange={setReceiptFilter}>
                                <SelectTrigger className="w-[calc(50%-4px)] sm:w-[120px] h-10 bg-white border-muted shadow-sm font-medium">
                                    <SelectValue placeholder="수령 상태" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">모든 상태</SelectItem>
                                    <SelectItem value="unreceived" className="text-orange-600 font-semibold">미수령만</SelectItem>
                                    <SelectItem value="received" className="text-emerald-600 font-semibold">수령만</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={sortOrder} onValueChange={(val: any) => setSortOrder(val)}>
                                <SelectTrigger className="w-[calc(50%-4px)] sm:w-[130px] h-10 bg-indigo-50 border-indigo-200 shadow-sm font-bold text-indigo-700 shrink-0">
                                    <SelectValue placeholder="정렬 방식" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="entered" className="font-semibold">⏳ 입력된 순서</SelectItem>
                                    <SelectItem value="name" className="font-semibold">가 가나다 순서</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={searchField} onValueChange={(v: any) => setSearchField(v)}>
                                <SelectTrigger className="w-[calc(50%-4px)] sm:w-[110px] h-10 bg-white border-muted shadow-sm font-medium shrink-0">
                                    <SelectValue placeholder="검색 항목" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">모두</SelectItem>
                                    <SelectItem value="nickname">닉네임</SelectItem>
                                    <SelectItem value="product">상품명</SelectItem>
                                    <SelectItem value="memo">비고</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {searchScope === "date_range" && (
                            <div className="flex items-center gap-1">
                                <Input
                                    type="date"
                                    value={customSearchDate}
                                    onChange={(e) => setCustomSearchDate(e.target.value)}
                                    className="flex-1 h-10 bg-indigo-50/50 shadow-sm border-indigo-200 focus-visible:ring-indigo-500 font-bold text-indigo-700 px-2"
                                    title="시작일"
                                />
                                <span className="font-bold text-indigo-300">~</span>
                                <Input
                                    type="date"
                                    value={customEndDate}
                                    onChange={(e) => setCustomEndDate(e.target.value)}
                                    className="flex-1 h-10 bg-indigo-50/50 shadow-sm border-indigo-200 focus-visible:ring-indigo-500 font-bold text-indigo-700 px-2"
                                    title="종료일"
                                />
                            </div>
                        )}

                        {searchScope === "date_range" && focusedDate && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-amber-300 bg-amber-50 text-amber-900 text-sm font-bold shadow-sm">
                                <span>[{focusedDate}날짜만 검색되고 있습니다.]</span>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setFocusedDate(null)}
                                    className="h-7 px-2 text-xs bg-white border-amber-400 text-amber-800 hover:bg-amber-100"
                                >
                                    설정기간주문보기
                                </Button>
                            </div>
                        )}
                    </div>
                </div>

                {/* 2번째 줄: 핵심 액션 버튼 (수동추가, 삭제, 병합) + 더보기 메뉴 */}
                <div className={`flex flex-col md:flex-row flex-wrap items-center justify-between gap-3 border-t pt-4 border-slate-200/60 mt-2 ${isMobile ? 'hidden' : ''}`}>

                    <GuideBadge text="닉네임과 상품명, 수량을 직접 입력할 수 있어요.">
                    <div className="flex flex-col sm:flex-row items-center gap-2 bg-indigo-50/50 p-1.5 rounded-md border border-indigo-100 shadow-sm w-full xl:w-auto xl:mr-auto">
                        <span className="text-sm font-bold flex items-center gap-1.5 min-w-[max-content] text-indigo-900 border-r border-indigo-200 px-2 shrink-0">
                            <PlusCircle className="h-4 w-4" /> 수동 주문등록
                        </span>
                        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                            <Input type="date" value={newDate || currentDate} onChange={e => { setNewDate(e.target.value); setNewProductId(""); }} className="w-[125px] h-9 bg-white shadow-sm shrink-0 px-2" />
                            <Input placeholder="닉네임" value={newNick} onChange={e => setNewNick(e.target.value)} className="w-[85px] h-9 bg-white shadow-sm shrink-0 px-2" />
                            <Select value={newProductId} onValueChange={setNewProductId}>
                                <SelectTrigger className="w-[130px] h-9 bg-white shadow-sm shrink-0 px-2">
                                    <SelectValue placeholder="상품명" />
                                </SelectTrigger>
                                <SelectContent>
                                    {manualOrderProducts
                                        .sort((a, b) => {
                                            const active = newDate || currentDate;
                                            const aIsTarget = a.target_date === active;
                                            const bIsTarget = b.target_date === active;
                                            if (aIsTarget && !bIsTarget) return -1;
                                            if (!aIsTarget && bIsTarget) return 1;
                                            return a.name.localeCompare(b.name, 'ko-KR');
                                        })
                                        .map((p) => {
                                            const active = newDate || currentDate;
                                            const isTarget = p.target_date === active;
                                            const label = isTarget ? `[해당일] ${p.name}` : `[상시] ${p.name}`;
                                            return (
                                                <SelectItem key={p.id} value={p.id}>{label}</SelectItem>
                                            );
                                        })}
                                </SelectContent>
                            </Select>
                            <Input type="number" placeholder="수량" value={newQty} onChange={e => setNewQty(e.target.value)} className="w-[60px] h-9 bg-white shadow-sm shrink-0 px-2" min="1" />
                            <Button onClick={handleAddOrder} size="sm" className="h-9 bg-indigo-600 hover:bg-indigo-700 text-white min-w-[50px] shadow-sm shrink-0 px-3">
                                등록
                            </Button>
                        </div>
                    </div>
                    </GuideBadge>

                    {/* 우측 핵심 버튼 그룹 */}
                    <div className="flex w-full sm:w-auto gap-2 items-center xl:justify-end">
                        <GuideBadge text="버튼을 누르면 주문을 삭제할 수 있는 체크박스가 보여요. 체크박스를 체크한 후 삭제버튼을 클릭하면 주문이 삭제가되요.">
                        <div className="flex gap-2 w-full sm:w-auto">
                        {isDeleteMode ? (
                            <>
                                <Button variant="outline" onClick={() => { setIsDeleteMode(false); setSelectedDeleteIds([]); }} className="h-10 px-3 w-full sm:w-auto shadow-sm">취소</Button>
                                <Button variant="destructive" onClick={executeBulkDelete} className="h-10 px-3 w-full sm:w-auto shadow-sm gap-1.5 font-bold">
                                    <Trash2 className="h-4 w-4" /> 선택 삭제 ({selectedDeleteIds.length})
                                </Button>
                            </>
                        ) : (
                            <Button variant="outline" onClick={() => setIsDeleteMode(true)} className="gap-2 shadow-sm border border-rose-200 text-rose-600 hover:bg-rose-50 transition-all h-10 w-full sm:w-auto px-3 font-semibold">
                                <Trash2 className="h-4 w-4" /> 삭제 모드
                            </Button>
                        )}
                        <Button variant="outline" onClick={handleDeleteReceivedOrders} className="gap-2 shadow-sm border border-amber-300 text-amber-700 hover:bg-amber-50 transition-all h-10 w-full sm:w-auto px-3 font-semibold">
                            <Trash2 className="h-4 w-4" /> 수령제품 삭제
                        </Button>
                        </div>
                        </GuideBadge>
                        <GuideBadge text="1명의 여러상품을 주문했을 때 여러줄이 한줄로 합칠 수 있어요. 물론 다시 분리할수도 있어요.">
                        <Button
                            variant={isMerged ? "default" : "outline"}
                            className={`gap-2 shadow-sm border transition-all h-10 w-full sm:w-auto px-3 font-semibold ${isMerged ? 'bg-indigo-600 text-white hover:bg-indigo-700 hover:text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
                            onClick={() => setIsMerged(!isMerged)}
                        >
                            <ListCollapse className="h-4 w-4" /> {isMerged ? "병합 취소" : "이름 합치기"}
                        </Button>
                        </GuideBadge>

                        {/* 더보기 (추가 작업) 드롭다운 */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="h-10 px-2 shadow-sm border-slate-300 bg-white hover:bg-slate-100 text-slate-700 shrink-0 outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                                    <MoreVertical className="h-5 w-5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 font-sans">
                                <DropdownMenuLabel>데이터 관리</DropdownMenuLabel>
                                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); fileInputRef.current?.click(); }} className="gap-2 cursor-pointer font-medium">
                                    <UploadCloud className="h-4 w-4 text-emerald-600" /> 엑셀 일괄 등록
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleExportExcel(); }} className="gap-2 cursor-pointer font-medium">
                                    <DownloadCloud className="h-4 w-4 text-emerald-600" /> 현재 날짜 추출 (엑셀)
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDownloadTemplate(); }} className="gap-2 cursor-pointer text-slate-500">
                                    <DownloadCloud className="h-4 w-4" /> 엑셀 양식 다운로드
                                </DropdownMenuItem>

                                <DropdownMenuSeparator />
                                <DropdownMenuLabel>고급 기능</DropdownMenuLabel>
                                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setIsTransferModalOpen(true); }} className="gap-2 cursor-pointer font-medium text-amber-700 focus:text-amber-800 focus:bg-amber-50">
                                    <ArrowRightLeft className="h-4 w-4" /> 상품 픽업일 일괄 변경
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleHideDataByDate(); }} className="gap-2 cursor-pointer font-medium text-rose-600 focus:text-rose-700 focus:bg-rose-50">
                                    <Trash2 className="h-4 w-4" /> 해당 일자 전체 숨김
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleUnhideDataByDate(); }} className="gap-2 cursor-pointer font-medium text-indigo-600 focus:text-indigo-700 focus:bg-indigo-50">
                                    <ListCollapse className="h-4 w-4" /> 해당 일자 전체 숨김 해제 (복구)
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                {/* 숨겨진 픽업일 변경 모달 (Trigger 없이 수동 제어) */}
                <Dialog open={isTransferModalOpen} onOpenChange={setIsTransferModalOpen}>
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
                                        {transferAvailableProducts.map((p, i) => (
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
            </div>

            {isMobile ? (
                <PickupCardList
                    products={products}
                    displayProducts={displayProducts}
                    activeProductIndices={activeProductIndices}
                    filteredCustomers={filteredCustomers}
                    rawCustomers={rawCustomers}
                    isLoading={isLoading}
                    isMerged={isMerged}
                    isDeleteMode={isDeleteMode}
                    selectedDeleteIds={selectedDeleteIds}
                    posSyncEnabled={posSyncEnabled}
                    selectedPosOrders={selectedPosOrders}
                    editingQty={editingQty}
                    tempQty={tempQty}
                    editingMemo={editingMemo}
                    isAddingRow={isAddingRow}
                    addRowNick={addRowNick}
                    addRowQtys={addRowQtys}
                    toggleCheck={toggleCheck}
                    toggleDeleteSelect={toggleDeleteSelect}
                    togglePosSelect={togglePosSelect}
                    togglePosSelectAll={togglePosSelectAll}
                    handleUpdateQuantity={handleUpdateQuantity}
                    handleUpdateMemo={handleUpdateMemo}
                    handleUpdateProductField={handleUpdateProductField}
                    handleDeleteOrder={handleDeleteOrder}
                    handleAddRowSave={handleAddRowSave}
                    getDisplaySummary={getDisplaySummary}
                    calculateItemPrice={calculateItemPrice}
                    setEditingQty={setEditingQty}
                    setTempQty={setTempQty}
                    setEditingMemo={setEditingMemo}
                    setIsAddingRow={setIsAddingRow}
                    setAddRowNick={setAddRowNick}
                    setAddRowQtys={setAddRowQtys}
                    currentDate={currentDate}
                    manualOrderProducts={manualOrderProducts}
                    newNick={newNick}
                    newDate={newDate}
                    newProductId={newProductId}
                    newQty={newQty}
                    setNewNick={setNewNick}
                    setNewDate={setNewDate}
                    setNewProductId={setNewProductId}
                    setNewQty={setNewQty}
                    handleAddOrder={handleAddOrder}
                    searchScope={searchScope}
                    activeSearchTerm={activeSearchTerm}
                />
            ) : (
            <Card className="overflow-hidden border-border/60 shadow-md bg-card">
                <div className="overflow-x-auto overflow-y-auto w-full" style={{ maxHeight: "calc(100vh - 240px)" }}>
                    <table className="w-full text-sm text-center border-collapse min-w-max relative">
                        <thead className="bg-muted/90 sticky top-0 z-30 shadow-[0_2px_4px_rgba(0,0,0,0.05)]">
                            <tr>
                                <th rowSpan={6} className={`border-b border-r p-3 whitespace-nowrap text-xs sm:text-sm ${getStickyClasses('name').th}`}>
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
                                <th rowSpan={6} className={`border-b border-r px-1 sm:px-2 py-3 whitespace-nowrap align-bottom pb-4 text-[11px] sm:text-sm tracking-tighter sm:tracking-normal cursor-help ${getStickyClasses('receive').th}`} title="수령확인">수령</th>
                                {isDeleteMode && <th rowSpan={6} className={`border-b border-r px-2 py-3 whitespace-nowrap align-bottom pb-4 ${getStickyClasses('delete').th}`}><span className="text-rose-600 font-bold">삭제</span></th>}
                                <th rowSpan={6} className={`border-b border-r px-2 py-0 align-bottom pb-4 ${getStickyClasses('summary').th}`}>
                                    <div className="flex flex-col h-full items-center justify-end pb-0 gap-2">
                                        <div className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 bg-slate-50/80 px-2 py-1.5 rounded w-full min-w-[70px] border shadow-sm ring-1 ring-slate-900/5 mt-2">
                                            <div className="text-slate-800 font-bold border-b border-slate-200 pb-0.5 mb-0.5 tracking-tight">총 {filteredCustomers.length}건</div>
                                            <div className="text-emerald-700 font-semibold tracking-tight">수령: {filteredCustomers.filter(c => c.checked).length}</div>
                                            <div className="text-rose-600 font-semibold tracking-tight">미수령: {filteredCustomers.filter(c => !c.checked).length}</div>
                                        </div>
                                        <span className="text-sm font-bold text-slate-800">주문 상품 요약</span>
                                    </div>
                                </th>
                                <th rowSpan={2} className={`border-b border-r px-3 py-3 align-bottom pb-4 text-center ${getStickyClasses('price').th}`}>결제 금액</th>
                                <th rowSpan={2} className={`border-b border-r p-0 align-bottom bg-indigo-100/95 ${getStickyClasses('memo').th}`}>
                                    <GuideBadge text="고객이 수령일 변경을 원할 경우 고객찜에 입력을 하면 남은+미체크에 숫자가 변경이 되요." className="w-full h-full p-2 pb-4">
                                        <div className="flex flex-col items-center justify-end h-full gap-1 font-bold text-indigo-900 leading-none">
                                            <span>고객 비고 1</span>
                                            <span className="text-[11px] text-indigo-700/80">(고객찜)</span>
                                        </div>
                                    </GuideBadge>
                                </th>
                                {displayProducts.map((p, i) => <th key={p.id || i} className="border-b border-r p-1 bg-amber-50/80 font-normal"><Input key={`memo-${p.id}`} defaultValue={p.product_memo} onBlur={(e) => handleUpdateProductField(p.id, 'product_memo', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} placeholder="상품 비고 1" className="h-7 text-xs text-center border-transparent bg-transparent focus:bg-white focus:border-amber-300 transition-colors" /></th>)}
                            </tr>
                            <tr>
                                {displayProducts.map((p, i) => (
                                    <th key={p.id || i} className="border-b border-r p-3 min-w-[140px] max-w-[400px] font-bold text-[15px] whitespace-nowrap bg-muted/80 resize-x overflow-x-auto overflow-y-hidden">
                                        <div className="flex flex-col items-center justify-center gap-0.5">
                                            <span>{p.name}</span>
                                        </div>
                                        <div className="flex items-center justify-center gap-1 mt-1.5">
                                            <Input type="number" defaultValue={p.price} onBlur={(e) => handleUpdateProductField(p.id, 'price', e.target.value)} className="h-6 w-[70px] text-[12px] font-mono text-center px-1 py-0 border-slate-300 bg-white shadow-sm" title="가격을 수정하고 바깥을 클릭하면 저장됩니다" />
                                            <span className="text-[12px] text-muted-foreground font-normal">원</span>
                                        </div>
                                    </th>
                                ))}
                            </tr>
                            <tr>
                                <th className={`border-b border-r py-2 px-1 text-[13px] font-bold text-blue-900 bg-white ${getStickyClasses('price').th}`}>
                                    {displayProducts.reduce((acc, p) => acc + Number(p.stock || 0), 0).toLocaleString()}
                                </th>
                                <th className={`border-b border-r py-2 px-1 text-[12px] font-bold text-blue-900 tracking-tight bg-blue-100/95 ${getStickyClasses('memo').th}`}>발주수량</th>
                                {displayProducts.map((p, di) => (
                                    <th key={p.id || di} className="border-b border-r py-2 px-1 bg-blue-50/40 text-[13px] font-semibold text-blue-800">
                                        <Input type="number" defaultValue={p.stock} onBlur={(e) => handleUpdateProductField(p.id, 'allocated_stock', e.target.value)} className="h-6 w-[50px] text-[13px] font-bold text-center px-1 py-0 mx-auto border-blue-200 bg-white text-blue-800 shadow-sm" title="수량을 수정하고 바깥을 클릭하면 저장됩니다" />
                                    </th>
                                ))}
                            </tr>
                            <tr>
                                <th className={`border-b border-r py-2 px-1 text-[13px] font-bold text-slate-800 bg-white ${getStickyClasses('price').th}`}>
                                    {activeProductIndices.reduce((acc, oi) => acc + rawCustomers.reduce((cAcc, c) => cAcc + (c.items[oi] || 0), 0), 0).toLocaleString()}
                                </th>
                                <th className={`border-b border-r py-2 px-1 text-[12px] font-bold text-slate-800 tracking-tight bg-slate-200/95 ${getStickyClasses('memo').th}`}>합계수량</th>
                                {activeProductIndices.map((oi, di) => {
                                    const orderSum = rawCustomers.reduce((acc, c) => acc + (c.items[oi] || 0), 0);
                                    return (
                                        <th key={di} className="border-b border-r py-2 px-1 bg-slate-50/80 text-[13px] font-semibold text-slate-700">
                                            {orderSum}
                                        </th>
                                    )
                                })}
                            </tr>
                            <tr>
                                <th className={`border-b border-r py-2 px-1 text-[13px] font-bold text-amber-900 bg-white ${getStickyClasses('price').th}`}>
                                    {activeProductIndices.reduce((acc, oi) => acc + (products[oi].stock - rawCustomers.reduce((cAcc, c) => cAcc + (c.items[oi] || 0), 0)), 0).toLocaleString()}
                                </th>
                                <th className={`border-b border-r py-2 px-1 text-[12px] font-bold text-amber-900 tracking-tight bg-amber-100/95 ${getStickyClasses('memo').th}`}>남은수량</th>
                                {activeProductIndices.map((oi, di) => {
                                    const orderSum = rawCustomers.reduce((acc, c) => acc + (c.items[oi] || 0), 0);
                                    const remaining = products[oi].stock - orderSum;
                                    return (
                                        <th key={di} className="border-b border-r py-2 px-1 bg-amber-50/40 text-[13px] font-bold text-amber-700">
                                            {remaining}
                                        </th>
                                    )
                                })}
                            </tr>
                            <tr>
                                <th className={`border-b border-r py-2 px-1 text-[14px] font-extrabold text-emerald-900 bg-white ${getStickyClasses('price').th}`}>
                                    {activeProductIndices.reduce((acc, oi) => {
                                        const orderSum = rawCustomers.reduce((cAcc, c) => cAcc + (c.items[oi] || 0), 0);
                                        const remaining = products[oi].stock - orderSum;
                                        const unreceivedSum = rawCustomers.filter(c => !c.checked && (!c.memo2 || c.memo2.trim() === '')).reduce((cAcc, c) => cAcc + (c.items[oi] || 0), 0);
                                        return acc + (remaining + unreceivedSum);
                                    }, 0).toLocaleString()}
                                </th>
                                <th className={`border-b border-r py-2 px-1 text-[11px] font-bold text-emerald-900 tracking-tighter leading-tight bg-emerald-100/95 ${getStickyClasses('memo').th}`}>남은+미체크</th>
                                {activeProductIndices.map((oi, di) => {
                                    const orderSum = rawCustomers.reduce((acc, c) => acc + (c.items[oi] || 0), 0);
                                    const remaining = products[oi].stock - orderSum;
                                    const unreceivedSum = rawCustomers.filter(c => !c.checked && (!c.memo2 || c.memo2.trim() === '')).reduce((acc, c) => acc + (c.items[oi] || 0), 0);
                                    const physicalTarget = remaining + unreceivedSum;
                                    return (
                                        <th key={di} className="border-b border-r py-2 px-1 bg-emerald-50/60 text-[14px] font-extrabold text-emerald-800 shadow-inner">
                                            {physicalTarget}
                                        </th>
                                    )
                                })}
                            </tr>
                        </thead>

                        <tbody>
                            <tr><td colSpan={displayProducts.length + (isDeleteMode ? 7 : 6)} className="h-2 bg-muted/10 border-b border-t border-t-slate-300"></td></tr>

                            {/* 행 추가 버튼 */}
                            {!isAddingRow && !isMerged && (
                                <tr>
                                    <td colSpan={displayProducts.length + (isDeleteMode ? 7 : 6)}>
                                        <button onClick={() => setIsAddingRow(true)} className="w-full py-2 text-sm text-slate-400 hover:text-indigo-600 hover:bg-indigo-50/50 transition-colors font-medium border-b border-dashed border-slate-200">
                                            + 행 추가 (수기 주문 등록)
                                        </button>
                                    </td>
                                </tr>
                            )}

                            {/* 인라인 행 추가 입력 */}
                            {isAddingRow && (
                                <tr className="bg-amber-50/80 border-2 border-amber-300">
                                    <td className={`border-b border-r px-1 py-1 ${getStickyClasses('name').td}`}>
                                        <Input autoFocus value={addRowNick} onChange={e => setAddRowNick(e.target.value)} placeholder="닉네임" className="h-8 text-xs font-semibold bg-white border-amber-400 px-1 w-full" onKeyDown={e => { if (e.key === 'Escape') { setIsAddingRow(false); setAddRowNick(""); setAddRowQtys({}) }}} />
                                    </td>
                                    <td className={`border-b border-r px-1 py-1 ${getStickyClasses('receive').td}`}>
                                        <div className="flex gap-1 justify-center">
                                            <Button size="sm" onClick={handleAddRowSave} className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold">저장</Button>
                                            <Button size="sm" variant="ghost" onClick={() => { setIsAddingRow(false); setAddRowNick(""); setAddRowQtys({}) }} className="h-7 px-2 text-xs">취소</Button>
                                        </div>
                                    </td>
                                    {isDeleteMode && <td className="border-b border-r"></td>}
                                    <td className={`border-b border-r px-2 py-1 ${getStickyClasses('summary').td}`}>
                                        <span className="text-xs text-amber-700 font-medium">
                                            {Object.entries(addRowQtys).filter(([,q]) => parseInt(q) > 0).map(([idx, q]) => `${products[parseInt(idx)]?.name || ''} ${q}`).join(', ') || '상품을 입력하세요'}
                                        </span>
                                    </td>
                                    <td className={`border-b border-r px-2 py-1 font-bold text-amber-800 ${getStickyClasses('price').td}`}>
                                        {Object.entries(addRowQtys).reduce((total, [idx, q]) => {
                                            const p = products[parseInt(idx)];
                                            return total + (p ? calculateItemPrice(p, parseInt(q) || 0) : 0);
                                        }, 0).toLocaleString()}원
                                    </td>
                                    <td className={`border-b border-r py-1 px-1 ${getStickyClasses('memo').td}`}></td>
                                    {activeProductIndices.map((oi, di) => (
                                        <td key={di} className="border-b border-r px-1 py-1">
                                            <Input type="number" value={addRowQtys[oi] || ""} onChange={e => setAddRowQtys(prev => ({...prev, [oi]: e.target.value}))} className="w-[50px] h-8 mx-auto text-center font-bold px-1 py-0 bg-white border-amber-300 text-amber-900" placeholder="-" onKeyDown={e => { if (e.key === 'Enter') handleAddRowSave() }} />
                                        </td>
                                    ))}
                                </tr>
                            )}

                            {isLoading ? (
                                <tr><td colSpan={displayProducts.length + (isDeleteMode ? 7 : 6)} className="p-8 text-center text-muted-foreground animate-pulse">데이터베이스에서 실시간 상태를 불러오는 중입니다...</td></tr>
                            ) : filteredCustomers.length === 0 ? (
                                <tr><td colSpan={displayProducts.length + (isDeleteMode ? 7 : 6)} className="p-8 text-muted-foreground font-medium text-center">
                                    {searchScope === "all_dates" && !activeSearchTerm.trim()
                                        ? "닉네임 또는 상품명을 입력 후 엔터를 눌러주세요."
                                        : "조회할 데이터가 없습니다. (해당 일자에 상품이나 주문이 없습니다)"}
                                </td></tr>
                            ) : (
                                filteredCustomers.map((c, i) => (
                                    <tr key={`${isMerged}-${c.id || i}`} className={`hover:bg-muted/40 transition-colors group ${c.checked ? 'bg-emerald-50/30 opacity-70' : 'bg-background'} ${selectedPosOrders.includes(c.id) ? 'bg-indigo-50/40' : ''}`}>
                                        <td className={`border-b border-r px-2 py-1 text-xs sm:text-sm font-semibold whitespace-nowrap ${getStickyClasses('name').td}`}>
                                            <div className="flex flex-col items-start gap-0.5">
                                                <div className="flex items-center gap-2">
                                                    {posSyncEnabled && (
                                                        <Checkbox 
                                                            disabled={c.checked || isMerged} 
                                                            checked={selectedPosOrders.includes(c.id)} 
                                                            onCheckedChange={() => togglePosSelect(c.id)} 
                                                            className="h-4 w-4 shrink-0 border-indigo-300 data-[state=checked]:bg-indigo-600 cursor-pointer disabled:opacity-30" 
                                                        />
                                                    )}
                                                    {c.checked ? <span className="line-through text-muted-foreground truncate max-w-[120px]">{c.name}</span> : <span className="truncate max-w-[120px]">{c.name}</span>}
                                                </div>
                                                {c.crm && (
                                                    <Badge variant="outline" className={`font-medium whitespace-nowrap text-[10px] px-1.5 py-0 shadow-sm ${c.crm.category === '노쇼' ? 'border-red-200 text-red-700 bg-red-50' : c.crm.category === '단골' ? 'border-blue-200 text-blue-700 bg-blue-50' : 'border-slate-200 text-slate-700 bg-slate-50'}`} title={c.crm.memo || c.crm.category}>
                                                        {c.crm.category === '노쇼' ? '🔴 노쇼' : c.crm.category === '단골' ? '🔵 단골' : `⚪ ${c.crm.category}`}
                                                        {c.crm.memo ? ` : ${c.crm.memo}` : ''}
                                                    </Badge>
                                                )}
                                            </div>
                                        </td>
                                        <td className={`border-b border-r px-1 sm:px-2 py-1 ${getStickyClasses('receive').td}`}>
                                            <div className="flex justify-center items-center h-full pt-1">
                                                <Checkbox
                                                    checked={c.checked}
                                                    onCheckedChange={() => toggleCheck(c.id, c.checked, c.name)}
                                                    className="h-5 w-5 sm:h-6 sm:w-6 border-slate-300 data-[state=checked]:bg-emerald-500 rounded-sm cursor-pointer"
                                                />
                                            </div>
                                        </td>
                                        {isDeleteMode && (
                                            <td className={`border-b border-r px-1 py-1 ${getStickyClasses('delete').td}`}>
                                                <div className="flex justify-center items-center h-full">
                                                    <Checkbox
                                                        checked={selectedDeleteIds.includes(c.id)}
                                                        onCheckedChange={() => toggleDeleteSelect(c.id)}
                                                        disabled={isMerged}
                                                        className="h-5 w-5 sm:h-6 sm:w-6 border-rose-300 data-[state=checked]:bg-rose-500 rounded-sm cursor-pointer disabled:opacity-50"
                                                    />
                                                </div>
                                            </td>
                                        )}
                                        <td className={`border-b border-r px-2 py-1 ${getStickyClasses('summary').td}`}>
                                            <span className="text-xs sm:text-sm font-medium text-slate-800">{getDisplaySummary(c.items)}</span>
                                        </td>
                                        <td className={`border-b border-r px-2 py-1 font-bold text-blue-900 shadow-inner ${getStickyClasses('price').td}`}>
                                            {activeProductIndices.reduce((total, oi) => total + calculateItemPrice(products[oi], c.items[oi] || 0), 0).toLocaleString()}원
                                        </td>
                                        <td className={`border-b border-r py-1 px-1 bg-indigo-50/95 ${getStickyClasses('memo').td}`}>
                                            <div className="flex flex-col gap-1 w-full relative">
                                                {editingMemo?.orderId === c.id && editingMemo?.type === 'memo1' ? (
                                                    <Input autoFocus defaultValue={c.memo1} onBlur={(e) => { handleUpdateMemo(c.id, 'customer_memo_1', e.target.value, c.name); setEditingMemo(null) }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingMemo(null) }} placeholder="비고 1" className="h-7 text-xs bg-white border-primary px-1 text-center shadow-inner" />
                                                ) : (
                                                    <div onClick={() => setEditingMemo({ orderId: c.id, type: 'memo1' })} className={`h-7 text-xs border rounded-sm px-1 flex items-center justify-center cursor-pointer truncate ${c.memo1 ? 'bg-red-50 border-red-300 text-red-700 font-semibold hover:bg-red-100' : 'bg-white/70 border-slate-200 hover:bg-white'}`} title="클릭하여 편집">
                                                        {c.memo1 || <span className="text-muted-foreground/50">비고 1</span>}
                                                    </div>
                                                )}

                                                {editingMemo?.orderId === c.id && editingMemo?.type === 'memo2' ? (
                                                    <Input autoFocus defaultValue={c.memo2} onBlur={(e) => { handleUpdateMemo(c.id, 'customer_memo_2', e.target.value, c.name); setEditingMemo(null) }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingMemo(null) }} placeholder="고객찜" className="h-7 text-xs bg-white border-primary px-1 text-center shadow-inner" />
                                                ) : (
                                                    <div onClick={() => setEditingMemo({ orderId: c.id, type: 'memo2' })} className={`h-7 text-xs border rounded-sm px-1 flex items-center justify-center cursor-pointer truncate ${c.memo2 ? 'bg-red-50 border-red-300 text-red-700 font-semibold hover:bg-red-100' : 'bg-white/70 border-slate-200 hover:bg-white'}`} title="클릭하여 편집">
                                                        {c.memo2 || <span className="text-muted-foreground/50">고객찜</span>}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        {activeProductIndices.map((oi, di) => {
                                            const qty = c.items[oi] || 0;
                                            const isEditing = editingQty?.orderId === c.id && editingQty?.productIdx === oi;
                                            return (
                                                <td
                                                    key={di}
                                                    className={`border-b border-r px-2 py-1 text-base font-bold transition-colors cursor-pointer ${qty > 0 ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-slate-50'}`}
                                                    onClick={() => {
                                                        if (!isEditing && !isMerged) {
                                                            setEditingQty({ orderId: c.id, productIdx: oi });
                                                            setTempQty(qty > 0 ? qty.toString() : "");
                                                        }
                                                    }}
                                                    title={isMerged ? "이름 합치기 모드에서는 개별 수량을 수정할 수 없습니다." : "클릭하여 수량 수정 (0 입력 시 삭제)"}
                                                >
                                                    {isEditing ? (
                                                        <Input
                                                            type="number"
                                                            autoFocus
                                                            className="w-[50px] h-8 mx-auto text-center font-bold px-1 py-0 shadow-inner bg-white border-primary"
                                                            value={tempQty}
                                                            onChange={(e) => setTempQty(e.target.value)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') handleUpdateQuantity(c.id, oi, tempQty)
                                                                if (e.key === 'Escape') setEditingQty(null)
                                                            }}
                                                            onBlur={() => handleUpdateQuantity(c.id, oi, tempQty)}
                                                        />
                                                    ) : (
                                                        qty > 0 ? <span className="text-primary">{qty}</span> : <span className="text-muted-foreground/20 font-normal">-</span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))
                            )}

                        </tbody>
                    </table>
                </div>
            </Card>
            )}

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

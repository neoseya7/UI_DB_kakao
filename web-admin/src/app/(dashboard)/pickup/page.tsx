"use client"

import { useState, useEffect, useMemo, useCallback, useTransition } from "react"
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
import { makeCacheKey, getPickupCache, setPickupCache, clearPickupCache, updatePickupCacheCustomers, updatePickupCacheProducts } from "@/lib/pickupCache"
import { GuideBadge } from "@/components/ui/guide-badge"
import { onOrdersChanged } from "@/lib/dataChangeBus"
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
    // 상단/하단 가로 스크롤바 동기화
    const topScrollRef = useRef<HTMLDivElement>(null)
    const bottomScrollRef = useRef<HTMLDivElement>(null)
    const tableRef = useRef<HTMLTableElement>(null)
    const [tableWidth, setTableWidth] = useState(0)
    const scrollSyncingRef = useRef(false)
    useEffect(() => {
        if (!tableRef.current) return
        const update = () => setTableWidth(tableRef.current?.scrollWidth || 0)
        update()
        const ro = new ResizeObserver(update)
        ro.observe(tableRef.current)
        return () => ro.disconnect()
    }, [])
    const handleTopScroll = () => {
        if (scrollSyncingRef.current) return
        scrollSyncingRef.current = true
        if (bottomScrollRef.current && topScrollRef.current) {
            bottomScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft
        }
        scrollSyncingRef.current = false
    }
    const handleBottomScroll = () => {
        if (scrollSyncingRef.current) return
        scrollSyncingRef.current = true
        if (topScrollRef.current && bottomScrollRef.current) {
            topScrollRef.current.scrollLeft = bottomScrollRef.current.scrollLeft
        }
        scrollSyncingRef.current = false
    }
    const [storeId, setStoreId] = useState<string | null>(null)
    const [isMerged, setIsMerged] = useState(false)
    const [isLoading, setIsLoading] = useState(true)

    // 자기 자신이 일으킨 Realtime echo를 필터링하기 위한 mutation id 추적 (TTL 3s)
    const recentMutationsRef = useRef<Map<string, number>>(new Map())
    const recordMutation = (ids: Array<string | null | undefined>, ttlMs = 3000) => {
        const exp = Date.now() + ttlMs
        for (const id of ids) if (id) recentMutationsRef.current.set(id, exp)
    }
    const isSelfEcho = (payload: any): boolean => {
        const candidates = [
            payload?.new?.id, payload?.old?.id,
            payload?.new?.order_id, payload?.old?.order_id,
        ].filter(Boolean) as string[]
        const now = Date.now()
        for (const c of candidates) {
            const exp = recentMutationsRef.current.get(c)
            if (exp !== undefined) {
                if (now < exp) return true
                recentMutationsRef.current.delete(c)
            }
        }
        return false
    }
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
    const [showDupSuspects, setShowDupSuspects] = useState(false)
    const [searchField, setSearchField] = useState<"all" | "nickname" | "product" | "memo">("all")
    const [searchScope, setSearchScope] = useState("today")
    const [customSearchDate, setCustomSearchDate] = useState("")
    const [customEndDate, setCustomEndDate] = useState("")
    const [focusedDate, setFocusedDate] = useState<string | null>(null)
    const [receiptFilter, setReceiptFilter] = useState("unreceived")

    // 무거운 리렌더를 인터럽트 가능하게 해서 "응답없음" 방지 (#1)
    const [, startTransition] = useTransition()

    // 가상화 테이블 토글 (문제 시 false로 바꾸면 원본 테이블로 즉시 원복)
    const useVirtualizedTable = true

    const [newNick, setNewNick] = useState("")
    const [newDate, setNewDate] = useState("")
    const [newProductId, setNewProductId] = useState<string>("")
    const [newQty, setNewQty] = useState("")

    const [editingQty, setEditingQty] = useState<{ orderId: string, productIdx: number } | null>(null)
    const [tempQty, setTempQty] = useState<string>("")
    const [editingMemo, setEditingMemo] = useState<{ orderId: string, type: 'memo1' | 'memo2' } | null>(null)

    const [isManualOrderModalOpen, setIsManualOrderModalOpen] = useState(false)
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false)
    const [transferSourceDate, setTransferSourceDate] = useState("")
    const [transferProductIdx, setTransferProductIdx] = useState<string>("")
    const [transferNewDate, setTransferNewDate] = useState("")
    const [isTransferToRegular, setIsTransferToRegular] = useState(false)
    const [transferAvailableProducts, setTransferAvailableProducts] = useState<Product[]>([])
    const [sortOrder, setSortOrder] = useState<"entered" | "name">("entered")

    const [availableDates, setAvailableDates] = useState<string[]>([])
    const [products, setProducts] = useState<Product[]>([])
    // 편집 중인 값만 보관하는 버퍼(편집 종료 시 clear). 캐시→fresh 덮어쓰기 후에도 defaultValue 고착으로 값이 틀어지는 이슈 방지용 controlled 패턴.
    const [stockEditBuffer, setStockEditBuffer] = useState<Record<string, string>>({})
    const [priceEditBuffer, setPriceEditBuffer] = useState<Record<string, string>>({})
    const [memoEditBuffer, setMemoEditBuffer] = useState<Record<string, string>>({})
    const [manualOrderProducts, setManualOrderProducts] = useState<Product[]>([])
    const [rawCustomers, setRawCustomers] = useState<Order[]>([])
    
    const [isSettingsLoaded, setIsSettingsLoaded] = useState(false)
    const isMountedRef = useRef(true)
    useEffect(() => { isMountedRef.current = true; return () => { isMountedRef.current = false } }, [])

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
                    td: `sticky z-10 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.15)] border-r-2 border-r-indigo-200 ${mLeft} w-[200px] sm:w-[260px] min-w-[200px] sm:min-w-[260px] max-w-[200px] sm:max-w-[260px]`,
                    th: `sticky z-40 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.15)] border-r-2 border-r-indigo-300 ${mLeft} w-[200px] sm:w-[260px] min-w-[200px] sm:min-w-[260px] max-w-[200px] sm:max-w-[260px]`
                }
        }
    }

    useEffect(() => {
        const initUser = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession()
                const user = session?.user
                if (user) {
                    // setStoreId를 즉시 호출하여 fetchMatrixData가 빠르게 시작되도록 함
                    setStoreId(user.id)
                    // store_settings는 fetchMatrixData와 병렬로 실행됨
                    supabase.from('store_settings').select('crm_tags').eq('store_id', user.id).single().then(({ data: sData }) => {
                        if (sData) {
                            const isPosEnabled = sData.crm_tags?.find((t:any) => t.type === 'setting' && t.key === 'pos_sync_enabled')?.value ?? false;
                            setPosSyncEnabled(isPosEnabled)
                        }
                    })
                }
            } catch (err) {
                console.warn("Auth initialization warning:", err)
            }
        }
        initUser()
    }, [])

    // 날짜 버튼 목록을 먼저 빠르게 가져옴 (RPC 대기 없이 즉시 표시)
    useEffect(() => {
        if (!storeId) return
        supabase.from('products').select('target_date, is_regular_sale').eq('store_id', storeId).eq('is_hidden', false).then(({ data }) => {
            if (data && isMountedRef.current) {
                const uniqueDates = Array.from(new Set(data.filter(p => !p.is_regular_sale && p.target_date).map(p => p.target_date))).sort() as string[]
                if (data.some(p => p.is_regular_sale)) uniqueDates.push("상시판매")
                setAvailableDates(uniqueDates)
            }
        })
    }, [storeId])

    useEffect(() => {
        if (storeId && isSettingsLoaded) {
            fetchMatrixData()
            setSelectedPosOrders([])
        }
    }, [storeId, isSettingsLoaded, currentDate, searchScope, customSearchDate, customEndDate])

    // "모든 날짜" 모드에서만 검색어 변경 시 서버 재조회 (다른 모드는 클라이언트 필터링)
    useEffect(() => {
        if (storeId && isSettingsLoaded && searchScope === "all_dates") {
            fetchMatrixData()
        }
    }, [activeSearchTerm])

    // Cross-PC auto-refresh:
    //  - Supabase Realtime (cross-device, primary)
    //  - BroadcastChannel (same-browser, fastest)
    //  - visibility fallback (defensive, 5min cooldown — handles Realtime disconnect)
    // All triggers share a 500ms debounce to absorb thundering herd bursts.
    useEffect(() => {
        if (!storeId) return
        let refreshTimer: ReturnType<typeof setTimeout> | null = null
        let lastRefresh = Date.now()
        const scheduleRefresh = () => {
            if (refreshTimer) clearTimeout(refreshTimer)
            refreshTimer = setTimeout(() => {
                lastRefresh = Date.now()
                fetchMatrixData(true)
            }, 500)
        }

        // 1) Same-browser cross-tab
        const unsubscribe = onOrdersChanged(scheduleRefresh)

        // 2) Supabase Realtime — orders + order_items, filtered by store_id for orders
        //    order_items has no store_id column; unfiltered but payload is tiny and store isolation
        //    is maintained by the subsequent RLS-scoped refetch.
        //    자기 자신이 일으킨 mutation의 echo는 isSelfEcho로 걸러 불필요한 재조회/깜빡임 방지.
        const onRealtimeChange = (payload: any) => {
            if (isSelfEcho(payload)) return
            scheduleRefresh()
        }
        const channel = supabase
            .channel(`pickup-orders-${storeId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'orders', filter: `store_id=eq.${storeId}` },
                onRealtimeChange
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'order_items' },
                onRealtimeChange
            )
            .subscribe()

        // 3) Visibility fallback (5min cooldown) — covers Realtime disconnect edge cases
        const onVisible = () => {
            if (!document.hidden && Date.now() - lastRefresh > 5 * 60 * 1000) {
                lastRefresh = Date.now()
                fetchMatrixData(true)
            }
        }
        document.addEventListener('visibilitychange', onVisible)

        return () => {
            if (refreshTimer) clearTimeout(refreshTimer)
            unsubscribe()
            supabase.removeChannel(channel)
            document.removeEventListener('visibilitychange', onVisible)
        }
    }, [storeId, currentDate])

    useEffect(() => {
        if (!storeId || !isTransferModalOpen) return;
        const fetchModalProducts = async () => {
            const date = transferSourceDate || currentDate;
            const { data } = await supabase.from('products').select('id,collect_name,price,allocated_stock,target_date,is_regular_sale,product_memo,tiered_prices,unit_text').eq('store_id', storeId).eq('is_hidden', false).or(`target_date.eq.${date},is_regular_sale.eq.true`)
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
                .select('id,collect_name,price,allocated_stock,target_date,is_regular_sale,product_memo,tiered_prices,unit_text')
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

        // 메모리 캐시 확인: 캐시가 있으면 즉시 표시
        // "모든 날짜" 모드에서만 검색어를 캐시 키에 포함 (다른 모드는 클라이언트 필터링)
        const cacheSearchTerm = searchScope === "all_dates" ? activeSearchTerm : ""
        const cacheKey = makeCacheKey(storeId, searchScope, currentDate, customSearchDate, customEndDate, cacheSearchTerm)
        const cached = getPickupCache(cacheKey)
        if (cached) {
            setRawCustomers(cached.rawCustomers)
            setProducts(cached.products)
            // availableDates는 별도 useEffect에서 관리하므로 캐시에서 덮어쓰지 않음
            setIsLoading(false)
            // 캐시 데이터를 즉시 표시 후, 항상 백그라운드에서 최신 데이터 조회 (stale-while-revalidate)
        } else {
            setIsLoading(true)
        }

        // === 1단계: 날짜 목록 + 주문 조회 + CRM 태그를 모두 병렬 실행 ===
        let pDate = null, startDate = null, endDate = null
        if (searchScope === "today") pDate = currentDate === "상시판매" ? "1900-01-01" : currentDate
        else if (searchScope === "date_range") {
            if (customSearchDate && customEndDate) { startDate = customSearchDate; endDate = customEndDate; }
            else if (customSearchDate && !customEndDate) { pDate = customSearchDate; }
        }

        // 상품 쿼리 (날짜 기반 - 주문 의존성 없이 바로 병렬 실행)
        let pQuery = supabase.from('products').select('id,collect_name,price,allocated_stock,is_hidden,target_date,is_regular_sale,product_memo,tiered_prices,unit_text').eq('store_id', storeId).eq('is_hidden', false)
        if (searchScope === "today") {
            if (currentDate === "상시판매") {
                pQuery = pQuery.eq('is_regular_sale', true)
            } else {
                pQuery = pQuery.eq('target_date', currentDate)
            }
        } else if (searchScope === "date_range") {
            pQuery = pQuery.eq('is_regular_sale', true)
        }

        const [dateResult, rpcResult, settingsResult, pResult] = await Promise.all([
            supabase.from('products').select('target_date, is_regular_sale').eq('store_id', storeId).eq('is_hidden', false),
            supabase.rpc('get_matrix_orders', {
                p_store_id: storeId,
                p_pickup_date: pDate,
                p_start_date: startDate,
                p_end_date: endDate
            }).limit(5000),
            supabase.from('store_settings').select('crm_tags').eq('store_id', storeId).single(),
            pQuery.limit(5000)
        ])

        // 컴포넌트가 언마운트됐으면 state 업데이트 중단 (페이지 이동 시 불필요한 처리 방지)
        if (!isMountedRef.current) return

        // 날짜 목록 처리
        let latestDates: string[] = []
        if (dateResult.data) {
            const uniqueDates = Array.from(new Set(dateResult.data.filter(p => !p.is_regular_sale).map(p => p.target_date))).filter(Boolean).sort() as string[]
            if (dateResult.data.some(p => p.is_regular_sale)) uniqueDates.push("상시판매")
            latestDates = uniqueDates
            setAvailableDates(uniqueDates)
        }

        const rpcData = rpcResult.data
        const rpcError = rpcResult.error

        let orders: any[] = []
        if (!rpcError && rpcData) {
            orders = rpcData || []
        } else {
            console.warn("RPC fetch failed, falling back to legacy:", rpcError);
            let oQuery = supabase.from('orders').select('id,customer_nickname,customer_memo_1,customer_memo_2,is_received,pickup_date,created_at').eq('store_id', storeId).eq('is_hidden', false)
            if (searchScope === "today") {
                const dbDate = currentDate === "상시판매" ? "1900-01-01" : currentDate
                oQuery = oQuery.eq('pickup_date', dbDate)
            } else if (searchScope === "date_range" && customSearchDate && customEndDate) {
                oQuery = oQuery.or(`and(pickup_date.gte.${customSearchDate},pickup_date.lte.${customEndDate}),pickup_date.eq.1900-01-01`)
            } else if (searchScope === "date_range" && customSearchDate && !customEndDate) {
                oQuery = oQuery.or(`pickup_date.eq.${customSearchDate},pickup_date.eq.1900-01-01`)
            }
            const { data: oData } = await oQuery.limit(2000).order('pickup_date', { ascending: false })
            orders = oData || []
        }

        // 주문에 포함된 상품 중 1단계에서 누락된 것이 있으면 추가 조회
        const fetchedProductIds = new Set((pResult.data || []).map((p: any) => p.id))
        const missingIds: string[] = []
        if (!rpcError && rpcData) {
            orders.forEach((o: any) => {
                if (o.items) o.items.forEach((oi: any) => {
                    if (!fetchedProductIds.has(oi.product_id)) missingIds.push(oi.product_id)
                })
            })
        }
        let allProductData = pResult.data || []
        if (missingIds.length > 0) {
            const uniqueMissing = [...new Set(missingIds)]
            const { data: extraProducts } = await supabase.from('products').select('id,collect_name,price,allocated_stock,is_hidden,target_date,is_regular_sale,product_memo,tiered_prices,unit_text').eq('store_id', storeId).in('id', uniqueMissing)
            if (extraProducts) allProductData = [...allProductData, ...extraProducts]
        }
        const mappedProducts = allProductData.map((p: any) => ({
            id: p.id,
            name: p.collect_name || "(이름없음)",
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
            // 전후 날짜 백그라운드 프리페치 (현재 데이터 로드 후 1초 뒤 실행하여 UI 블로킹 방지)
            setTimeout(() => prefetchAdjacentDates(currentDate, latestDates, storeId), 1000)
            return
        }

        // -- FALLBACK PATH (Legacy) --
        const orderIds = orders.map(o => o.id)
        let orderItems: any[] = []
        const CHUNK_SIZE = 30
        for (let i = 0; i < orderIds.length; i += CHUNK_SIZE) {
            const chunk = orderIds.slice(i, i + CHUNK_SIZE)
            const { data: chunkData } = await supabase.from('order_items').select('order_id,product_id,quantity').in('order_id', chunk)
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

    // 전후 날짜 프리페치 (백그라운드에서 조용히 실행)
    const prefetchAdjacentDates = useCallback(async (currentDateStr: string, dates: string[], storeIdStr: string) => {
        if (searchScope !== "today" || currentDateStr === "상시판매") return
        const idx = dates.indexOf(currentDateStr)
        if (idx === -1) return

        const adjacentDates = [dates[idx - 1], dates[idx + 1]].filter(Boolean)
        for (const adjDate of adjacentDates) {
            if (adjDate === "상시판매") continue // 상시판매는 프리페치 스킵
            const key = makeCacheKey(storeIdStr, "today", adjDate, "", "", "")
            if (getPickupCache(key)) continue // 이미 캐시에 있으면 스킵

            try {
                const [rpcRes, crmRes] = await Promise.all([
                    supabase.rpc('get_matrix_orders', { p_store_id: storeIdStr, p_pickup_date: adjDate, p_start_date: null, p_end_date: null }).limit(5000),
                    supabase.from('store_settings').select('crm_tags').eq('store_id', storeIdStr).single()
                ])
                if (!isMountedRef.current) return
                const adjOrders = rpcRes.data || []
                const adjOrderedIds = new Set<string>()
                adjOrders.forEach((o: any) => { if (o.items) o.items.forEach((oi: any) => adjOrderedIds.add(oi.product_id)) })
                const adjIdList = Array.from(adjOrderedIds).join(',')

                let adjPQuery = supabase.from('products').select('id,collect_name,price,allocated_stock,is_hidden,target_date,is_regular_sale,product_memo,tiered_prices,unit_text').eq('store_id', storeIdStr).eq('is_hidden', false)
                adjPQuery = adjIdList.length > 0 ? adjPQuery.or(`target_date.eq.${adjDate},id.in.(${adjIdList})`) : adjPQuery.eq('target_date', adjDate)
                const adjPResult = await adjPQuery.limit(5000)
                if (!isMountedRef.current) return

                const adjProducts = (adjPResult.data || []).map((p: any) => ({
                    id: p.id, name: p.collect_name || "(이름없음)", price: p.price || 0,
                    required: p.is_hidden ? 0 : (p.allocated_stock || 0), stock: p.is_hidden ? 0 : (p.allocated_stock || 0),
                    target_date: p.target_date, is_regular_sale: p.is_regular_sale,
                    product_memo: p.product_memo || "", tiered_prices: p.tiered_prices || [], unit_text: p.unit_text || ""
                }))

                const adjCrmList = crmRes.data?.crm_tags?.filter((t: any) => t.type === 'crm') || []
                const adjCrmDict = adjCrmList.reduce((acc: any, t: any) => { acc[t.name] = { category: t.category, memo: t.memo }; return acc }, {})

                const adjProductIdxMap = new Map<string, number>()
                adjProducts.forEach((p: any, i: number) => adjProductIdxMap.set(p.id, i))
                const adjCustomers = adjOrders.map((o: any, index: number) => {
                    const itemsArray = new Array(adjProducts.length).fill(0)
                    if (o.items) { for (const oi of o.items) { const idx = adjProductIdxMap.get(oi.product_id); if (idx !== undefined) itemsArray[idx] = oi.quantity } }
                    return { id: o.id, name: o.customer_nickname, items: itemsArray, memo1: o.customer_memo_1 || "", memo2: o.customer_memo_2 || "", crm: adjCrmDict[o.customer_nickname] || null, checked: o.is_received || false, pickup_date: o.pickup_date, originalIndex: index }
                })
                setPickupCache(key, adjCustomers, adjProducts, dates)
            } catch { /* 프리페치 실패는 무시 */ }
        }
    }, [searchScope])

    const toggleDeleteSelect = (id: string) => {
        setSelectedDeleteIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    }

    const executeBulkDelete = async () => {
        if (selectedDeleteIds.length === 0) return alert("삭제할 대상을 체크해주세요.");
        if (!confirm(`선택된 ${selectedDeleteIds.length}개의 주문을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return;

        setIsLoading(true);

        // 0. 삭제 전에 (nickname, collect_name) 튜플을 확보해둠 — 대응되는 chat_logs를 나중에 되돌리기 위함
        const { data: ordersToDelete } = await supabase
            .from('orders')
            .select('id, customer_nickname, order_items(products(collect_name))')
            .in('id', selectedDeleteIds)
        const revertTargets = new Map<string, Set<string>>() // nickname -> Set<collect_name>
        for (const o of ordersToDelete || []) {
            if (!o.customer_nickname) continue
            const set = revertTargets.get(o.customer_nickname) || new Set<string>()
            for (const oi of o.order_items || []) {
                const name = (oi as any).products?.collect_name
                if (name) set.add(name)
            }
            revertTargets.set(o.customer_nickname, set)
        }

        // 1. order_items → orders 삭제
        recordMutation(selectedDeleteIds)
        const { error: itemsErr } = await supabase.from('order_items').delete().in('order_id', selectedDeleteIds);
        if (itemsErr) console.error("Failed deleting items:", itemsErr);

        const { error: ordersErr } = await supabase.from('orders').delete().in('id', selectedDeleteIds);
        if (ordersErr) console.error("Failed deleting orders:", ordersErr);

        // 2. 대응되는 chat_logs 되돌리기 (삭제한 주문 수만큼만 되돌림 — 중복 주문 시 초과 되돌림 방지)
        if (storeId && revertTargets.size > 0) {
            for (const [nick, names] of revertTargets.entries()) {
                if (names.size === 0) continue
                // 삭제된 주문 중 이 닉네임의 각 상품별 주문 수 카운트
                const deletedCountByProduct = new Map<string, number>()
                for (const o of ordersToDelete || []) {
                    if (o.customer_nickname !== nick) continue
                    for (const oi of o.order_items || []) {
                        const name = (oi as any).products?.collect_name
                        if (name) deletedCountByProduct.set(name, (deletedCountByProduct.get(name) || 0) + 1)
                    }
                }
                for (const productName of names) {
                    const deleteCount = deletedCountByProduct.get(productName) || 1
                    // 대상 chat_logs를 조회한 후 삭제 수만큼만 되돌림
                    const { data: matchingLogs } = await supabase.from('chat_logs')
                        .select('id')
                        .eq('store_id', storeId)
                        .eq('nickname', nick)
                        .eq('is_processed', true)
                        .eq('product_name', productName)
                        .order('created_at', { ascending: false })
                        .limit(deleteCount)
                    if (matchingLogs && matchingLogs.length > 0) {
                        const { error: revErr } = await supabase.from('chat_logs').update({
                            is_processed: false,
                            category: 'UNKNOWN',
                            classification: null,
                        }).in('id', matchingLogs.map(l => l.id))
                        if (revErr) console.error("Failed reverting chat_logs:", revErr)
                    }
                }
            }
        }

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
            recordMutation(orderIds)
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

            recordMutation(insertedOrders.map(o => o.id))

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
            recordMutation([orderId])
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

        // 2. 이 상품을 참조하는 모든 주문 처리 (product_id 기준 — pickup_date 불일치 주문도 포함)
        const { data: oiData, error: oiErr } = await supabase.from('order_items').select('id, order_id, quantity').eq('product_id', targetProduct.id)
        if (oiErr) errors.push(`주문항목 조회 실패: ${oiErr.message}`)

        if (oiData && oiData.length > 0) {
            const affectedOrderIds = [...new Set(oiData.map((oi: any) => oi.order_id))]

            // 해당 주문들의 정보 조회 (store_id 필터 + 이미 목적지 날짜인 주문은 제외)
            const { data: oData, error: oErr } = await supabase.from('orders').select('id, customer_nickname, is_received, pickup_date').eq('store_id', storeId).neq('pickup_date', newPickup).in('id', affectedOrderIds)
            if (oErr) errors.push(`주문 조회 실패: ${oErr.message}`)

            if (oData && oData.length > 0) {
                const validOrderIds = new Set(oData.map((o: any) => o.id))
                const validOiData = oiData.filter((oi: any) => validOrderIds.has(oi.order_id))

                // 각 주문별로 다른 상품이 있는지 확인
                const validAffectedOrderIds = [...new Set(validOiData.map((oi: any) => oi.order_id))]
                const { data: allItems, error: allErr } = await supabase.from('order_items').select('id, order_id').in('order_id', validAffectedOrderIds)
                if (allErr) errors.push(`전체 주문항목 조회 실패: ${allErr.message}`)

                const itemCountByOrder: Record<string, number> = {}
                if (allItems) {
                    for (const item of allItems) {
                        itemCountByOrder[item.order_id] = (itemCountByOrder[item.order_id] || 0) + 1
                    }
                }

                for (const oId of validAffectedOrderIds) {
                    const orderItemsToMove = validOiData.filter((oi: any) => oi.order_id === oId)
                    const totalItemsInOrder = itemCountByOrder[oId] || 0
                    const movingCount = orderItemsToMove.length

                    if (movingCount >= totalItemsInOrder) {
                        // 이 주문에 이동 대상 상품만 있음 → 주문 자체의 pickup_date 변경
                        recordMutation([oId])
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
                        recordMutation([newOrder.id, oId])

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
            recordMutation([oData.id])
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
            recordMutation([oData.id])
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
        const cacheSearchTerm = searchScope === "all_dates" ? activeSearchTerm : ""
        const cacheKey = storeId ? makeCacheKey(storeId, searchScope, currentDate, customSearchDate, customEndDate, cacheSearchTerm) : ""
        try {
            if (isMerged && name) {
                const targetIds = rawCustomers.filter(rc => rc.name === name).map(rc => rc.id).filter(Boolean) as string[]
                if (targetIds.length > 0) {
                    setRawCustomers(prev => prev.map(c => targetIds.includes(c.id) ? { ...c, checked: !current } : c))
                    recordMutation(targetIds)
                    const { error } = await supabase.from('orders').update({ is_received: !current }).in('id', targetIds)
                    if (error) throw error
                    if (cacheKey) updatePickupCacheCustomers(cacheKey, cs => cs.map(c => targetIds.includes(c.id) ? { ...c, checked: !current } : c))
                }
            } else {
                if (!id) return
                setRawCustomers(prev => prev.map(c => c.id === id ? { ...c, checked: !current } : c))
                recordMutation([id])
                const { error } = await supabase.from('orders').update({ is_received: !current }).eq('id', id)
                if (error) throw error
                if (cacheKey) updatePickupCacheCustomers(cacheKey, cs => cs.map(c => c.id === id ? { ...c, checked: !current } : c))
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

    const batchUpdate = async (table: string, ids: string[], updateData: Record<string, any>, batchSize = 10) => {
        for (let i = 0; i < ids.length; i += batchSize) {
            const chunk = ids.slice(i, i + batchSize)
            const { error } = await supabase.from(table).update(updateData).in('id', chunk)
            if (error) throw new Error(`${table} 업데이트 실패 (${i+1}~${i+chunk.length}): ${error.message || JSON.stringify(error)}`)
        }
    }

    const handleHideDataByDate = async () => {
        const effectiveDate = (searchScope === "date_range" && focusedDate) ? focusedDate : currentDate;
        if (!effectiveDate) return;
        const confirmMsg = `${effectiveDate} 일자의 모든 [상품]과 [주문 내역]을 숨김 처리하시겠습니까?\n이 작업 후에는 관리자 화면 및 고객 검색에서 해당 날짜의 데이터가 보이지 않게 됩니다.`;
        if (!confirm(confirmMsg)) return;

        try {
            setIsLoading(true);

            // 1. Hide Products for the target_date
            const { data: pIds, error: pSelErr } = await supabase
                .from('products')
                .select('id')
                .eq('store_id', storeId)
                .eq('target_date', effectiveDate)
                .eq('is_regular_sale', false)
                .eq('is_hidden', false);

            if (pSelErr) throw new Error(`상품 조회 실패: ${pSelErr.message}`);
            if (pIds && pIds.length > 0) {
                await batchUpdate('products', pIds.map(p => p.id), { is_hidden: true });
            }

            // 2. Hide Orders for the pickup_date
            const { data: oIds, error: oSelErr } = await supabase
                .from('orders')
                .select('id')
                .eq('store_id', storeId)
                .eq('pickup_date', effectiveDate)
                .eq('is_hidden', false)
                .limit(5000);

            if (oSelErr) throw new Error(`주문 조회 실패: ${oSelErr.message}`);
            if (oIds && oIds.length > 0) {
                await batchUpdate('orders', oIds.map(o => o.id), { is_hidden: true });
            }

            alert(`${effectiveDate} 일자 데이터가 성공적으로 숨김 처리되었습니다.`);

            // Re-fetch data
            await fetchMatrixData(true);

        } catch (error: any) {
            console.error("Bulk hide by date error:", error);
            alert("일괄 숨김 처리 중 오류가 발생했습니다: " + (error.message || JSON.stringify(error)));
        } finally {
            setIsLoading(false);
        }
    }

    const handleUnhideDataByDate = async () => {
        const effectiveDate = (searchScope === "date_range" && focusedDate) ? focusedDate : currentDate;
        if (!effectiveDate) return;
        const confirmMsg = `${effectiveDate} 일자의 숨겨진 [상품]과 [주문 내역]을 다시 화면에 보이도록 복구 (숨김 해제)하시겠습니까?`;
        if (!confirm(confirmMsg)) return;

        try {
            setIsLoading(true);

            // 1. Unhide Products for the target_date
            const { data: pIds, error: pSelErr } = await supabase
                .from('products')
                .select('id')
                .eq('store_id', storeId)
                .eq('target_date', effectiveDate)
                .eq('is_hidden', true);

            if (pSelErr) throw new Error(`상품 조회 실패: ${pSelErr.message}`);
            if (pIds && pIds.length > 0) {
                await batchUpdate('products', pIds.map(p => p.id), { is_hidden: false });
            }

            // 2. Unhide Orders for the pickup_date
            const { data: oIds, error: oSelErr } = await supabase
                .from('orders')
                .select('id')
                .eq('store_id', storeId)
                .eq('pickup_date', effectiveDate)
                .eq('is_hidden', true)
                .limit(5000);

            if (oSelErr) throw new Error(`주문 조회 실패: ${oSelErr.message}`);
            if (oIds && oIds.length > 0) {
                await batchUpdate('orders', oIds.map(o => o.id), { is_hidden: false });
            }

            alert(`${effectiveDate} 일자의 데이터가 성공적으로 복구(숨김 해제)되었습니다.`);

            // Re-fetch data
            await fetchMatrixData(true);

        } catch (error: any) {
            console.error("Bulk unhide by date error:", error);
            alert("일괄 숨김 해제 중 오류가 발생했습니다: " + (error.message || JSON.stringify(error)));
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
        const cacheSearchTerm = searchScope === "all_dates" ? activeSearchTerm : ""
        const cacheKey = storeId ? makeCacheKey(storeId, searchScope, currentDate, customSearchDate, customEndDate, cacheSearchTerm) : ""
        if (isMerged && customerName) {
            // 합치기 모드: 같은 닉네임의 모든 주문에 동일 값 저장
            const targetIds = rawCustomers.filter(c => c.name === customerName).map(c => c.id).filter(Boolean) as string[]
            if (targetIds.length > 0) {
                recordMutation(targetIds)
                const { error } = await supabase.from('orders').update({ [field]: val }).in('id', targetIds)
                if (!error) {
                    setRawCustomers(prev => prev.map(c => targetIds.includes(c.id) ? { ...c, [memoKey]: val } : c))
                    if (cacheKey) updatePickupCacheCustomers(cacheKey, cs =>
                        cs.map(c => targetIds.includes(c.id) ? { ...c, [memoKey]: val } : c)
                    )
                }
            }
            return
        }
        recordMutation([id])
        const { error } = await supabase.from('orders').update({ [field]: val }).eq('id', id)
        if (!error) {
            setRawCustomers(prev => prev.map(c =>
                c.id === id ? { ...c, [memoKey]: val } : c
            ))
            if (cacheKey) updatePickupCacheCustomers(cacheKey, cs =>
                cs.map(c => c.id === id ? { ...c, [memoKey]: val } : c)
            )
        }
    }

    const handleUpdateProductField = async (productId: string, field: 'price' | 'allocated_stock' | 'product_memo', value: string) => {
        if (!productId) return;
        const finalValue = field === 'product_memo' ? value : (parseInt(value) || 0)
        const { error } = await supabase.from('products').update({ [field]: finalValue }).eq('id', productId)
        if (!error) {
            const mapProduct = (p: any) => {
                if (p.id !== productId) return p;
                if (field === 'allocated_stock') return { ...p, stock: finalValue as number };
                if (field === 'price') return { ...p, price: finalValue as number };
                if (field === 'product_memo') return { ...p, product_memo: finalValue as string };
                return p;
            }
            setProducts(prev => prev.map(mapProduct))
            const cacheSearchTerm = searchScope === "all_dates" ? activeSearchTerm : ""
            const cacheKey = storeId ? makeCacheKey(storeId, searchScope, currentDate, customSearchDate, customEndDate, cacheSearchTerm) : ""
            if (cacheKey) updatePickupCacheProducts(cacheKey, ps => ps.map(mapProduct))
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
        recordMutation(selectedPosOrders)
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
    const dateFilteredRaw = useMemo(() => {
        if (searchScope === "date_range" && focusedDate) {
            const target = focusedDate === "상시판매" ? "1900-01-01" : focusedDate
            return rawCustomers.filter(c => c.pickup_date === target)
        }
        return rawCustomers
    }, [rawCustomers, searchScope, focusedDate])

    // 중복의심 감지: 같은 (pickup_date + nickname) 그룹 내에서 겹치는 상품이 있는 주문들의 ID 집합
    const dupSuspectIds = useMemo(() => {
        const suspects = new Set<string>()
        const groups = new Map<string, Order[]>()
        for (const c of dateFilteredRaw) {
            const key = `${c.pickup_date}|${c.name}`
            if (!groups.has(key)) groups.set(key, [])
            groups.get(key)!.push(c)
        }
        for (const arr of groups.values()) {
            if (arr.length < 2) continue
            const len = arr[0].items?.length || 0
            for (let i = 0; i < len; i++) {
                // 이 상품(i)을 주문한 orders만 모음
                const ordersWithItem = arr.filter(o => (o.items?.[i] || 0) > 0)
                if (ordersWithItem.length >= 2) {
                    // 중복된 상품을 가진 주문들만 의심 대상에 추가 (그룹 전체 X)
                    ordersWithItem.forEach(o => suspects.add(o.id))
                }
            }
        }
        return suspects
    }, [dateFilteredRaw])

    // 중복의심 모드 켤 때 병합은 자동 해제 (병합 상태에서는 중복이 합쳐져 감지 불가)
    useEffect(() => {
        if (showDupSuspects && isMerged) setIsMerged(false)
    }, [showDupSuspects, isMerged])

    // 중복의심 켜짐: 정렬을 가나다순으로 자동 전환 / 꺼짐: 이전 정렬로 복구
    const prevSortRef = useRef<"entered" | "name" | null>(null)
    useEffect(() => {
        if (showDupSuspects) {
            if (prevSortRef.current === null) {
                prevSortRef.current = sortOrder
                setSortOrder("name")
            }
        } else {
            if (prevSortRef.current !== null) {
                setSortOrder(prevSortRef.current)
                prevSortRef.current = null
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showDupSuspects])

    // 병합: Map 기반 O(n)으로 교체 (기존 O(n²) reduce 대체, 결과 순서/로직 동일)
    const customers = useMemo(() => {
        if (!isMerged) return dateFilteredRaw
        const map = new Map<string | undefined, Order>()
        for (const cur of dateFilteredRaw) {
            const key = cur.name
            const ex = map.get(key)
            if (ex) {
                map.set(key, {
                    ...ex,
                    items: ex.items.map((qty, idx) => qty + cur.items[idx]),
                    memo1: Array.from(new Set([ex.memo1, cur.memo1].filter(Boolean))).join(", "),
                    memo2: Array.from(new Set([ex.memo2, cur.memo2].filter(Boolean))).join(", "),
                    checked: ex.checked && cur.checked,
                })
            } else {
                map.set(key, { ...cur })
            }
        }
        return Array.from(map.values())
    }, [dateFilteredRaw, isMerged])

    const filteredCustomers = useMemo(() => {
        return customers.filter(c => {
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
            const matchDup = !showDupSuspects || dupSuspectIds.has(c.id)
            return matchSearch && matchReceipt && matchDup
        }).sort((a, b) => {
            if (sortOrder === "name") return (a.name || "").localeCompare(b.name || "", 'ko')
            return (a.originalIndex || 0) - (b.originalIndex || 0)
        })
        // getDisplaySummary는 activeProductIndices, products에 의존 → deps로 추적
    }, [customers, activeSearchTerm, searchField, receiptFilter, sortOrder, activeProductIndices, products, showDupSuspects, dupSuspectIds])

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
                <div className="flex items-center gap-3 flex-wrap">
                    <h2 className="text-2xl font-bold tracking-tight">주문관리</h2>
                    <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1 font-medium">📢 주문정보가 많아지면 기능이 저하될 수 있습니다. 수령 완료된 과거 주문은 주기적으로 삭제해주세요.</span>
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
                                            startTransition(() => {
                                                setFocusedDate(prev => prev === date ? null : date)
                                            })
                                        } else {
                                            startTransition(() => {
                                                setCurrentDate(date)
                                                setSearchScope("today")
                                            })
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
                                        startTransition(() => setFocusedDate(v))
                                    } else if (searchScope === "date_range" && customSearchDate && !customEndDate && v === customSearchDate) {
                                        startTransition(() => setFocusedDate(v))
                                    } else {
                                        // 기간 밖 또는 다른 scope: scope 전환
                                        startTransition(() => {
                                            setCurrentDate(v)
                                            setSearchScope("today")
                                        })
                                    }
                                }}
                                title={searchScope === "date_range" ? "기간 내 날짜는 드릴다운, 기간 밖 날짜는 이동" : "달력에서 날짜 직접 지정"}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-2 w-full bg-muted/30 p-1.5 rounded-md border shrink-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <Select value={searchScope} onValueChange={(v) => startTransition(() => setSearchScope(v))}>
                                <SelectTrigger className="w-[120px] h-9 bg-white border-muted shadow-sm font-medium text-xs shrink-0">
                                    <SelectValue placeholder="검색 범위" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="today">해당 달력선택일</SelectItem>
                                    <SelectItem value="date_range" className="text-indigo-600 font-bold">특정 기간 검색</SelectItem>
                                    <SelectItem value="all_dates" className="text-blue-600 font-semibold">모든 날짜(전체)</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={receiptFilter} onValueChange={setReceiptFilter}>
                                <SelectTrigger className="w-[95px] h-9 bg-white border-muted shadow-sm font-medium text-xs shrink-0">
                                    <SelectValue placeholder="수령 상태" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">모든 상태</SelectItem>
                                    <SelectItem value="unreceived" className="text-orange-600 font-semibold">미수령만</SelectItem>
                                    <SelectItem value="received" className="text-emerald-600 font-semibold">수령만</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={sortOrder} onValueChange={(val: any) => setSortOrder(val)}>
                                <SelectTrigger className="w-[110px] h-9 bg-indigo-50 border-indigo-200 shadow-sm font-bold text-indigo-700 text-xs shrink-0">
                                    <SelectValue placeholder="정렬 방식" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="entered" className="font-semibold">⏳ 입력된 순서</SelectItem>
                                    <SelectItem value="name" className="font-semibold">가 가나다 순서</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={searchField} onValueChange={(v: any) => setSearchField(v)}>
                                <SelectTrigger className="w-[80px] h-9 bg-white border-muted shadow-sm font-medium text-xs shrink-0">
                                    <SelectValue placeholder="검색 항목" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">모두</SelectItem>
                                    <SelectItem value="nickname">닉네임</SelectItem>
                                    <SelectItem value="product">상품명</SelectItem>
                                    <SelectItem value="memo">비고</SelectItem>
                                </SelectContent>
                            </Select>

                            <div className="relative flex-1 min-w-[120px]">
                                <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder={searchScope === "all_dates" ? "닉네임/상품명 검색" : "검색어 입력"}
                                    className="pl-8 bg-white h-9 w-full shadow-sm pr-2 text-xs"
                                    value={searchTerm}
                                    onChange={(e) => { setSearchTerm(e.target.value); if (e.target.value === "") setActiveSearchTerm("") }}
                                    onKeyDown={(e) => { if (e.key === "Enter") setActiveSearchTerm(searchTerm) }}
                                />
                            </div>
                            <Button
                                type="button"
                                onClick={() => setActiveSearchTerm(searchTerm)}
                                className="h-9 w-9 shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm p-0"
                                title="검색"
                            >
                                <Search className="h-3.5 w-3.5" />
                            </Button>
                            {activeSearchTerm && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => { setActiveSearchTerm(""); setSearchTerm("") }}
                                    className="h-9 px-2 shrink-0 shadow-sm text-xs"
                                    title="검색어 초기화"
                                >
                                    초기화
                                </Button>
                            )}

                            <Button
                                type="button"
                                variant={showDupSuspects ? "default" : "outline"}
                                onClick={() => setShowDupSuspects(v => !v)}
                                className={`h-9 px-2 shrink-0 shadow-sm text-xs gap-1 font-semibold ${
                                    showDupSuspects
                                        ? 'bg-rose-600 hover:bg-rose-700 text-white border-rose-600'
                                        : (dupSuspectIds.size > 0 ? 'border-rose-300 text-rose-700 hover:bg-rose-50 bg-white' : 'bg-white text-slate-600')
                                }`}
                                title="같은 날짜+닉네임으로 동일 상품이 중복 주문된 건만 표시 (토글)"
                            >
                                🔍 중복의심{dupSuspectIds.size > 0 ? ` (${dupSuspectIds.size}건)` : ''}
                            </Button>

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" className="h-9 px-2 shadow-sm border-slate-300 bg-white hover:bg-slate-100 text-slate-700 shrink-0 outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 gap-1 text-xs font-semibold">
                                        <MoreVertical className="h-4 w-4" /> 추가기능
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56 font-sans">
                                    <DropdownMenuLabel>주문 관리</DropdownMenuLabel>
                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setIsManualOrderModalOpen(true); }} className="gap-2 cursor-pointer font-medium text-indigo-700 focus:text-indigo-800 focus:bg-indigo-50">
                                        <PlusCircle className="h-4 w-4" /> 수동 주문등록
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setIsMerged(!isMerged); }} className={`gap-2 cursor-pointer font-medium ${isMerged ? 'text-indigo-700 focus:text-indigo-800 focus:bg-indigo-50' : ''}`}>
                                        <ListCollapse className="h-4 w-4" /> {isMerged ? "✓ 이름합치기 해제" : "이름합치기"}
                                    </DropdownMenuItem>
                                    {isDeleteMode ? (
                                        <>
                                            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setIsDeleteMode(false); setSelectedDeleteIds([]); }} className="gap-2 cursor-pointer font-medium">
                                                <Trash2 className="h-4 w-4 text-slate-500" /> 삭제모드 취소
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); executeBulkDelete(); }} className="gap-2 cursor-pointer font-medium text-rose-600 focus:text-rose-700 focus:bg-rose-50">
                                                <Trash2 className="h-4 w-4" /> 선택 삭제 ({selectedDeleteIds.length})
                                            </DropdownMenuItem>
                                        </>
                                    ) : (
                                        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setIsDeleteMode(true); }} className="gap-2 cursor-pointer font-medium text-rose-600 focus:text-rose-700 focus:bg-rose-50">
                                            <Trash2 className="h-4 w-4" /> 삭제 모드
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDeleteReceivedOrders(); }} className="gap-2 cursor-pointer font-medium text-amber-700 focus:text-amber-800 focus:bg-amber-50">
                                        <Trash2 className="h-4 w-4" /> 수령제품 삭제
                                    </DropdownMenuItem>

                                    <DropdownMenuSeparator />
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
                                    onClick={() => startTransition(() => setFocusedDate(null))}
                                    className="h-7 px-2 text-xs bg-white border-amber-400 text-amber-800 hover:bg-amber-100"
                                >
                                    설정기간주문보기
                                </Button>
                            </div>
                        )}
                    </div>
                </div>

                {/* 삭제 모드 활성화 시 인라인 알림 */}
                {isDeleteMode && !isMobile && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-rose-300 bg-rose-50 text-rose-800 text-sm font-bold shadow-sm">
                        <Trash2 className="h-4 w-4" />
                        <span>삭제 모드 — 삭제할 주문을 체크하세요</span>
                        <Button variant="destructive" size="sm" onClick={executeBulkDelete} className="h-7 px-2 text-xs ml-auto gap-1">
                            <Trash2 className="h-3 w-3" /> 선택 삭제 ({selectedDeleteIds.length})
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { setIsDeleteMode(false); setSelectedDeleteIds([]); }} className="h-7 px-2 text-xs">
                            취소
                        </Button>
                    </div>
                )}

                {/* 수동 주문등록 모달 */}
                <Dialog open={isManualOrderModalOpen} onOpenChange={setIsManualOrderModalOpen}>
                    <DialogContent className="sm:max-w-[420px]">
                        <DialogHeader>
                            <DialogTitle>수동 주문등록</DialogTitle>
                            <DialogDescription>닉네임과 상품, 수량을 입력하여 주문을 등록합니다.</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold">픽업 날짜</label>
                                <Input type="date" value={newDate || currentDate} onChange={e => { setNewDate(e.target.value); setNewProductId(""); }} className="bg-white" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold">닉네임</label>
                                <Input placeholder="닉네임 입력" value={newNick} onChange={e => setNewNick(e.target.value)} className="bg-white" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold">상품 선택</label>
                                <Select value={newProductId} onValueChange={setNewProductId}>
                                    <SelectTrigger className="bg-white">
                                        <SelectValue placeholder="상품을 선택하세요" />
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
                                                return <SelectItem key={p.id} value={p.id}>{label}</SelectItem>;
                                            })}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold">수량</label>
                                <Input type="number" placeholder="수량" value={newQty} onChange={e => setNewQty(e.target.value)} className="bg-white" min="1" />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsManualOrderModalOpen(false)}>취소</Button>
                            <Button onClick={() => { handleAddOrder(); setIsManualOrderModalOpen(false); }} className="bg-indigo-600 hover:bg-indigo-700 text-white">등록</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

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
            ) : useVirtualizedTable ? (
                <PickupTable
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
                    getStickyClasses={getStickyClasses}
                />
            ) : (
            <Card className="overflow-hidden border-border/60 shadow-md bg-card">
                <div ref={topScrollRef} onScroll={handleTopScroll} className="overflow-x-auto overflow-y-hidden w-full hidden sm:block">
                    <div style={{ width: tableWidth, height: 1 }} />
                </div>
                <div ref={bottomScrollRef} onScroll={handleBottomScroll} className="overflow-x-auto overflow-y-auto w-full" style={{ maxHeight: "calc(100vh - 255px)" }}>
                    <table ref={tableRef} className="w-max text-sm text-center border-collapse relative">
                        <thead className="bg-muted/90 sticky top-0 z-30 shadow-[0_2px_4px_rgba(0,0,0,0.05)]">
                            <tr>
                                <th rowSpan={4} className={`border-b border-r p-3 whitespace-nowrap text-xs sm:text-sm ${getStickyClasses('name').th}`}>
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
                                <th rowSpan={4} className={`border-b border-r px-1 sm:px-2 py-3 whitespace-nowrap align-bottom pb-4 text-[11px] sm:text-sm tracking-tighter sm:tracking-normal cursor-help ${getStickyClasses('receive').th}`} title="수령확인">수령</th>
                                {isDeleteMode && <th rowSpan={4} className={`border-b border-r px-2 py-3 whitespace-nowrap align-bottom pb-4 ${getStickyClasses('delete').th}`}><span className="text-rose-600 font-bold">삭제</span></th>}
                                <th rowSpan={4} className={`border-b border-r px-2 py-0 align-bottom pb-4 ${getStickyClasses('summary').th}`}>
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
                                    <GuideBadge text="고객이 수령일 변경을 원할 경우 고객찜에 입력을 하면 매장재고에 숫자가 변경이 되요." className="w-full h-full p-1 pb-3">
                                        <div className="flex items-center justify-center h-full gap-1 font-bold text-indigo-900 leading-none">
                                            <span className="text-[11px]">비고</span>
                                            <span className="text-[11px] text-indigo-700/80">찜</span>
                                        </div>
                                    </GuideBadge>
                                </th>
                                {displayProducts.map((p, i) => <th key={p.id || i} className="border-b border-r p-0.5 bg-amber-50/80 font-normal"><Input
                                    key={`memo-${p.id}`}
                                    value={memoEditBuffer[p.id] ?? (p.product_memo ?? "")}
                                    onChange={(e) => setMemoEditBuffer(prev => ({ ...prev, [p.id]: e.target.value }))}
                                    onBlur={(e) => {
                                        handleUpdateProductField(p.id, 'product_memo', e.target.value);
                                        setMemoEditBuffer(prev => { const n = { ...prev }; delete n[p.id]; return n; });
                                    }}
                                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                                    placeholder="비고"
                                    className="h-6 w-full min-w-0 text-[11px] text-center border-transparent bg-transparent focus:bg-white focus:border-amber-300 transition-colors px-1"
                                /></th>)}
                            </tr>
                            <tr>
                                {displayProducts.map((p, i) => (
                                    <th key={p.id || i} className="border-b border-r px-1 py-1.5 font-bold text-[13px] whitespace-nowrap bg-muted/80">
                                        <div className="flex flex-col items-center justify-center gap-0">
                                            <span>{p.name}</span>
                                            <div className="flex items-center justify-center gap-0.5 mt-1">
                                                <Input
                                                    type="number"
                                                    value={priceEditBuffer[p.id] ?? String(p.price ?? 0)}
                                                    onChange={(e) => setPriceEditBuffer(prev => ({ ...prev, [p.id]: e.target.value }))}
                                                    onBlur={(e) => {
                                                        handleUpdateProductField(p.id, 'price', e.target.value);
                                                        setPriceEditBuffer(prev => { const n = { ...prev }; delete n[p.id]; return n; });
                                                    }}
                                                    className="h-5 w-[60px] text-[11px] font-mono text-center px-0.5 py-0 border-slate-300 bg-white shadow-sm"
                                                    title="가격을 수정하고 바깥을 클릭하면 저장됩니다"
                                                />
                                                <span className="text-[11px] text-muted-foreground font-normal">원</span>
                                            </div>
                                        </div>
                                    </th>
                                ))}
                            </tr>
                            <tr>
                                <th className={`border-b border-r py-1.5 px-1 bg-white ${getStickyClasses('price').th}`}>
                                    <div className="flex items-center justify-center gap-2">
                                        <span className="text-[12px] font-bold text-blue-800 bg-blue-50 px-1.5 py-0.5 rounded">{displayProducts.reduce((acc, p) => acc + Number(p.stock || 0), 0).toLocaleString()}</span>
                                        <span className="text-[12px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">{activeProductIndices.reduce((acc, oi) => acc + rawCustomers.reduce((cAcc, c) => cAcc + (c.items[oi] || 0), 0), 0).toLocaleString()}</span>
                                    </div>
                                </th>
                                <th className={`border-b border-r py-1.5 px-1 ${getStickyClasses('memo').th}`}>
                                    <div className="flex items-center justify-center gap-1.5">
                                        <span className="text-[11px] font-bold text-blue-800 bg-blue-100 px-1.5 py-0.5 rounded">발주</span>
                                        <span className="text-[11px] font-bold text-slate-700 bg-slate-200 px-1.5 py-0.5 rounded">주문</span>
                                    </div>
                                </th>
                                {activeProductIndices.map((oi, di) => {
                                    const orderSum = rawCustomers.reduce((acc, c) => acc + (c.items[oi] || 0), 0);
                                    return (
                                        <th key={di} className="border-b border-r py-1 px-0.5 bg-white">
                                            <div className="flex items-center justify-center gap-0">
                                                <Input
                                                    type="number"
                                                    value={stockEditBuffer[displayProducts[di].id] ?? String(products[oi].stock ?? 0)}
                                                    onChange={(e) => {
                                                        const id = displayProducts[di].id;
                                                        const v = e.target.value;
                                                        setStockEditBuffer(prev => ({ ...prev, [id]: v }));
                                                    }}
                                                    onBlur={(e) => {
                                                        const id = displayProducts[di].id;
                                                        handleUpdateProductField(id, 'allocated_stock', e.target.value);
                                                        setStockEditBuffer(prev => { const n = { ...prev }; delete n[id]; return n; });
                                                    }}
                                                    className="h-5 w-[50px] text-[11px] font-bold text-center px-0.5 py-0 border-blue-200 bg-blue-50/60 text-blue-800 shadow-sm"
                                                    title="발주수량 수정"
                                                />
                                                <span className="text-[12px] font-semibold text-slate-700 bg-slate-100 px-0.5 py-0.5 rounded min-w-[20px] text-center">{orderSum}</span>
                                            </div>
                                        </th>
                                    )
                                })}
                            </tr>
                            <tr>
                                <th className={`border-b border-r py-1.5 px-1 bg-white ${getStickyClasses('price').th}`}>
                                    <div className="flex items-center justify-center gap-2">
                                        <span className="text-[12px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded">{activeProductIndices.reduce((acc, oi) => acc + (products[oi].stock - rawCustomers.reduce((cAcc, c) => cAcc + (c.items[oi] || 0), 0)), 0).toLocaleString()}</span>
                                        <span className="text-[13px] font-extrabold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded">{activeProductIndices.reduce((acc, oi) => {
                                            const orderSum = rawCustomers.reduce((cAcc, c) => cAcc + (c.items[oi] || 0), 0);
                                            const remaining = products[oi].stock - orderSum;
                                            const unreceivedSum = rawCustomers.filter(c => !c.checked && (!c.memo2 || c.memo2.trim() === '')).reduce((cAcc, c) => cAcc + (c.items[oi] || 0), 0);
                                            return acc + (remaining + unreceivedSum);
                                        }, 0).toLocaleString()}</span>
                                    </div>
                                </th>
                                <th className={`border-b border-r py-1.5 px-1 ${getStickyClasses('memo').th}`}>
                                    <div className="flex items-center justify-center gap-1.5">
                                        <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">미예약</span>
                                        <span className="text-[11px] font-extrabold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">매장재고</span>
                                    </div>
                                </th>
                                {activeProductIndices.map((oi, di) => {
                                    const orderSum = rawCustomers.reduce((acc, c) => acc + (c.items[oi] || 0), 0);
                                    const remaining = products[oi].stock - orderSum;
                                    const unreceivedSum = rawCustomers.filter(c => !c.checked && (!c.memo2 || c.memo2.trim() === '')).reduce((acc, c) => acc + (c.items[oi] || 0), 0);
                                    const physicalTarget = remaining + unreceivedSum;
                                    return (
                                        <th key={di} className="border-b border-r py-1 px-0.5 bg-white">
                                            <div className="flex items-center justify-center gap-0">
                                                <span className="text-[12px] font-bold text-amber-700 bg-amber-50 px-0.5 py-0.5 rounded min-w-[20px] text-center">{remaining}</span>
                                                <span className="text-[13px] font-extrabold text-emerald-800 bg-emerald-50 px-0.5 py-0.5 rounded min-w-[20px] text-center shadow-inner">{physicalTarget}</span>
                                            </div>
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
                                        <td className={`border-b border-r py-1 px-0.5 bg-indigo-50/95 ${getStickyClasses('memo').td}`}>
                                            <div className="grid grid-cols-2 gap-0.5 w-full relative">
                                                {editingMemo?.orderId === c.id && editingMemo?.type === 'memo1' ? (
                                                    <Input autoFocus defaultValue={c.memo1} onBlur={(e) => { handleUpdateMemo(c.id, 'customer_memo_1', e.target.value, c.name); setEditingMemo(null) }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingMemo(null) }} placeholder="비고" className="h-6 text-[11px] bg-white border-primary px-1 text-center shadow-inner flex-1 min-w-0" />
                                                ) : (
                                                    <div onClick={() => setEditingMemo({ orderId: c.id, type: 'memo1' })} className={`h-6 text-[11px] border rounded-sm px-1 flex items-center justify-center cursor-pointer truncate flex-1 min-w-0 ${c.memo1 ? 'bg-red-50 border-red-300 text-red-700 font-semibold hover:bg-red-100' : 'bg-white/70 border-slate-200 hover:bg-white'}`} title="클릭하여 편집">
                                                        {c.memo1 || <span className="text-muted-foreground/50 text-[10px]">비고</span>}
                                                    </div>
                                                )}
                                                {editingMemo?.orderId === c.id && editingMemo?.type === 'memo2' ? (
                                                    <Input autoFocus defaultValue={c.memo2} onBlur={(e) => { handleUpdateMemo(c.id, 'customer_memo_2', e.target.value, c.name); setEditingMemo(null) }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingMemo(null) }} placeholder="찜" className="h-6 text-[11px] bg-white border-primary px-1 text-center shadow-inner flex-1 min-w-0" />
                                                ) : (
                                                    <div onClick={() => setEditingMemo({ orderId: c.id, type: 'memo2' })} className={`h-6 text-[11px] border rounded-sm px-1 flex items-center justify-center cursor-pointer truncate flex-1 min-w-0 ${c.memo2 ? 'bg-red-50 border-red-300 text-red-700 font-semibold hover:bg-red-100' : 'bg-white/70 border-slate-200 hover:bg-white'}`} title="클릭하여 편집">
                                                        {c.memo2 || <span className="text-muted-foreground/50 text-[10px]">찜</span>}
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

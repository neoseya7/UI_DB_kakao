"use client"

import React, { useState, useEffect } from "react"
import { TableVirtuoso } from "react-virtuoso"
import { supabase } from "@/lib/supabaseClient"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Search, Trash2, Edit3, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { GuideBadge } from "@/components/ui/guide-badge"

export default function Dashboard() {
  const [logs, setLogs] = useState<any[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isChanging, setIsChanging] = useState(false)
  const [activeProducts, setActiveProducts] = useState<any[]>([])
  const [crmDict, setCrmDict] = useState<Record<string, { category: string, memo: string }>>({})

  // Filter States
  const [searchTerm, setSearchTerm] = useState("")
  const [dateFilter, setDateFilter] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }))
  const [categoryFilter, setCategoryFilter] = useState("all_category")
  const [orderFilter, setOrderFilter] = useState("all_order")
  const [anomalyFilter, setAnomalyFilter] = useState("all_anomaly")
  const [productFilter, setProductFilter] = useState("all_product")
  const [sortOption, setSortOption] = useState("time_desc")

  useEffect(() => {
    fetchLogs()
    
    // Auto-refresh every 10 minutes to save Supabase bandwidth
    const intervalId = setInterval(() => {
      fetchLogs()
    }, 10 * 60 * 1000)

    return () => clearInterval(intervalId)
  }, [dateFilter]) // Added dateFilter to dependency array to re-fetch when it changes

  const fetchLogs = async () => {
    try {
      setIsLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) return

      // Fetch settings first to get manager filter
      const { data: settingsData } = await supabase.from('store_settings').select('crm_tags').eq('store_id', user.id).single()
      const managerNicks = settingsData?.crm_tags?.filter((t: any) => t.type === 'manager').map((t: any) => t.name) || []
      
      const crmTagsList = settingsData?.crm_tags?.filter((t: any) => t.type === 'crm') || []
      const crmMap = crmTagsList.reduce((acc: any, t: any) => {
          acc[t.name] = { category: t.category, memo: t.memo }
          return acc
      }, {})
      setCrmDict(crmMap)

      // Fetch active products mapping to append target dates
      const { data: productsData } = await supabase.from('products').select('*').eq('store_id', user.id).eq('is_hidden', false).order('created_at', { ascending: false }).limit(5000)
      const currentProducts = productsData?.map(p => ({
        ...p,
        collect_name: p.collect_name ? p.collect_name.trim() : "",
        display_name: p.display_name ? p.display_name.trim() : ""
      })) || []
      setActiveProducts(currentProducts)

      let query = supabase
        .from('chat_logs')
        .select('*')
        .eq('store_id', user.id)
        .order('created_at', { ascending: false })
        .limit(2000)

      if (dateFilter && dateFilter !== "all") {
        query = query.eq('collect_date', dateFilter)
      }

      const { data, error } = await query

      if (error) throw error

      if (data) {
        // Filter out System and Manager messages
        const filteredData = data.filter((row: any) => {
          const nick = row.nickname || ""
          const isSystem = !nick || nick === "System" || nick === "시스템" || nick === "카카오톡" || nick === "알림톡"
          const isManager = managerNicks.includes(nick)
          return !isSystem && !isManager
        })

        // Map backend columns to frontend model
        const mappedLogs = filteredData.map((row: any) => {
          let displayCat = "기타";
          let otherClassifications: string[] = [];

          if (row.classification) {
            const parts = row.classification.split(", ");
            for (const p of parts) {
              if (p.startsWith("분류:")) {
                displayCat = p.replace("분류:", "");
              } else if (p.trim()) {
                otherClassifications.push(p);
              }
            }
          } else {
            displayCat = row.category === "ORDER" ? "픽업고지" :
              row.category === "COMPLAINT" ? "주문취소" :
                row.category === "INQUIRY" ? "문의" : "기타";
          }

          // Generate Multi-Item Match Badges dynamically
          const matchBadges: { name: string, isMatched: boolean, dateText: string }[] = []
          let finalClassification = otherClassifications.join(", ")

          const isOrderType = displayCat !== "픽업고지" && (row.category === "ORDER" || displayCat.includes("주문"));
          let finalProductName = row.product_name || "-";

          if (isOrderType && row.product_name && row.product_name !== "-") {
            const rawName = row.product_name;
            const itemQty = row.quantity && row.quantity > 0 ? row.quantity : 1;

            let assignedDate = null;
            if (row.classification) {
              const dateMatch = row.classification.match(/\[(20\d{2}-\d{2}-\d{2}) 반영\]/);
              if (dateMatch) assignedDate = dateMatch[1];
            }

            const matchedProd = 
              (assignedDate ? currentProducts.find((p: any) => p.collect_name === rawName && p.target_date === assignedDate) : null)
              || currentProducts.find((p: any) => p.collect_name === rawName && (p.allocated_stock === null || p.allocated_stock >= itemQty))
              || currentProducts.find((p: any) => p.collect_name === rawName);
            
            if (matchedProd) {
              const badgeName = matchedProd.unit_text ? `${rawName}(${matchedProd.unit_text})` : rawName;
              finalProductName = badgeName;
              if (!row.is_processed) {
                matchBadges.push({ name: badgeName, isMatched: false, dateText: "연동 대기" })
              } else if (matchedProd.allocated_stock !== null && matchedProd.allocated_stock < itemQty) {
                matchBadges.push({ name: badgeName, isMatched: false, dateText: "재고초과주문" })
              } else {
                const dateStr = matchedProd.target_date || "상시판매"
                matchBadges.push({ name: badgeName, isMatched: true, dateText: dateStr })
              }
            } else {
              matchBadges.push({ name: rawName, isMatched: false, dateText: "상품미등록" })
            }
          } else if (!isOrderType) {
            // Hide completely if it's not an order classification
            finalClassification = ""
          }

          return {
            id: row.id,
            created_at: row.created_at,
            date: row.collect_date || "-",
            message: row.chat_content || "-",
            time: row.chat_time ? row.chat_time.substring(0, 5) : "-", // HH:mm
            category: displayCat,
            nickname: row.nickname || "알수없음",
            product: finalProductName,
            quantity: row.quantity || 0,
            classification: finalClassification,
            matchBadges: matchBadges,
            isOrder: row.is_processed ? "Y" : (displayCat === "픽업고지" ? "대기" : "N"),
            raw_category: displayCat,
            isSuspectedDuplicate: false
          }
        })

        // Second pass: Cross-reference to detect suspected duplicates 
        // Removed all suspected duplicate logic
        let finalMappedLogs = mappedLogs;


        setLogs(finalMappedLogs)
      }
    } catch (err) {
      console.error('Error fetching chat logs:', err)
      alert('데이터를 불러오는데 실패했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  const [bulkProduct, setBulkProduct] = useState("")
  const [bulkDate, setBulkDate] = useState("")

  // Checkbox interactions
  const toggleAll = (filteredData: any[]) => {
    if (selectedIds.length === filteredData.length && filteredData.length > 0) setSelectedIds([])
    else setSelectedIds(filteredData.map(log => log.id))
  }

  const toggleRow = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  // Row Clone
  const duplicateRow = async (e: React.MouseEvent, rowId: string) => {
    e.stopPropagation()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    try {
      setIsLoading(true)
      const { data: originalLog, error: fetchErr } = await supabase.from('chat_logs').select('*').eq('id', rowId).single()
      if (fetchErr) throw fetchErr

      const clonedCreatedAt = new Date(new Date(originalLog.created_at).getTime() + 100).toISOString()
      const { id, created_at, updated_at, ...copyData } = originalLog

      const { error: insertErr } = await supabase.from('chat_logs').insert({
        ...copyData,
        created_at: clonedCreatedAt
      })
      if (insertErr) throw insertErr

      alert("📋 채팅 내역이 복제되었습니다. 각 데이터에 개별 상품을 할당할 수 있습니다!")
      fetchLogs()
    } catch (err: any) {
      alert("데이터 복제 실패: " + err.message)
    } finally {
      setIsLoading(false)
    }
  }

  // Bulk Actions
  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return alert("선택된 항목이 없습니다.")
    if (!confirm(`선택한 ${selectedIds.length}개의 내역을 정말 삭제하시겠습니까?`)) return

    try {
      const { error } = await supabase
        .from('chat_logs')
        .delete()
        .in('id', selectedIds)

      if (error) throw error

      setLogs(prev => prev.filter(log => !selectedIds.includes(log.id)))
      setSelectedIds([])
      alert('삭제되었습니다.')
    } catch (err: any) {
      console.error(err)
      alert(`삭제 실패: ${err.message}`)
    }
  }

  const handleChangeSelected = async () => {
    if (selectedIds.length === 0) return alert("변경할 주문을 먼저 체크박스로 선택해주세요.")
    if (!bulkProduct && !bulkDate) return alert("변경할 상품명 또는 날짜를 선택해주세요.")

    try {
      setIsChanging(true)
      setIsLoading(true)
      const targetLogs = logs.filter(l => selectedIds.includes(l.id))

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      for (const log of targetLogs) {
        const targetDate = bulkDate && bulkDate !== "-" ? bulkDate : log.date
        const targetProduct = bulkProduct && bulkProduct !== "-" ? bulkProduct : log.product

        let newProductName = targetProduct
        let finalQty = log.quantity > 0 ? log.quantity : 1

        const unmatchedBadges = log.matchBadges?.filter((b: any) => !b.isMatched) || []
        


        let prod: any = null;
        if (targetDate && targetDate !== "-" && targetProduct && targetProduct !== "-") {
            if (activeProducts) {
              prod = activeProducts.find(p => p.collect_name === targetProduct && p.target_date === targetDate && (p.allocated_stock === null || p.allocated_stock > 0));
              if (!prod) prod = activeProducts.find(p => p.collect_name === targetProduct && p.target_date === targetDate);
              if (!prod) prod = activeProducts.find(p => p.collect_name === targetProduct && (p.allocated_stock === null || p.allocated_stock > 0));
              if (!prod) prod = activeProducts.find(p => p.collect_name === targetProduct);
            }
            if (!prod) {
              alert(`⚠️ 주분 복구 실패: "${log.nickname}" 님의 데이터 중 ["${targetProduct}"] 상품은 상품관리 목록에 존재하지 않습니다.\n이 항목을 무시하고 건너뜁니다. 상품 등록 후 다시 수동수정해주세요.`);
              continue; 
            }
        }

        await supabase.from('chat_logs').update({
          product_name: newProductName,
          is_processed: true,
          category: 'ORDER',
          classification: targetDate && targetDate !== "-" ? `분류:수정, [${targetDate} 반영]` : '분류:수정'
        }).eq('id', log.id)

        if (targetDate && targetDate !== "-" && targetProduct && targetProduct !== "-" && prod) {
          let orderId = null

          // --- FEATURE: Delete old order_item if it was already processed ---
          if (log.is_processed && log.product && log.product !== "-") {
            const oldProd = activeProducts?.find(p => p.collect_name === log.product && p.target_date === log.date) || activeProducts?.find(p => p.collect_name === log.product);
            if (oldProd) {
              const { data: oldOrders } = await supabase.from('orders').select('id').eq('store_id', user.id).eq('pickup_date', log.date).eq('customer_nickname', log.nickname).limit(1)
              if (oldOrders && oldOrders.length > 0) {
                await supabase.from('order_items').delete().eq('order_id', oldOrders[0].id).eq('product_id', oldProd.id)
              }
            }
          }

          // --- FIX: Always create a completely NEW independent orders row (1:1 mapping rule) ---
          const { data: newOrder, error: orderErr } = await supabase.from('orders').insert({
            store_id: user.id,
            pickup_date: targetDate,
            customer_nickname: log.nickname,
            is_received: false,
            customer_memo_1: '관리자 수동 지정'
          }).select().single()

          if (orderErr || !newOrder) {
            console.error("New order generation failed:", orderErr)
            continue
          }

          orderId = newOrder.id

          await supabase.from('order_items').insert({
            order_id: orderId,
            product_id: prod.id,
            quantity: finalQty
          })
        }
      }

      alert(`✅ 선택한 ${selectedIds.length}개 항목이 정식 주문으로 강제 동기화(복구) 되었습니다!`)
      setSelectedIds([])
      setBulkProduct("")
      setBulkDate("")
      fetchLogs()
    } catch (err: any) {
      console.error(err)
      alert(`변경 및 동기화 실패: ${err.message}`)
    } finally {
      setIsChanging(false)
      setIsLoading(false)
    }
  }

  const formatDateWithDow = (dateStr: string) => {
    if (!dateStr || dateStr === "-") return dateStr;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${mm}-${dd}(${days[d.getDay()]})`;
  };

  return (
    <div className="flex flex-col gap-6 w-full mx-auto pb-10 max-w-[1900px] px-2 md:px-4">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold tracking-tight">오늘의 대화</h2>
        <p className="text-muted-foreground">
          
        </p>
      </div>

      {/* Top Search & Filter Controls */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-muted/20 p-4 rounded-lg border shadow-sm">
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <GuideBadge text="대화를 수집한 날짜를 선택할 수 있어요.">
            <div className="flex items-center gap-1 bg-white rounded-md border px-2 h-10 shadow-sm focus-within:ring-1 focus-within:ring-ring">
              <Input
                type="date"
                value={dateFilter === "all" ? "" : dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value || "all")
                  setProductFilter("all_product")
                }}
                className="border-0 focus-visible:ring-0 h-8 w-[130px] shadow-none px-1"
                title="수집일 선택 (비우면 전체보기)"
              />
              {dateFilter !== "all" && (
                <Button variant="ghost" size="sm" onClick={() => setDateFilter("all")} className="h-7 px-2 text-xs font-semibold text-muted-foreground hover:text-foreground">전체</Button>
              )}
            </div>
          </GuideBadge>
          <GuideBadge text="대화의 분류를 선택할 수 있어요.">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[140px] bg-white">
              <SelectValue placeholder="카테고리" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all_category">전체 카테고리</SelectItem>
              <SelectItem value="픽업고지">픽업고지</SelectItem>
              <SelectItem value="상품후기">상품후기</SelectItem>
              <SelectItem value="문의">픽업/상품문의</SelectItem>
              <SelectItem value="주문취소">주문취소</SelectItem>
              <SelectItem value="수정">수정 (관리자수동복구)</SelectItem>
              <SelectItem value="기타">기타</SelectItem>
            </SelectContent>
          </Select>
          </GuideBadge>
          <Select value={orderFilter} onValueChange={setOrderFilter}>
            <SelectTrigger className="w-[120px] bg-white">
              <SelectValue placeholder="주문여부" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all_order">전체 (Y/N)</SelectItem>
              <SelectItem value="y">주문 O (Y)</SelectItem>
              <SelectItem value="n">주문 X (N)</SelectItem>
            </SelectContent>
          </Select>
          <GuideBadge text="상품미등록과 재고초과주문만 확인할 수 있어요.">
            <Select value={anomalyFilter} onValueChange={setAnomalyFilter}>
              <SelectTrigger className="w-[140px] bg-white">
              <SelectValue placeholder="특이사항 필터" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all_anomaly">특이사항 (전체)</SelectItem>
              <SelectItem value="out_of_stock">재고초과주문</SelectItem>
              <SelectItem value="unregistered">상품미등록</SelectItem>
            </SelectContent>
          </Select>
          </GuideBadge>
          {dateFilter !== "all" && (
            <Select value={productFilter} onValueChange={setProductFilter}>
              <SelectTrigger className="w-[160px] bg-white">
                <SelectValue placeholder="상품명 필터" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_product">전체 상품</SelectItem>
                {Array.from(new Set(
                  activeProducts
                    .filter(p => !dateFilter || dateFilter === "all" || p.target_date === dateFilter || p.is_regular_sale)
                    .map(p => p.collect_name)
                    .filter(Boolean)
                )).sort().map(name => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={sortOption} onValueChange={setSortOption}>
            <SelectTrigger className="w-[150px] bg-white">
              <SelectValue placeholder="정렬 방식" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="time_desc">입력된 순 (최신)</SelectItem>
              <SelectItem value="time_asc">입력된 순 (과거)</SelectItem>
              <SelectItem value="nick_asc">닉네임 (가나다순)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <GuideBadge text="대화내용이나 닉네임, 상품명으로 검색할 수 있어요." className="w-full md:w-[320px]">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="대화 내용, 닉네임, 상품명 검색"
              className="pl-9 bg-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </GuideBadge>
      </div>

      {/* Bulk Action Bar */}
      <div className="flex flex-col xl:flex-row items-center gap-4 bg-indigo-50/60 p-3 rounded-lg border border-indigo-100 shadow-sm justify-between">
        <div className="flex items-center gap-2">
          <div className="font-semibold text-indigo-900 border-r border-indigo-200 pr-3 mr-1 text-sm bg-white px-3 py-1.5 rounded-md shadow-sm border">
            선택된 항목 <span className="text-primary font-bold">{selectedIds.length}</span>개
          </div>
          {/* Delete Selected */}
          <Button onClick={handleDeleteSelected} variant="destructive" size="sm" className="h-9 gap-1.5 shadow-sm text-sm" disabled={selectedIds.length === 0}>
            <Trash2 className="w-4 h-4" /> 일괄 삭제
          </Button>
        </div>

        <GuideBadge text="AI가 상품을 매칭하지 못했을 경우 날짜와 상품명을 선택해서 쉽게 주문으로 이동시켜줍니다.">
          <div className="flex flex-col sm:flex-row items-center gap-2 w-full xl:w-auto mt-2 xl:mt-0 p-1 bg-white/50 rounded-lg border border-indigo-100/50">
            {/* Change Settings Tools */}
            <span className="text-sm font-semibold text-indigo-800 shrink-0 ml-1">상품명지정:</span>

          <Select value={bulkDate} onValueChange={setBulkDate}>
            <SelectTrigger className="w-full sm:w-[150px] h-9 bg-white shadow-sm">
              <SelectValue placeholder="변경 날짜 일괄선택" />
            </SelectTrigger>
            <SelectContent>
              {Array.from(new Set(activeProducts.map(p => p.target_date).filter(Boolean))).sort().map(date => (
                <SelectItem key={date} value={date}>{formatDateWithDow(date)}</SelectItem>
              ))}
              <SelectItem value="-">초기화 (선택안함)</SelectItem>
            </SelectContent>
          </Select>

          <Select value={bulkProduct} onValueChange={setBulkProduct}>
            <SelectTrigger className="w-full sm:w-[220px] h-9 bg-white shadow-sm">
              <SelectValue placeholder="변경 상품명 일괄선택" />
            </SelectTrigger>
            <SelectContent>
              {Array.from(new Set(
                activeProducts
                  .filter(p => !bulkDate || bulkDate === "-" || p.target_date === bulkDate || p.is_regular_sale)
                  .map(p => p.collect_name)
                  .filter(Boolean)
              )).sort().map(name => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
              <SelectItem value="-">초기화 (선택안함)</SelectItem>
            </SelectContent>
          </Select>

          <Button onClick={handleChangeSelected} variant="default" size="sm" className="h-9 gap-1.5 bg-indigo-600 hover:bg-indigo-700 w-full sm:w-auto shadow-sm text-sm" disabled={selectedIds.length === 0 || isChanging}>
            {isChanging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Edit3 className="w-4 h-4" />}
            {isChanging ? "이동 중..." : "변경"}
          </Button>
        </div>
        </GuideBadge>
      </div>

      {/* Table */}
      {(() => {
        const filteredLogs = logs.filter(log => {
          let match = true;

          if (searchTerm) {
            const lowerTerm = searchTerm.toLowerCase();
            match = match && (
              (log.message && log.message.toLowerCase().includes(lowerTerm)) ||
              (log.nickname && log.nickname.toLowerCase().includes(lowerTerm)) ||
              (log.product && log.product.toLowerCase().includes(lowerTerm))
            );
          }

          if (dateFilter !== "all" && match) {
            match = match && log.date === dateFilter;
          }

          if (categoryFilter !== "all_category" && match) {
            if (categoryFilter === "문의") {
              match = match && log.raw_category.includes("문의");
            } else {
              match = match && log.raw_category === categoryFilter;
            }
          }

          if (orderFilter !== "all_order" && match) {
            if (orderFilter === "y") match = match && log.isOrder === "Y";
            if (orderFilter === "n") match = match && log.isOrder !== "Y" && log.isOrder !== "대기";
          }

          if (anomalyFilter !== "all_anomaly" && match) {
             const hasOutOfStock = log.matchBadges?.some((b: any) => b.dateText === "재고초과주문") || (log.classification && log.classification.includes("재고초과주문"));
             const hasUnregistered = log.matchBadges?.some((b: any) => b.dateText === "상품미등록") || (log.classification && log.classification.includes("상품미등록"));
             if (anomalyFilter === "out_of_stock") match = match && hasOutOfStock;
             if (anomalyFilter === "unregistered") match = match && hasUnregistered;
          }

          if (dateFilter !== "all" && productFilter !== "all_product" && match) {
             match = match && log.product && log.product.includes(productFilter);
          }

          return match;
        });

        filteredLogs.sort((a, b) => {
          if (sortOption === "nick_asc") {
            return a.nickname.localeCompare(b.nickname);
          } else if (sortOption === "time_asc") {
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          } else {
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          }
        });

        return (
          <>
            <Card className="overflow-hidden border-border/80 shadow-md bg-card">
              <div className="w-full max-h-[600px] h-[600px] overflow-x-auto">
                <TableVirtuoso
                  style={{ height: "600px", minWidth: "1350px" }}
                  data={filteredLogs}
                  components={{
                    Table: (props) => <table {...props} className="w-full text-sm text-left border-collapse table-fixed" style={{...props.style, minWidth: "1350px"}} />,
                    TableHead: React.forwardRef((props, ref) => <thead {...props} ref={ref as any} className="bg-slate-100/90 sticky top-0 z-20 shadow-sm border-b border-border m-0" />),
                    TableRow: ({ item, ...props }) => {
                        const log = item as any;
                        const isSelected = log && selectedIds.includes(log.id)
                        return <tr {...props} onClick={() => log && toggleRow(log.id)} className={`transition-colors cursor-pointer group ${isSelected ? 'bg-indigo-50/50 hover:bg-indigo-50/80' : 'bg-white hover:bg-muted/40'} border-b border-border/50`} />
                    },
                    TableBody: React.forwardRef((props, ref) => <tbody {...props} ref={ref as any} className="divide-y divide-border/50" />),
                  }}
                  fixedHeaderContent={() => (
                    <tr>
                      <th className="px-4 py-3.5 w-[50px] text-center bg-slate-100/90 m-0 border-b border-border">
                        <Checkbox className="mx-auto border-slate-400 bg-white" checked={selectedIds.length === filteredLogs.length && filteredLogs.length > 0} onCheckedChange={() => toggleAll(filteredLogs)} />
                      </th>
                      <th className="px-3 py-3.5 font-semibold text-slate-700 whitespace-nowrap w-[80px] bg-slate-100/90 m-0 border-b border-border">수집일</th>
                      <th className="px-3 py-3.5 font-semibold text-slate-700 whitespace-nowrap w-[70px] bg-slate-100/90 m-0 border-b border-border">대화시간</th>
                      <th className="px-4 py-3.5 font-semibold text-slate-700 w-[280px] bg-slate-100/90 m-0 border-b border-border">대화</th>
                      <th className="px-4 py-3.5 font-semibold text-slate-700 whitespace-nowrap w-[100px] bg-slate-100/90 m-0 border-b border-border">카테고리</th>
                      <th className="px-4 py-3.5 font-semibold text-slate-700 whitespace-nowrap w-[120px] bg-slate-100/90 m-0 border-b border-border">닉네임</th>
                      <th className="px-4 py-3.5 font-semibold text-slate-700 w-[220px] bg-slate-100/90 m-0 border-b border-border">상품명</th>
                      <th className="px-4 py-3.5 font-semibold text-slate-700 text-center whitespace-nowrap w-[60px] bg-slate-100/90 m-0 border-b border-border">수량</th>
                      <th className="px-4 py-3.5 font-semibold text-slate-700 text-center whitespace-nowrap w-[150px] bg-slate-100/90 m-0 border-b border-border">분류</th>
                      <th className="px-4 py-3.5 font-semibold text-slate-700 text-center whitespace-nowrap w-[100px] bg-slate-100/90 m-0 border-b border-border">주문여부</th>
                      <th className="px-4 py-3.5 font-semibold text-slate-700 text-center whitespace-nowrap bg-indigo-50/50 w-[80px] m-0 border-b border-border">관리</th>
                    </tr>
                  )}
                  itemContent={(index, log) => {
                      const isSelected = selectedIds.includes(log.id)
                      return (
                        <>
                          <td className="px-4 py-3 text-center flex items-center justify-center h-full" onClick={(e) => e.stopPropagation()}>
                            <Checkbox className={`mx-auto border-slate-300 ${isSelected ? 'border-primary' : ''}`} checked={isSelected} onCheckedChange={() => toggleRow(log.id)} />
                          </td>
                          <td className="px-2 py-3 text-slate-600 font-medium tracking-tighter truncate text-xs" title={log.date}>{log.date}</td>
                          <td className="px-2 py-3 font-medium tracking-tighter truncate text-xs" title={log.time}>{log.time}</td>
                          <td className="px-4 py-3 break-words whitespace-normal text-slate-900">
                            <span className="line-clamp-2" title={log.message}>{log.message}</span>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={log.raw_category === "픽업고지" ? "default" : log.raw_category === "주문취소" ? "destructive" : "secondary"} className="font-normal">
                              {log.raw_category || "기타"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-800 group-hover:text-primary" title={log.nickname}>
                            <div className="flex flex-col items-start gap-1">
                              <span className="truncate w-full block">{log.nickname}</span>
                              {crmDict[log.nickname] && (
                                <Badge variant="outline" className={`font-medium whitespace-nowrap text-[10px] px-1.5 py-0 shadow-sm ${crmDict[log.nickname].category === '노쇼' ? 'border-red-200 text-red-700 bg-red-50' : crmDict[log.nickname].category === '단골' ? 'border-blue-200 text-blue-700 bg-blue-50' : 'border-slate-200 text-slate-700 bg-slate-50'}`} title={crmDict[log.nickname].memo || crmDict[log.nickname].category}>
                                  {crmDict[log.nickname].category === '노쇼' ? '🔴 노쇼' : crmDict[log.nickname].category === '단골' ? '🔵 단골' : `⚪ ${crmDict[log.nickname].category}`}
                                  {crmDict[log.nickname].memo ? ` : ${crmDict[log.nickname].memo}` : ''}
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-semibold break-words whitespace-normal leading-tight text-primary/90" title={log.product}>{log.product}</td>
                          <td className="px-4 py-3 text-center font-bold">{log.quantity > 0 ? log.quantity : "-"}</td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex flex-col gap-1 items-center justify-center">
                              {log.matchBadges && log.matchBadges.length > 0 && (
                                <div className="flex flex-col gap-0.5">
                                  {log.matchBadges.map((badge: any, idx: number) => (
                                    <Badge key={idx} variant="outline" className={`font-medium whitespace-nowrap text-[11px] px-1.5 py-0 shadow-sm ${badge.isMatched ? 'border-emerald-300 text-emerald-700 bg-emerald-50' : 'border-rose-300 text-rose-700 bg-rose-50'}`}>
                                      {badge.isMatched ? '✅' : '❌'} [{badge.dateText}] {badge.name}
                                    </Badge>
                                  ))}
                                </div>
                              )}

                              {log.classification && (
                                <Badge variant="outline" className={`font-normal whitespace-nowrap mt-0.5 ${log.classification === 'VIP' || log.classification.includes('우수') ? 'border-amber-300 text-amber-700 bg-amber-50 font-medium' : 'border-slate-300 text-slate-700 bg-slate-50'}`}>
                                  {log.classification}
                                </Badge>
                              )}

                              {(!log.matchBadges?.length && !log.classification) && (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`font-bold ${log.isOrder === 'Y' ? 'text-blue-600' : 'text-slate-400'}`}>
                              {log.isOrder}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center bg-indigo-50/20">
                            <Button
                              variant="outline" size="sm"
                              onClick={(e) => duplicateRow(e, log.id)}
                              className="h-7 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-100 px-2"
                              title="다중 상품을 처리하기 위해 채팅 내역 줄을 하나 더 복사합니다."
                            >
                              📋 복제
                            </Button>
                          </td>
                        </>
                      )
                  }}
                />
              </div>
            </Card>

            <div className="flex items-center justify-between px-2 text-sm text-muted-foreground mt-2 mb-4">
              <div>조회 내역 {filteredLogs.length}건 (전체 {logs.length}건)</div>
            </div>
          </>
        )
      })()}
    </div>
  )
}

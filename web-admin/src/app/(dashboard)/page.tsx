"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Search, Trash2, Edit3 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export default function Dashboard() {
  const [logs, setLogs] = useState<any[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeProducts, setActiveProducts] = useState<any[]>([])

  // Filter States
  const [searchTerm, setSearchTerm] = useState("")
  const [dateFilter, setDateFilter] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }))
  const [categoryFilter, setCategoryFilter] = useState("all_category")
  const [orderFilter, setOrderFilter] = useState("all_order")

  useEffect(() => {
    fetchLogs()

    const fetchProducts = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('products').select('*').eq('store_id', user.id)
      if (data) setActiveProducts(data)
    }
    fetchProducts()

    // Subscribe to realtime changes
    const channel = supabase
      .channel('chat_logs_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_logs' },
        (payload) => {
          fetchLogs() // Refresh on any change
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [dateFilter]) // Added dateFilter to dependency array to re-fetch when it changes

  const fetchLogs = async () => {
    try {
      setIsLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Fetch settings first to get manager filter
      const { data: settingsData } = await supabase.from('store_settings').select('crm_tags').eq('store_id', user.id).single()
      const managerNicks = settingsData?.crm_tags?.filter((t: any) => t.type === 'manager').map((t: any) => t.name) || []

      // Fetch active products mapping to append target dates
      const { data: prodData } = await supabase.from('products').select('*').eq('store_id', user.id)
      const currentProducts = prodData || []
      setActiveProducts(currentProducts)

      let query = supabase
        .from('chat_logs')
        .select('*')
        .eq('store_id', user.id)
        .order('created_at', { ascending: false })

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

          let matchedDateInfo = ""
          if (row.product_name && row.product_name !== "-") {
            const matchedProd = currentProducts.find(p => p.collect_name === row.product_name || p.display_name === row.product_name)
            if (matchedProd) {
              matchedDateInfo = matchedProd.target_date ? `🎯 [${matchedProd.target_date}]` : `🎯 [상시판매]`
            }
          }

          let finalClassification = otherClassifications.join(", ")
          if (matchedDateInfo) {
            finalClassification = finalClassification ? `${matchedDateInfo} ${finalClassification}` : matchedDateInfo
          }

          return {
            id: row.id,
            date: row.collect_date || "-",
            message: row.chat_content || "-",
            time: row.chat_time ? row.chat_time.substring(0, 5) : "-", // HH:mm
            category: displayCat,
            nickname: row.nickname || "알수없음",
            product: row.product_name || "-",
            quantity: row.quantity || 0,
            classification: finalClassification,
            isOrder: row.is_processed ? "Y" : (displayCat === "픽업고지" ? "대기" : "N"),
            raw_category: displayCat
          }
        })
        setLogs(mappedLogs)
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

      const { id, created_at, updated_at, ...copyData } = originalLog
      const { error: insertErr } = await supabase.from('chat_logs').insert(copyData)
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
      setIsLoading(true)
      const targetLogs = logs.filter(l => selectedIds.includes(l.id))

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      for (const log of targetLogs) {
        const targetDate = bulkDate && bulkDate !== "-" ? bulkDate : log.date
        const targetProduct = bulkProduct && bulkProduct !== "-" ? bulkProduct : log.product

        await supabase.from('chat_logs').update({
          product_name: targetProduct,
          is_processed: true,
          category: 'ORDER',
          classification: '분류:수정'
        }).eq('id', log.id)

        if (targetDate && targetDate !== "-" && targetProduct && targetProduct !== "-") {
          const { data: existingOrders } = await supabase.from('orders')
            .select('id')
            .eq('store_id', user.id)
            .eq('pickup_date', targetDate)
            .eq('customer_nickname', log.nickname)

          let orderId = null

          if (existingOrders && existingOrders.length > 0) {
            orderId = existingOrders[0].id
            await supabase.from('orders').update({ customer_memo_1: '관리자 수동 복구' }).eq('id', orderId)
          } else {
            const { data: newOrder } = await supabase.from('orders').insert({
              store_id: user.id,
              pickup_date: targetDate,
              customer_nickname: log.nickname,
              is_received: false,
              customer_memo_1: '관리자 수동 복구'
            }).select().single()

            if (newOrder) orderId = newOrder.id
          }

          if (orderId && activeProducts) {
            const prod = activeProducts.find(p => p.collect_name === targetProduct)
            if (prod) {
              const { data: existingItems } = await supabase.from('order_items')
                .select('id, quantity')
                .eq('order_id', orderId)
                .eq('product_id', prod.id)

              if (existingItems && existingItems.length > 0) {
                const newQty = log.quantity > 0 ? log.quantity : (existingItems[0].quantity || 1)
                await supabase.from('order_items').update({ quantity: newQty }).eq('id', existingItems[0].id)
              } else {
                await supabase.from('order_items').insert({
                  order_id: orderId,
                  product_id: prod.id,
                  quantity: log.quantity > 0 ? log.quantity : 1
                })
              }
            }
          }
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
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 w-full mx-auto pb-10 max-w-[1600px] px-2 md:px-4">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold tracking-tight">오늘의 대화 (Live Chat Log)</h2>
        <p className="text-muted-foreground">
          실시간으로 챗봇을 통해 접수되는 모든 대화 및 주문 로그를 관리합니다. 일괄 상태 변경이나 삭제 등 통합 처리가 가능합니다.
        </p>
      </div>

      {/* Top Search & Filter Controls */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-muted/20 p-4 rounded-lg border shadow-sm">
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="flex items-center gap-1 bg-white rounded-md border px-2 h-10 shadow-sm focus-within:ring-1 focus-within:ring-ring">
            <Input
              type="date"
              value={dateFilter === "all" ? "" : dateFilter}
              onChange={(e) => setDateFilter(e.target.value || "all")}
              className="border-0 focus-visible:ring-0 h-8 w-[130px] shadow-none px-1"
              title="수집일 선택 (비우면 전체보기)"
            />
            {dateFilter !== "all" && (
              <Button variant="ghost" size="sm" onClick={() => setDateFilter("all")} className="h-7 px-2 text-xs font-semibold text-muted-foreground hover:text-foreground">전체</Button>
            )}
          </div>
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
        </div>

        <div className="relative w-full md:w-[320px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="대화 내용, 닉네임, 상품명 검색"
            className="pl-9 bg-white"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
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

        <div className="flex flex-col sm:flex-row items-center gap-2 w-full xl:w-auto mt-2 xl:mt-0">
          {/* Change Settings Tools */}
          <span className="text-sm font-semibold text-indigo-800 shrink-0">일괄 변경 옵션:</span>

          <Select value={bulkDate} onValueChange={setBulkDate}>
            <SelectTrigger className="w-full sm:w-[150px] h-9 bg-white shadow-sm">
              <SelectValue placeholder="변경 날짜 일괄선택" />
            </SelectTrigger>
            <SelectContent>
              {Array.from(new Set(activeProducts.map(p => p.target_date).filter(Boolean))).sort().map(date => (
                <SelectItem key={date} value={date}>{date}</SelectItem>
              ))}
              <SelectItem value="-">초기화 (선택안함)</SelectItem>
            </SelectContent>
          </Select>

          <Select value={bulkProduct} onValueChange={setBulkProduct}>
            <SelectTrigger className="w-full sm:w-[220px] h-9 bg-white shadow-sm">
              <SelectValue placeholder="변경 상품명 일괄선택" />
            </SelectTrigger>
            <SelectContent>
              {Array.from(new Set(activeProducts.map(p => p.collect_name).filter(Boolean))).sort().map(name => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
              <SelectItem value="-">초기화 (선택안함)</SelectItem>
            </SelectContent>
          </Select>

          <Button onClick={handleChangeSelected} variant="default" size="sm" className="h-9 gap-1.5 bg-indigo-600 hover:bg-indigo-700 w-full sm:w-auto shadow-sm text-sm" disabled={selectedIds.length === 0}>
            <Edit3 className="w-4 h-4" /> 속성 일괄 변경
          </Button>
        </div>
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

          return match;
        });

        return (
          <>
            <Card className="overflow-hidden border-border/80 shadow-md bg-card">
              <div className="overflow-x-auto overflow-y-auto max-h-[600px] w-full">
                <table className="w-full text-sm text-left border-collapse min-w-max">
                  <thead className="bg-slate-100/90 sticky top-0 z-10 shadow-sm border-b border-border">
                    <tr>
                      <th className="px-4 py-3.5 w-12 text-center">
                        <Checkbox className="mx-auto border-slate-400 bg-white" checked={selectedIds.length === filteredLogs.length && filteredLogs.length > 0} onCheckedChange={() => toggleAll(filteredLogs)} />
                      </th>
                      <th className="px-4 py-3.5 font-semibold text-slate-700 whitespace-nowrap">ID</th>
                      <th className="px-4 py-3.5 font-semibold text-slate-700 whitespace-nowrap">수집일</th>
                      <th className="px-4 py-3.5 font-semibold text-slate-700 whitespace-nowrap">대화시간</th>
                      <th className="px-4 py-3.5 font-semibold text-slate-700 min-w-[280px]">대화</th>
                      <th className="px-4 py-3.5 font-semibold text-slate-700 whitespace-nowrap">카테고리</th>
                      <th className="px-4 py-3.5 font-semibold text-slate-700 whitespace-nowrap">닉네임</th>
                      <th className="px-4 py-3.5 font-semibold text-slate-700 min-w-[150px]">상품명</th>
                      <th className="px-4 py-3.5 font-semibold text-slate-700 text-center whitespace-nowrap">수량</th>
                      <th className="px-4 py-3.5 font-semibold text-slate-700 text-center whitespace-nowrap">분류</th>
                      <th className="px-4 py-3.5 font-semibold text-slate-700 text-center whitespace-nowrap">주문여부</th>
                      <th className="px-4 py-3.5 font-semibold text-slate-700 text-center whitespace-nowrap bg-indigo-50/50">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {filteredLogs.length === 0 && (
                      <tr>
                        <td colSpan={11} className="text-center py-10 text-muted-foreground font-medium">검색된 대화 내역이 없습니다.</td>
                      </tr>
                    )}
                    {filteredLogs.map((log) => {
                      const isSelected = selectedIds.includes(log.id)
                      return (
                        <tr key={log.id} onClick={() => toggleRow(log.id)} className={`transition-colors cursor-pointer group ${isSelected ? 'bg-indigo-50/50 hover:bg-indigo-50/80' : 'bg-white hover:bg-muted/40'}`}>
                          <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <Checkbox className={`mx-auto border-slate-300 ${isSelected ? 'border-primary' : ''}`} checked={isSelected} onCheckedChange={() => toggleRow(log.id)} />
                          </td>
                          <td className="px-4 py-3 font-mono text-muted-foreground text-[10px]" title={log.id}>{log.id.substring(0, 8)}</td>
                          <td className="px-4 py-3 text-slate-600 font-medium">{log.date}</td>
                          <td className="px-4 py-3 font-medium">{log.time}</td>
                          <td className="px-4 py-3 text-slate-900 break-words max-w-[400px]">
                            <span className="line-clamp-2" title={log.message}>{log.message}</span>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={log.raw_category === "픽업고지" ? "default" : log.raw_category === "주문취소" ? "destructive" : "secondary"} className="font-normal">
                              {log.raw_category || "기타"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-800 group-hover:text-primary">{log.nickname}</td>
                          <td className="px-4 py-3 text-primary/90 font-semibold">{log.product}</td>
                          <td className="px-4 py-3 text-center font-bold">{log.quantity > 0 ? log.quantity : "-"}</td>
                          <td className="px-4 py-3 text-center">
                            {log.classification ? (
                              <Badge variant="outline" className={`font-normal whitespace-nowrap ${log.classification === 'VIP' || log.classification === '우수고객' || log.classification.includes('🎯') ? 'border-emerald-300 text-emerald-700 bg-emerald-50 font-medium' : 'border-rose-300 text-rose-700 bg-rose-50'}`}>
                                {log.classification}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
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
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
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

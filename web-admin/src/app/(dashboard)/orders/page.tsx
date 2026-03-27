import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export default function OrdersPage() {
    return (
        <div className="flex flex-col gap-6 w-full mx-auto pb-10">
            <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-bold tracking-tight">전체 주문 관리 (CRM)</h2>
                <p className="text-muted-foreground">지난 주문과 예약 내역을 모두 검색하고 고객별 CRM 특이사항을 영구 보존합니다.</p>
            </div>

            <Card className="border-border/50 shadow-sm">
                <CardHeader className="bg-muted/10 border-b pb-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1">
                            <CardTitle>통합 주문 검색 및 목록</CardTitle>
                            <CardDescription>과거부터 현재까지 접수된 모든 오더 뷰입니다. 시트 동기화 없이 실시간 반영됩니다.</CardDescription>
                        </div>
                        <div className="flex items-center gap-2 w-full md:w-auto">
                            <Input placeholder="고객 닉네임, 상품명 검색" className="w-full md:w-[280px] bg-background" />
                            <Button variant="secondary" className="shrink-0 font-medium border shadow-sm">상세 필터</Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="w-full overflow-auto">
                        <table className="w-full text-sm text-left border-collapse">
                            <thead className="bg-muted/40 text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-3 font-semibold border-b">주문/접수일시</th>
                                    <th className="px-4 py-3 font-semibold border-b">픽업(예약)일</th>
                                    <th className="px-4 py-3 font-semibold border-b">고객 닉네임 및 CRM 태그</th>
                                    <th className="px-4 py-3 font-semibold border-b">주문 상품 요약</th>
                                    <th className="px-4 py-3 font-semibold border-b text-center">결제/처리 상태</th>
                                    <th className="px-4 py-3 font-semibold border-b min-w-[200px]">관리자 비고/메모 (실시간 저장)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {/* Dummy Row 1 (VIP) */}
                                <tr className="bg-card hover:bg-muted/30 transition-colors">
                                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">2026-03-26 14:30</td>
                                    <td className="px-4 py-3 font-medium whitespace-nowrap truncate">03-27 (금)</td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold whitespace-nowrap">김철수</span>
                                            <Badge className="bg-blue-500 hover:bg-blue-600 text-white font-medium border-transparent whitespace-nowrap shadow-sm">VIP고객</Badge>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 truncate max-w-[250px]">초코 케이크 1호 x 1, 아이스 아메리카노 x 2</td>
                                    <td className="px-4 py-3 text-center"><Badge className="bg-emerald-500 hover:bg-emerald-600 text-white border-transparent shadow-sm">픽업 완료</Badge></td>
                                    <td className="px-4 py-3">
                                        <Input defaultValue="아메리카노 서비스 쿠폰 1장 발송함" className="h-8 w-full bg-muted/20 border-transparent hover:border-input focus:border-input focus:bg-background transition-colors" />
                                    </td>
                                </tr>

                                {/* Dummy Row 2 (Normal) */}
                                <tr className="bg-card hover:bg-muted/30 transition-colors">
                                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">2026-03-26 12:15</td>
                                    <td className="px-4 py-3 font-medium whitespace-nowrap">03-26 (목)</td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold whitespace-nowrap">단골손님A</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 truncate max-w-[250px]">바닐라 마카롱 5구 세트 x 2</td>
                                    <td className="px-4 py-3 text-center"><Badge variant="secondary" className="shadow-sm">결제 대기</Badge></td>
                                    <td className="px-4 py-3">
                                        <Input placeholder="메모를 입력하세요..." className="h-8 w-full border-transparent hover:border-input focus:border-input focus:bg-background transition-colors" />
                                    </td>
                                </tr>

                                {/* Dummy Row 3 (No-show / Warning) */}
                                <tr className="bg-red-50/10 hover:bg-red-50/40 transition-colors">
                                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">2026-03-25 18:20</td>
                                    <td className="px-4 py-3 font-medium whitespace-nowrap">03-25 (수)</td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold whitespace-nowrap">얌체손님</span>
                                            <Badge variant="destructive" className="bg-red-500 hover:bg-red-600 font-medium whitespace-nowrap shadow-sm">노쇼고객</Badge>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 truncate max-w-[250px]">딸기 듬뿍 롤케이크 x 1 (커스텀 주문)</td>
                                    <td className="px-4 py-3 text-center"><Badge variant="outline" className="text-destructive border-destructive/30 bg-destructive/10">취소 (노쇼)</Badge></td>
                                    <td className="px-4 py-3">
                                        <Input defaultValue="연락 3회 받지 않음. 다음 예약 불가 안내함" className="h-8 w-full text-destructive bg-destructive/5 border-transparent hover:border-destructive/50 focus:border-destructive focus:bg-background transition-colors" />
                                    </td>
                                </tr>

                                {/* Dummy Row 4 (Complain / Warning) */}
                                <tr className="bg-orange-50/10 hover:bg-orange-50/40 transition-colors">
                                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">2026-03-24 10:05</td>
                                    <td className="px-4 py-3 font-medium whitespace-nowrap">03-24 (화)</td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold whitespace-nowrap">예민한고객1</span>
                                            <Badge variant="secondary" className="bg-orange-500/90 hover:bg-orange-600 text-white font-medium border-transparent whitespace-nowrap shadow-sm">컴플레인주의</Badge>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 truncate max-w-[250px]">시그니처 홀케이크 2호</td>
                                    <td className="px-4 py-3 text-center"><Badge className="bg-emerald-500 hover:bg-emerald-600 text-white border-transparent shadow-sm">픽업 완료</Badge></td>
                                    <td className="px-4 py-3">
                                        <Input defaultValue="케이크 포장 시 흔들리지 않게 테이프 2번 고정 요청함" className="h-8 w-full text-orange-700 bg-orange-500/5 border-transparent hover:border-orange-500/50 focus:border-orange-500 focus:bg-background transition-colors" />
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

/**
 * 주문관리 페이지 메모리 캐시
 * - 최근 방문한 날짜 최대 10개를 캐시
 * - 브라우저 탭이 살아있는 동안 유지 (SPA 내 페이지 이동 시 보존)
 * - 새로고침 시 초기화 (항상 최신 데이터 보장)
 */

type CacheEntry = {
    key: string
    rawCustomers: any[]
    products: any[]
    availableDates: string[]
    timestamp: number
}

const MAX_CACHE_SIZE = 10
const cache: Map<string, CacheEntry> = new Map()

/** 캐시 키 생성 (조회 조건이 같은 경우에만 캐시 적중) */
export function makeCacheKey(
    storeId: string,
    searchScope: string,
    currentDate: string,
    customSearchDate: string,
    customEndDate: string,
    activeSearchTerm: string,
): string {
    return `${storeId}|${searchScope}|${currentDate}|${customSearchDate}|${customEndDate}|${activeSearchTerm}`
}

/** 캐시 저장 */
export function setPickupCache(
    key: string,
    rawCustomers: any[],
    products: any[],
    availableDates: string[],
) {
    // 최대 크기 초과 시 가장 오래된 항목 제거
    if (cache.size >= MAX_CACHE_SIZE && !cache.has(key)) {
        let oldestKey = ''
        let oldestTime = Infinity
        for (const [k, v] of cache) {
            if (v.timestamp < oldestTime) {
                oldestTime = v.timestamp
                oldestKey = k
            }
        }
        if (oldestKey) cache.delete(oldestKey)
    }
    cache.set(key, { key, rawCustomers, products, availableDates, timestamp: Date.now() })
}

/** 캐시 조회 (키가 일치하면 반환, 아니면 null) */
export function getPickupCache(key: string): Omit<CacheEntry, 'key'> | null {
    const entry = cache.get(key)
    if (!entry) return null
    return { rawCustomers: entry.rawCustomers, products: entry.products, availableDates: entry.availableDates, timestamp: entry.timestamp }
}

/** 캐시 내 고객 데이터 부분 업데이트 (수령 체크 등) */
export function updatePickupCacheCustomers(
    key: string,
    updater: (customers: any[]) => any[],
) {
    const entry = cache.get(key)
    if (!entry) return
    entry.rawCustomers = updater(entry.rawCustomers)
    entry.timestamp = Date.now()
}

/** 캐시 내 상품 데이터 부분 업데이트 (가격/발주수량/비고 등) */
export function updatePickupCacheProducts(
    key: string,
    updater: (products: any[]) => any[],
) {
    const entry = cache.get(key)
    if (!entry) return
    entry.products = updater(entry.products)
    entry.timestamp = Date.now()
}

/** 캐시 초기화 */
export function clearPickupCache() {
    cache.clear()
}

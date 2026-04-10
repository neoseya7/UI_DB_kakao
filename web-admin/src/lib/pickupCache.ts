/**
 * 주문관리 페이지 메모리 캐시
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

let cache: CacheEntry | null = null

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
    cache = { key, rawCustomers, products, availableDates, timestamp: Date.now() }
}

/** 캐시 조회 (키가 일치하면 반환, 아니면 null) */
export function getPickupCache(key: string): Omit<CacheEntry, 'key'> | null {
    if (!cache || cache.key !== key) return null
    return { rawCustomers: cache.rawCustomers, products: cache.products, availableDates: cache.availableDates, timestamp: cache.timestamp }
}

/** 캐시 초기화 */
export function clearPickupCache() {
    cache = null
}

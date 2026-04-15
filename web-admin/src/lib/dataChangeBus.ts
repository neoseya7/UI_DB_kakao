// Cross-tab data change notifier using BroadcastChannel.
// Producers call notifyOrdersChanged() after mutating orders/chat_logs.
// Consumers call onOrdersChanged(cb) to refetch on any change within the browser.

import { clearPickupCache } from "./pickupCache"

const bus: BroadcastChannel | null =
    typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'
        ? new BroadcastChannel('orders_changed')
        : null

// BroadcastChannel은 송신자 자신의 탭에는 메시지를 전달하지 않으므로,
// 송신 시점에 직접 pickup 캐시를 비워 같은 탭 내 이후 이동에서 stale 데이터가 보이지 않도록 함.
export const notifyOrdersChanged = () => {
    clearPickupCache()
    bus?.postMessage({ t: Date.now() })
}

// 다른 탭에서 오는 이벤트 수신 시에도 pickup 캐시를 비워 둠 (이동 시 재조회 보장).
if (bus) {
    bus.addEventListener('message', () => clearPickupCache())
}

export const onOrdersChanged = (cb: () => void): (() => void) => {
    if (!bus) return () => {}
    const handler = () => cb()
    bus.addEventListener('message', handler)
    return () => bus.removeEventListener('message', handler)
}

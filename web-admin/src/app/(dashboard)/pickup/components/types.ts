export type Product = {
    id: string
    name: string
    price: number
    required: number
    stock: number
    target_date?: string
    is_regular_sale?: boolean
    product_memo?: string
    tiered_prices?: { qty: number; price: number }[]
    unit_text?: string
}

export type Order = {
    id: string
    name: string
    items: number[]
    memo1: string
    memo2: string
    checked: boolean
    originalIndex?: number
    crm?: { category: string; memo: string }
}

export interface PickupViewProps {
    // Data
    products: Product[]
    displayProducts: Product[]
    activeProductIndices: number[]
    filteredCustomers: Order[]
    rawCustomers: Order[]
    isLoading: boolean
    isMerged: boolean
    isDeleteMode: boolean
    selectedDeleteIds: string[]
    posSyncEnabled: boolean
    selectedPosOrders: string[]

    // Editing state
    editingQty: { orderId: string; productIdx: number } | null
    tempQty: string
    editingMemo: { orderId: string; type: 'memo1' | 'memo2' } | null
    isAddingRow: boolean
    addRowNick: string
    addRowQtys: Record<number, string>

    // Handlers
    toggleCheck: (id: string, current: boolean, name?: string) => void
    toggleDeleteSelect: (id: string) => void
    togglePosSelect: (id: string) => void
    togglePosSelectAll: () => void
    handleUpdateQuantity: (orderId: string, productIdx: number, newQtyStr: string) => void
    handleUpdateMemo: (id: string, field: 'customer_memo_1' | 'customer_memo_2', val: string, customerName?: string) => void
    handleUpdateProductField: (productId: string, field: 'price' | 'allocated_stock' | 'product_memo', value: string) => void
    handleDeleteOrder: (id: string, name: string) => void
    handleAddRowSave: () => void
    getDisplaySummary: (items: number[]) => string
    calculateItemPrice: (product: Product | undefined, qty: number) => number

    // Setters
    setEditingQty: (v: { orderId: string; productIdx: number } | null) => void
    setTempQty: (v: string) => void
    setEditingMemo: (v: { orderId: string; type: 'memo1' | 'memo2' } | null) => void
    setIsAddingRow: (v: boolean) => void
    setAddRowNick: (v: string) => void
    setAddRowQtys: (v: Record<number, string> | ((prev: Record<number, string>) => Record<number, string>)) => void

    // Table-specific
    getStickyClasses?: (colName: 'name' | 'receive' | 'delete' | 'summary' | 'price' | 'memo') => { td: string; th: string }
}

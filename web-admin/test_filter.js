const fs = require('fs')

const data = JSON.parse(fs.readFileSync('./out.json', 'utf8'))
const orders = data.rpcData
const mappedProducts = data.productsData

const mappedCustomers = orders.map((o, index) => {
    const itemsArray = mappedProducts.map(p => {
        const match = o.items.find(oi => oi.product_id === p.id)
        return match ? match.quantity : 0
    })

    return {
        id: o.id,
        name: o.customer_nickname,
        items: itemsArray,
        memo1: o.customer_memo_1 || "",
        memo2: o.customer_memo_2 || "",
        crm: null,
        checked: o.is_received || false,
        originalIndex: index
    }
})

// isMerged logic
const customers = true // isMerged is default true
    ? mappedCustomers.reduce((acc, current) => {
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
    }, [])
    : mappedCustomers

console.log("Total unique customers after merge:", customers.length)

// getSummary mock
const getSummary = (items) => {
    return items.map((qty, index) => {
        if (qty <= 0) return null;
        const p = mappedProducts[index];
        let datePrefix = "";
        return `${datePrefix}${p?.collect_name} ${qty}개`;
    }).filter(Boolean).join(" / ")
}

const receiptFilter = "all"
const searchTerm = ""

const filteredCustomers = customers.filter(c => {
    const lowerTerm = (searchTerm || "").toLowerCase()
    const custName = (c.name || "").toLowerCase()
    const summaryText = getSummary(c.items).toLowerCase()
    const memo1 = (c.memo1 || "").toLowerCase()
    const memo2 = (c.memo2 || "").toLowerCase()

    const matchSearch = custName.includes(lowerTerm) || summaryText.includes(lowerTerm) || memo1.includes(lowerTerm) || memo2.includes(lowerTerm)
    const matchReceipt = receiptFilter === "unreceived" ? !c.checked : (receiptFilter === "received" ? c.checked : true)
    return matchSearch && matchReceipt
})

console.log("Filtered customers:", filteredCustomers.length)
if (filteredCustomers.length > 0) {
    fs.writeFileSync('./debug_filtered.json', JSON.stringify(filteredCustomers, null, 2))
}

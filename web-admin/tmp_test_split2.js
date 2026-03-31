const extractedItems = [{ category: "주문", product: "가브리살(1), 항정살(1)", quantity: 2 }];

const newItems = [];
for (const item of extractedItems) {
    let combinedName = item.product || "";
    if (combinedName.includes(",")) {
        const productsStr = combinedName.split(",").map(s => s.trim()).filter(Boolean);
        const quantitiesStr = item.quantity ? item.quantity.toString().split(",").map(s => s.trim()) : ["1"];
        
        for (let i = 0; i < productsStr.length; i++) {
            let rawName = productsStr[i];
            let itemQtyStr = quantitiesStr[i] || quantitiesStr[0] || "1";
            
            const qtyMatch = rawName.match(/(.+?)(?:\((\d+)\))$/);
            if (qtyMatch) {
                rawName = qtyMatch[1].trim();
                itemQtyStr = qtyMatch[2];
            }
            newItems.push({ ...item, product: rawName, quantity: itemQtyStr });
        }
    } else {
        let rawName = combinedName;
        let itemQtyStr = item.quantity || "1";
        const qtyMatch = rawName.match(/(.+?)(?:\((\d+)\))$/);
        if (qtyMatch) {
            rawName = qtyMatch[1].trim();
            itemQtyStr = qtyMatch[2];
        }
        newItems.push({ ...item, product: rawName, quantity: itemQtyStr });
    }
}
console.log(JSON.stringify(newItems, null, 2));

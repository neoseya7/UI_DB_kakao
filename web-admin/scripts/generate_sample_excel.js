const XLSX = require('xlsx');
const fs = require('fs');

const data = [
    { '고객명': '김철수', '픽업일': '2026-03-27', '상품명': '초코 케이크 1호', '수량': 1, '고객비고1': '생일축하 문구 픽 부탁', '고객비고2': '' },
    { '고객명': '김철수', '픽업일': '2026-03-27', '상품명': '아메리카노', '수량': 2, '고객비고1': '', '고객비고2': '' },
    { '고객명': '오렌지맘', '픽업일': '2026-03-28', '상품명': '바닐라 마카롱 5구', '수량': 3, '고객비고1': '보냉팩 넉넉히', '고객비고2': '저녁 시간 픽업' }
];

const ws = XLSX.utils.json_to_sheet(data);

// Column width auto-sizing for better readability
ws['!cols'] = [
    { wch: 10 }, // 고객명
    { wch: 15 }, // 픽업일
    { wch: 20 }, // 상품명
    { wch: 8 },  // 수량
    { wch: 25 }, // 고객비고1
    { wch: 20 }  // 고객비고2
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "주문데이터양식");

// Ensure public directory exists
if (!fs.existsSync('./public')) {
    fs.mkdirSync('./public');
}

XLSX.writeFile(wb, './public/sample_orders.xlsx');
console.log('Sample Excel generated successfully in public/sample_orders.xlsx');

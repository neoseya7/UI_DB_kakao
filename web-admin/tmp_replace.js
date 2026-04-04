const fs = require('fs');
let content = fs.readFileSync('src/app/(dashboard)/settings/page.tsx', 'utf-8');
content = content.replace(/<CardHeader>/g, '<CardHeader className="text-left">');
content = content.replace(/<CardHeader className="(.+?)">/g, '<CardHeader className="text-left $1">');
fs.writeFileSync('src/app/(dashboard)/settings/page.tsx', content);

let content2 = fs.readFileSync('src/app/(dashboard)/orders/page.tsx', 'utf-8');
content2 = content2.replace('실시간으로 챗봇을 통해 접수되는 모든 대화 및 주문 로그를 관리합니다. 일괄 상태 변경이나 삭제 등 통합 처리가 가능합니다.', '');
fs.writeFileSync('src/app/(dashboard)/orders/page.tsx', content2);

let content3 = fs.readFileSync('src/app/(dashboard)/page.tsx', 'utf-8');
content3 = content3.replace('실시간으로 챗봇을 통해 접수되는 모든 대화 및 주문 로그를 관리합니다. 일괄 상태 변경이나 삭제 등 통합 처리가 가능합니다.', '');
fs.writeFileSync('src/app/(dashboard)/page.tsx', content3);

let content4 = fs.readFileSync('src/app/(dashboard)/pickup/page.tsx', 'utf-8');
content4 = content4.replace('<p className="text-muted-foreground">판매 등록된 상품과 수집된 주문정보를 교차 조회합니다.</p>', '');
fs.writeFileSync('src/app/(dashboard)/pickup/page.tsx', content4);

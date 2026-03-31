const fs = require('fs');
const content = fs.readFileSync('vercel_build_crash.log', 'utf16le');
console.log(content.toString());

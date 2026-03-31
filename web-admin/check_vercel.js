const { execSync } = require('child_process');
try {
    const out = execSync('npx vercel ls', { encoding: 'utf-8' });
    console.log(out);
} catch (e) {
    console.error(e.stdout);
}

const { chromium } = require('playwright');
const path = require('path');

const MESSAGE_TO_POST = "おまえらやりませんねぇ杉！！";
const IMAGE_PATH = path.join(__dirname, 'a62e0a5b (1).png');
const REPEAT_COUNT = 15; 

async function main() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        console.log('Padletにログイン中...');
        await page.goto('https://padlet.com/login', { waitUntil: 'domcontentloaded' });

        // プロフィールページ等に飛ばされている場合の「Log in」ボタン対策
        const loginButton = await page.$('a[href*="/login"], button:has-text("Log in")');
        if (loginButton) {
            console.log('「Log in」ボタンを見つけたのでクリックします');
            await loginButton.click();
            await page.waitForTimeout(2000);
        }

        // メールアドレス入力
        await page.waitForSelector('input[name="email"], input[type="email"]', { timeout: 10000 });
        await page.fill('input[name="email"], input[type="email"]', process.env.PADLET_EMAIL);
        
        // パスワード入力欄が表示されるのを待ってから入力
        const passwordInput = await page.waitForSelector('input[name="password"], input[type="password"]', { state: 'visible', timeout: 15000 });
        await passwordInput.fill(process.env.PADLET_PASSWORD);
        
        await page.click('button[type="submit"]');
        
        await page.waitForURL('**/dashboard**', { timeout: 30000 });
        console.log('ダッシュボードにログインしました！');

        for (let i = 0; i < REPEAT_COUNT; i++) {
            console.log(`\n--- ${i + 1}回目の実行開始 ---`);

            await page.goto('https://padlet.com/dashboard', { waitUntil: 'domcontentloaded' });
            
            const boardLinks = await page.$$eval('a[href*="/"]', links => 
                links.map(l => l.href).filter(href => href.includes('padlet.com/') && !href.includes('/dashboard') && !href.includes('/login'))
            );

            const uniqueBoards = [...new Set(boardLinks)];
            console.log(`見つかったボード数: ${uniqueBoards.length}件`);

            for (const boardUrl of uniqueBoards) {
                console.log(`ボードを開いています: ${boardUrl}`);
                try {
                    await page.goto(boardUrl, { waitUntil: 'domcontentloaded' });
                    await page.waitForTimeout(2000);

                    console.log(`メッセージ「${MESSAGE_TO_POST}」を投稿中...`);
                    // 実際の投稿処理はここに追加していきます

                } catch (boardErr) {
                    console.error(`ボード ${boardUrl} でエラーが発生しました:`, boardErr.message);
                }
            }

            if (i < REPEAT_COUNT - 1) {
                console.log('次のループまで待機中...');
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        console.log('\nすべての処理が完了しました！');

    } catch (error) {
        console.error('エラーが発生しました:', error);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

main();

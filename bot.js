const { chromium } = require('playwright');
const path = require('path');

// GitHub Actionsの入力値、またはデフォルト値を使用
const MESSAGE_TO_POST = process.env.CUSTOM_MESSAGE || "おまえらやりませんねぇ杉！！";
const IMAGE_PATH = path.join(__dirname, 'a62e0a5b (1).png');
const TARGET_BOARD_URL = process.env.TARGET_URL;

async function main() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        console.log('Padletにログイン中...');
        await page.goto('https://padlet.com/login', { waitUntil: 'domcontentloaded' });

        // 「Log in」ボタンがあればクリック
        const loginButton = await page.$('a[href*="/login"], button:has-text("Log in")');
        if (loginButton) {
            console.log('「Log in」ボタンを見つけたのでクリックします');
            await loginButton.click();
            await page.waitForTimeout(2000);
        }

        // メールアドレスを入力
        await page.waitForSelector('input[name="email"], input[type="email"]', { timeout: 10000 });
        await page.fill('input[name="email"], input[type="email"]', process.env.PADLET_EMAIL);
        
        // 「次へ」ボタンがあればクリック
        const nextButton = await page.$('button:has-text("次へ"), button:has-text("Continue"), button[type="submit"]');
        if (nextButton) {
            console.log('「次へ」ボタンをクリックしました');
            await nextButton.click();
            await page.waitForTimeout(2000);
        }

        // パスワード入力欄が表示されるのを待ってから入力
        const passwordInput = await page.waitForSelector('input[name="password"], input[type="password"]', { state: 'visible', timeout: 15000 });
        await passwordInput.fill(process.env.PADLET_PASSWORD);
        
        // ログインボタンを押す
        const submitButton = await page.$('button[type="submit"], button:has-text("Log in"), button:has-text("ログイン")');
        if (submitButton) {
            await submitButton.click();
        }
        
        // ログイン後のURLや画面遷移のチェック
        await page.waitForTimeout(5000);
        const currentUrl = page.url();
        console.log('現在のURL:', currentUrl);

        if (currentUrl.includes('verify-login-email-address')) {
            console.log('⚠️ メール認証画面が検知されました。');
            throw new Error('Padlet側でメール認証（セキュリティ確認）が要求されたため中断しました。');
        }

        await page.waitForURL('**/dashboard**', { timeout: 30000 });
        console.log('ダッシュボードにログインしました！');

        if (!TARGET_BOARD_URL) {
            throw new Error('投稿先のPadletのURL（TARGET_URL）が指定されていません。');
        }

        console.log(`指定されたボードを開いています: ${TARGET_BOARD_URL}`);
        await page.goto(TARGET_BOARD_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);

        console.log('ボード内のセクションをスキャン中...');
        
        // ボード内にある各セクションの「＋（投稿追加）」ボタンを検出する
        const addButtons = await page.$$('button[aria-label*="投稿を追加"], button[aria-label*="Add"], .section-add-button, [data-testid="add-post-button"]');
        console.log(`見つかったセクション・追加ボタン数: ${addButtons.length}件`);

        let sectionIndex = 1;
        for (const addBtn of addButtons) {
            try {
                console.log(`- セクション ${sectionIndex} にメッセージと画像を投稿中...`);
                
                // 1. 投稿追加ボタンをクリック
                await addBtn.click();
                await page.waitForTimeout(1000);

                // 2. メッセージを入力
                const editor = await page.waitForSelector('div[contenteditable="true"], textarea', { timeout: 5000 });
                await editor.fill(MESSAGE_TO_POST);

                // 3. 画像ファイルを添付
                const fileInput = await page.$('input[type="file"]');
                if (fileInput) {
                    await fileInput.setInputFiles(IMAGE_PATH);
                    await page.waitForTimeout(2000);
                }

                // 4. 投稿（Publish）ボタンをクリック
                const publishBtn = await page.$('button:has-text("Publish"), button:has-text("投稿"), button[data-testid="publish-button"]');
                if (publishBtn) {
                    await publishBtn.click();
                    console.log(`  -> セクション ${sectionIndex} への投稿完了！`);
                }

                await page.waitForTimeout(2000);
            } catch (secErr) {
                console.log(`  -> セクション ${sectionIndex} への投稿スキップ:`, secErr.message);
            }
            sectionIndex++;
        }

        console.log('\nすべてのセクションへの投稿が完了しました！');

    } catch (error) {
        console.error('エラーが発生しました:', error);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

main();

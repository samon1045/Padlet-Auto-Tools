const { chromium } = require('playwright');
const path = require('path');

const DEFAULT_MESSAGE = "おまえらやりませんねぇ杉！！";
const IMAGE_PATH = path.join(__dirname, 'a62e0a5b (1).png');

async function runBot(targetUrl, customMessage) {
    const messageToPost = customMessage || DEFAULT_MESSAGE;
    const browser = await chromium.launch({ headless: false }); 
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        console.log('Padletにログイン中...');
        await page.goto('https://padlet.com/login', { waitUntil: 'domcontentloaded' });

        const loginButton = await page.$('a[href*="/login"], button:has-text("Log in")');
        if (loginButton) {
            await loginButton.click();
            await page.waitForTimeout(2000);
        }

        await page.waitForSelector('input[name="email"], input[type="email"]', { timeout: 10000 });
        await page.fill('input[name="email"], input[type="email"]', process.env.PADLET_EMAIL || '');

        const nextButton = await page.$('button:has-text("次へ"), button:has-text("Continue"), button[type="submit"]');
        if (nextButton) {
            await nextButton.click();
            await page.waitForTimeout(2000);
        }

        const passwordInput = await page.waitForSelector('input[name="password"], input[type="password"]', { state: 'visible', timeout: 15000 });
        await passwordInput.fill(process.env.PADLET_PASSWORD || '');
        
        const submitButton = await page.$('button[type="submit"]');
        if (submitButton) await submitButton.click();

        await page.waitForTimeout(4000);
        console.log('ログイン処理完了。指定された部屋を開きます...');

        await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);

        console.log('ボード内のセクションを検出中...');
        const addButtons = await page.$$('button[aria-label*="投稿を追加"], button[aria-label*="Add"], .section-add-button, [data-testid="add-post-button"]');
        console.log(`見つかったセクション数: ${addButtons.length}件`);

        let sectionIndex = 1;
        for (const addBtn of addButtons) {
            try {
                console.log(`- セクション ${sectionIndex} に投稿中...`);
                await addBtn.click();
                await page.waitForTimeout(1000);

                const editor = await page.waitForSelector('div[contenteditable="true"], textarea', { timeout: 5000 });
                await editor.fill(messageToPost);

                const fileInput = await page.$('input[type="file"]');
                if (fileInput) {
                    await fileInput.setInputFiles(IMAGE_PATH);
                    await page.waitForTimeout(2000);
                }

                const publishBtn = await page.$('button:has-text("Publish"), button:has-text("投稿"), button[data-testid="publish-button"]');
                if (publishBtn) {
                    await publishBtn.click();
                    console.log(`  -> セクション ${sectionIndex} への投稿が完了しました！`);
                }

                await page.waitForTimeout(2000);
            } catch (err) {
                console.log(`  -> セクション ${sectionIndex} への投稿スキップ:`, err.message);
            }
            sectionIndex++;
        }

        console.log('すべてのセクションへの投稿が完了しました！');

    } catch (error) {
        console.error('実行中にエラーが発生しました:', error);
    } finally {
        await browser.close();
    }
}

module.exports = { runBot };

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// 📝 投稿用メッセージ
const LONG_MESSAGE = process.env.CUSTOM_MESSAGE || ("おまえらやりませんねぇ杉！！さーもんの集いに参加 https://padlet.com/gottanaka/m ".repeat(40) + "\n（うおｗ）\n" + "あ".repeat(900));
const IMAGE_PATH = path.join(__dirname, 'a62e0a5b (1).gif');
const TARGET_BOARD_URL = process.env.TARGET_URL;

async function main() {
    if (process.env.AUTH_JSON) {
        fs.writeFileSync('auth.json', process.env.AUTH_JSON);
    }

    const hasStorageState = fs.existsSync('auth.json');
    const browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const context = await browser.newContext(
        hasStorageState ? { storageState: 'auth.json' } : {}
    );
    const page = await context.newPage();

    try {
        console.log('Target URLに高速アクセス中...');
        if (!TARGET_BOARD_URL) {
            throw new Error('TARGET_URLが指定されていません。');
        }

        await page.goto(TARGET_BOARD_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1000);

        // 🔍 最初にセクションの追加ボタンを一括取得して安定させる
        let sectionAddButtons = await page.$$(
            '.section-add-button, ' +
            'button[aria-label*="セクションに投稿"], ' +
            'button[aria-label*="Add post to section"], ' +
            '[data-testid="section-add-post-button"], ' +
            'section button[aria-label*="Add"]'
        );

        console.log(`検出されたセクション追加ボタン数: ${sectionAddButtons.length} 個`);

        const TOTAL_ROUNDS = 200; 

        for (let round = 1; round <= TOTAL_ROUNDS; round++) {
            console.log(`\n⚡ 【超爆速ラウンド ${round}回目】開始`);

            try {
                await page.keyboard.press('Escape');

                // ==========================================
                // 1. 投稿ボタンのクリック（セクション有無で分岐）
                // ==========================================
                if (sectionAddButtons.length > 0) {
                    const btnIndex = (round - 1) % sectionAddButtons.length;
                    await sectionAddButtons[btnIndex].click();
                } else {
                    // セクションがない場合は右下などの全体追加ボタン
                    await page.evaluate(() => {
                        const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
                        const target = buttons.find(b => {
                            const text = b.innerText || b.textContent || '';
                            return text.includes('Post') || text.includes('投稿') || text.includes('+');
                        });
                        if (target) target.click();
                    });
                }
                await page.waitForTimeout(300);

                // ==========================================
                // 2. テキスト入力・画像添付・Publish・Done
                // ==========================================
                const editor = await page.waitForSelector('div[contenteditable="true"], textarea', { timeout: 2000 });
                if (editor) {
                    await editor.fill(LONG_MESSAGE);
                    await page.waitForTimeout(100);

                    // 画像添付
                    if (fs.existsSync(IMAGE_PATH)) {
                        const fileInput = await page.$('input[type="file"]');
                        if (fileInput) {
                            await fileInput.setInputFiles(IMAGE_PATH);
                            await page.waitForTimeout(600); // アップロード待ちを最小限に短縮
                        }
                    }

                    // 投稿（Publish）
                    const publishBtn = await page.waitForSelector('button:has-text("Publish"), button:has-text("投稿"), [data-testid="publish-button"]', { state: 'visible', timeout: 2000 });
                    if (publishBtn) {
                        await publishBtn.click();
                        await page.waitForTimeout(300);

                        // 名前入力ポップアップの「Done」自動処理
                        try {
                            const doneBtn = await page.waitForSelector('button:has-text("Done"), button:has-text("完了"), [data-testid="guest-done-button"]', { timeout: 1000 });
                            if (doneBtn) {
                                await doneBtn.click();
                                await page.waitForTimeout(200);
                            }
                        } catch (e) {
                            await page.evaluate(() => {
                                const btns = Array.from(document.querySelectorAll('button'));
                                const dBtn = btns.find(b => b.innerText.includes('Done') || b.innerText.includes('完了'));
                                if (dBtn) dBtn.click();
                            });
                        }

                        console.log(`第 ${round} 回の超爆速投稿が完了しました！`);
                    }
                }
            } catch (err) {
                console.log(`第 ${round} 回目で軽微なスキップが発生しました。次へ進みます。`);
                await page.keyboard.press('Escape');
            }
        }

        console.log('\n🎉 全ての超爆速処理が完了しました！');
        await page.screenshot({ path: 'screenshot-success.png', fullPage: true });

    } catch (error) {
        console.error('致命的なエラーが発生しました:', error);
        await page.screenshot({ path: 'screenshot-error.png', fullPage: true });
        process.exit(1);
    } finally {
        await browser.close();
    }
}

main();

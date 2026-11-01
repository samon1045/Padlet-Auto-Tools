const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// 📝 投稿用メッセージ
const LONG_MESSAGE = process.env.CUSTOM_MESSAGE || ("おまえらやりませんねぇ杉！！さーもんの集いに参加 https://padlet.com/10451919uow/m ".repeat(40) + "\n（うおｗ）\n" + "あ".repeat(900));
const IMAGE_PATH = path.join(__dirname, 'a62e0a5b (1).gif');
const TARGET_BOARD_URL = process.env.TARGET_URL;

async function main() {
    if (process.env.AUTH_JSON) {
        fs.writeFileSync('auth.json', process.env.AUTH_JSON);
    }

    const hasStorageState = fs.existsSync('auth.json');
    const browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const context = await browser.newContext(
        hasStorageState ? { storageState: 'auth.json' } : {}
    );
    const page = await context.newPage();

    try {
        console.log('Target URLに直接アクセス中...');
        if (!TARGET_BOARD_URL) {
            throw new Error('TARGET_URLが指定されていません。');
        }

        await page.goto(TARGET_BOARD_URL, { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);

        const TOTAL_ROUNDS = 15; 

        for (let round = 1; round <= TOTAL_ROUNDS; round++) {
            console.log(`\n⚡ 【ラウンド ${round}回目】開始`);

            await page.keyboard.press('Escape');
            await page.waitForTimeout(300);

            // 1. 新規投稿ボタン（+ Post）の検出とクリック
            let clicked = false;

            clicked = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
                const target = buttons.find(b => {
                    const text = b.innerText || b.textContent || '';
                    return text.includes('Post') || text.includes('投稿') || text.includes('+');
                });
                if (target) {
                    target.click();
                    return true;
                }
                return false;
            });

            if (!clicked) {
                const addBtn = await page.$('button:has-text("Post"), button:has-text("投稿"), [data-testid="add-post-button"], .section-add-button');
                if (addBtn) {
                    await addBtn.click();
                    clicked = true;
                }
            }

            if (!clicked) {
                await page.keyboard.press('n');
            }

            await page.waitForTimeout(1000);

            // 2. テキスト入力と投稿
            try {
                const editor = await page.waitForSelector('div[contenteditable="true"], textarea, input[type="text"]', { timeout: 3000 });
                if (editor) {
                    await editor.fill(LONG_MESSAGE);
                    await page.waitForTimeout(300);

                    // 画像添付
                    if (fs.existsSync(IMAGE_PATH)) {
                        const fileInput = await page.$('input[type="file"]');
                        if (fileInput) {
                            await fileInput.setInputFiles(IMAGE_PATH);
                            await page.waitForTimeout(1500);
                        }
                    }

                    // Publishボタンクリック
                    const publishBtn = await page.waitForSelector('button:has-text("Publish"), button:has-text("投稿"), button[data-testid="publish-button"]', { state: 'visible', timeout: 3000 });
                    if (publishBtn) {
                        await publishBtn.click();
                        await page.waitForTimeout(1000);

                        // 3. 投稿後の「Done」ポップアップの確実な自動処理
                        try {
                            const doneBtn = await page.waitForSelector('button:has-text("Done"), button:has-text("完了"), [data-testid="guest-done-button"]', { timeout: 3000 });
                            if (doneBtn) {
                                await doneBtn.click();
                                await page.waitForTimeout(800);
                            }
                        } catch (e) {
                            // DOMから直接Doneボタンを探してクリック
                            await page.evaluate(() => {
                                const btns = Array.from(document.querySelectorAll('button'));
                                const dBtn = btns.find(b => b.innerText.includes('Done') || b.innerText.includes('完了'));
                                if (dBtn) dBtn.click();
                            });
                        }

                        console.log(`第 ${round} 回の投稿が完全に完了しました！`);
                        await page.waitForTimeout(1000);
                    }
                }
            } catch (err) {
                console.log(`第 ${round} 回の投稿処理中にエラーが発生しました。スキップします。`);
                await page.keyboard.press('Escape');
            }
        }

        console.log('\n🎉 全処理が完了しました！');
        await page.screenshot({ path: 'screenshot-success.png', fullPage: true });

    } catch (error) {
        console.error('エラーが発生しました:', error);
        await page.screenshot({ path: 'screenshot-error.png', fullPage: true });
        process.exit(1);
    } finally {
        await browser.close();
    }
}

main();

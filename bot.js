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

            // ==========================================
            // セクションがあるかチェックし、各セクションの追加ボタンを取得
            // ==========================================
            // セクション内にある「+」ボタンや追加ボタンのセレクタを網羅
            let sectionAddButtons = await page.$$(
                '.section-add-button, ' +
                'button[aria-label*="セクションに投稿"], ' +
                'button[aria-label*="Add post to section"], ' +
                '[data-testid="section-add-post-button"], ' +
                'section button[aria-label*="Add"], ' +
                'div[data-section-id] button[aria-label*="Add"], ' +
                'div[data-section-id] button'
            );

            if (sectionAddButtons.length > 0) {
                // セクションがある場合：ラウンドごとに順番にセクションを巡回して投稿
                const btnIndex = (round - 1) % sectionAddButtons.length;
                console.log(`セクションを検出しました（全 ${sectionAddButtons.length} 個中、今回は ${btnIndex + 1} 番目のセクションに追加します）`);
                
                try {
                    await sectionAddButtons[btnIndex].click();
                } catch (e) {
                    // うまくクリックできない場合はJavaScript経由でクリック
                    await page.evaluate((idx) => {
                        const sBtns = Array.from(document.querySelectorAll('.section-add-button, [data-testid="section-add-post-button"], section button, div[data-section-id] button'));
                        if (sBtns[idx]) sBtns[idx].click();
                    }, btnIndex);
                }
                await page.waitForTimeout(800);
            } else {
                // セクションがない場合：画面右下の全体追加ボタン（+ Post）を使用
                console.log('セクションがない部屋のため、全体の追加ボタンを使用します');
                
                let clicked = await page.evaluate(() => {
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
                    const addBtn = await page.$('button:has-text("Post"), button:has-text("投稿"), [data-testid="add-post-button"]');
                    if (addBtn) {
                        await addBtn.click();
                    } else {
                        await page.keyboard.press('n');
                    }
                }
                await page.waitForTimeout(1000);
            }

            // ==========================================
            // テキスト入力・画像添付・投稿・Done処理
            // ==========================================
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

                        // 名前入力ポップアップの「Done」自動処理
                        try {
                            const doneBtn = await page.waitForSelector('button:has-text("Done"), button:has-text("完了"), [data-testid="guest-done-button"]', { timeout: 3000 });
                            if (doneBtn) {
                                await doneBtn.click();
                                await page.waitForTimeout(800);
                            }
                        } catch (e) {
                            await page.evaluate(() => {
                                const btns = Array.from(document.querySelectorAll('button'));
                                const dBtn = btns.find(b => b.innerText.includes('Done') || b.innerText.includes('完了'));
                                if (dBtn) dBtn.click();
                            });
                        }

                        console.log(`第 ${round} 回の投稿が完了しました！`);
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

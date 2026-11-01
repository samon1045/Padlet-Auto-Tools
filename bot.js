const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// 📝 投稿用メッセージ
const LONG_MESSAGE = process.env.CUSTOM_MESSAGE || ("おまえらやりませんねぇ杉！！さーもんの集いに参加 https://padlet.com/goodtanaka/m ".repeat(40) + "\n（うおｗ）\n" + "あ".repeat(900));
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
        await page.waitForTimeout(1500);

        // 1. セクションの追加ボタンを取得
        let sectionAddButtons = await page.$$(
            '.section-add-button, ' +
            'button[aria-label*="セクションに投稿"], ' +
            'button[aria-label*="Add post to section"], ' +
            '[data-testid="section-add-post-button"], ' +
            'section button[aria-label*="Add"]'
        );

        console.log(`検出されたセクション追加ボタン数: ${sectionAddButtons.length} 個`);

        const TOTAL_ROUNDS = 15; 

        for (let round = 1; round <= TOTAL_ROUNDS; round++) {
            console.log(`\n⚡ 【超爆速ラウンド ${round}回目】開始`);

            try {
                await page.keyboard.press('Escape');

                if (sectionAddButtons.length > 0) {
                    // ==========================================
                    // パターンA: セクションがある場合は通常通り新規投稿
                    // ==========================================
                    const btnIndex = (round - 1) % sectionAddButtons.length;
                    await sectionAddButtons[btnIndex].click();
                    await page.waitForTimeout(300);

                    const editor = await page.waitForSelector('div[contenteditable="true"], textarea', { timeout: 2000 });
                    if (editor) {
                        await editor.fill(LONG_MESSAGE);
                        await page.waitForTimeout(100);

                        if (fs.existsSync(IMAGE_PATH)) {
                            const fileInput = await page.$('input[type="file"]');
                            if (fileInput) {
                                await fileInput.setInputFiles(IMAGE_PATH);
                                await page.waitForTimeout(600);
                            }
                        }

                        const publishBtn = await page.waitForSelector('button:has-text("Publish"), button:has-text("投稿"), [data-testid="publish-button"]', { state: 'visible', timeout: 2000 });
                        if (publishBtn) {
                            await publishBtn.click();
                            await page.waitForTimeout(300);

                            try {
                                const doneBtn = await page.waitForSelector('button:has-text("Done"), button:has-text("完了"), [data-testid="guest-done-button"]', { timeout: 1000 });
                                if (doneBtn) {
                                    await doneBtn.click();
                                    await page.waitForTimeout(200);
                                }
                            } catch (e) {}

                            console.log(`第 ${round} 回のセクション投稿が完了しました！`);
                        }
                    }
                } else {
                    // ==========================================
                    // パターンB: セクション・新規投稿不可の部屋 → 既存の投稿にコメント/画像爆撃
                    // ==========================================
                    console.log('新規投稿エリアがないため、既存の投稿（コメント）へアタックします');
                    
                    const posts = await page.$$('.post, [data-testid="post"], article, div[class*="post"]');
                    if (posts.length > 0) {
                        // ラウンドに応じて既存の投稿をターゲットにする
                        const targetPost = posts[(round - 1) % posts.length];
                        await targetPost.click();
                        await page.waitForTimeout(400);

                        // コメント入力欄を探す
                        const commentInput = await page.waitForSelector('textarea[placeholder*="コメント"], div[contenteditable="true"][data-placeholder*="コメント"], textarea, div[contenteditable="true"]', { timeout: 2000 });
                        if (commentInput) {
                            await commentInput.fill(LONG_MESSAGE);
                            await page.waitForTimeout(200);

                            if (fs.existsSync(IMAGE_PATH)) {
                                const fileInput = await page.$('input[type="file"]');
                                if (fileInput) {
                                    await fileInput.setInputFiles(IMAGE_PATH);
                                    await page.waitForTimeout(600);
                                }
                            }

                            // コメント送信ボタン
                            const submitBtn = await page.$('button:has-text("Publish"), button:has-text("コメント"), button[data-testid="comment-submit"], button[aria-label*="送信"], button[aria-label*="投稿"]');
                            if (submitBtn) {
                                await submitBtn.click();
                                await page.waitForTimeout(500);
                            }
                        }
                        console.log(`第 ${round} 回の既存投稿へのコメント爆撃が完了しました！`);
                    } else {
                        console.log('既存の投稿も見つからなかったためスキップします。');
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

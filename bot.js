const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// 📝 送信メッセージと画像パス
const MESSAGE = process.env.CUSTOM_MESSAGE || 'さーもんの集いに参加 https://padlet.com/goodtanaka/m';
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
        console.log('Target URLにアクセス中...');
        if (!TARGET_BOARD_URL) {
            throw new Error('TARGET_URLが指定されていません。');
        }

        await page.goto(TARGET_BOARD_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'screenshot-01-loaded.png', fullPage: true });

        // 2回コメント＆画像投稿を実行
        const TOTAL_ROUNDS = 2; 

        for (let round = 1; round <= TOTAL_ROUNDS; round++) {
            console.log(`\n⚡ 【コメント投稿 ${round}回目】開始`);

            try {
                // モーダル等を閉じるためEsc
                await page.keyboard.press('Escape');
                await page.waitForTimeout(500);

                // 1. ページ内から「+ Add comment」または「コメントを追加」の要素を安全に取得してクリック
                const clicked = await page.evaluate((rIdx) => {
                    const elements = Array.from(document.querySelectorAll('button, div, span, a'));
                    const commentTriggers = elements.filter(el => {
                        const text = (el.innerText || el.textContent || '').trim();
                        return text === '+ Add comment' || text === 'コメントを追加' || text.includes('Add comment');
                    });

                    if (commentTriggers.length > 0) {
                        // ループ回数に応じて異なるカードのコメント欄を狙う
                        const target = commentTriggers[(rIdx - 1) % commentTriggers.length];
                        target.click();
                        return true;
                    }
                    return false;
                }, round);

                await page.waitForTimeout(1000);
                await page.screenshot({ path: `screenshot-r${round}-06-after-comment-click.png`, fullPage: true });

                if (!clicked) {
                    console.log(`[警告] 第 ${round} 回目：コメント追加ボタンが見つかりませんでした。`);
                    await page.screenshot({ path: `screenshot-r${round}-10-failed.png`, fullPage: true });
                    continue;
                }

                // 2. コメント入力欄（contenteditable または textarea）の出現を待つ
                const commentInput = await page.waitForSelector('div[contenteditable="true"], textarea', { timeout: 6000 });
                if (commentInput) {
                    await commentInput.click();
                    await commentInput.fill(MESSAGE);
                    await page.waitForTimeout(500);
                    await page.screenshot({ path: `screenshot-r${round}-07-comment-filled.png`, fullPage: true });

                    // 3. 画像ファイルが存在する場合はアップロード
                    if (fs.existsSync(IMAGE_PATH)) {
                        const fileInput = await page.$('input[type="file"]');
                        if (fileInput) {
                            await fileInput.setInputFiles(IMAGE_PATH);
                            await page.waitForTimeout(2000); // プレビュー・アップロード待ち
                            await page.screenshot({ path: `screenshot-r${round}-08-comment-image-attached.png`, fullPage: true });
                        }
                    }

                    // 4. 送信ボタン（Publish / コメント / 送信など）をクリック
                    const submitBtn = await page.waitForSelector('button:has-text("Publish"), button:has-text("コメント"), [data-testid="comment-submit"], button[aria-label*="送信"], button[aria-label*="投稿"]', { state: 'visible', timeout: 5000 });
                    if (submitBtn) {
                        await submitBtn.click();
                        await page.waitForTimeout(3000); // 投稿完了待ち
                        console.log(`[成功] 第 ${round} 回：コメント＆画像の送信が完了しました！`);
                        await page.screenshot({ path: `screenshot-r${round}-09-comment-submitted.png`, fullPage: true });
                    }
                }

            } catch (err) {
                console.log(`第 ${round} 回目でエラーが発生しました:`, err.message);
                await page.screenshot({ path: `screenshot-r${round}-error.png`, fullPage: true });
                await page.keyboard.press('Escape');
            }
        }

        console.log('\n🎉 全ての処理が完了しました！');
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

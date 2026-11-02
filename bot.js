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
        await page.waitForTimeout(2000);

        // 2回コメントを送信するループ
        const TOTAL_ROUNDS = 2; 

        for (let round = 1; round <= TOTAL_ROUNDS; round++) {
            console.log(`\n⚡ 【コメント送信 ${round}回目】開始`);

            try {
                // モーダルやポップアップを閉じるためEscape
                await page.keyboard.press('Escape');
                await page.waitForTimeout(200);

                // 1. 各投稿にある「+ Add comment」ボタンを探してクリック
                const clickedComment = await page.evaluate(() => {
                    const allElements = Array.from(document.querySelectorAll('button, div, span'));
                    const commentBtns = allElements.filter(el => {
                        const text = (el.innerText || el.textContent || '').trim();
                        return text === '+ Add comment' || text === 'コメントを追加' || text.includes('Add comment');
                    });

                    if (commentBtns.length > 0) {
                        // 最初に見つかったコメントボタンをクリック
                        commentBtns[0].click();
                        return true;
                    }
                    return false;
                });

                if (!clickedComment) {
                    console.log('コメント追加ボタンが見つかりませんでした。スキップします。');
                    continue;
                }

                await page.waitForTimeout(500);

                // 2. コメント入力欄（エディタ）を待機してメッセージを入力
                const commentInput = await page.waitForSelector('div[contenteditable="true"], textarea', { timeout: 3000 });
                if (commentInput) {
                    await commentInput.fill(MESSAGE);
                    await page.waitForTimeout(200);

                    // 3. 画像が存在する場合はアップロード
                    if (fs.existsSync(IMAGE_PATH)) {
                        const fileInput = await page.$('input[type="file"]');
                        if (fileInput) {
                            await fileInput.setInputFiles(IMAGE_PATH);
                            await page.waitForTimeout(800); // 画像アップロード待ち
                        }
                    }

                    // 4. 送信ボタン（Publish / コメント / 送信など）をクリック
                    const submitBtn = await page.waitForSelector('button:has-text("Publish"), button:has-text("コメント"), [data-testid="comment-submit"], button[aria-label*="送信"], button[aria-label*="投稿"]', { state: 'visible', timeout: 3000 });
                    if (submitBtn) {
                        await submitBtn.click();
                        await page.waitForTimeout(1000);
                        console.log(`[成功] 第 ${round} 回：コメント＆画像の送信が完了しました！`);
                    }
                }

            } catch (err) {
                console.log(`第 ${round} 回目でエラーが発生しました:`, err.message);
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

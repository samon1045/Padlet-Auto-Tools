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
        if (!TARGET_BOARD_URL) {
            throw new Error('TARGET_URLが指定されていません。');
        }

        console.log('Padletボードへアクセス中...');
        await page.goto(TARGET_BOARD_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(4000); // ページの描画をしっかり待つ
        await page.screenshot({ path: 'screenshot-01-loaded.png', fullPage: true });

        // コメント＆画像を2回投稿する
        const TOTAL_ROUNDS = 2;

        for (let round = 1; round <= TOTAL_ROUNDS; round++) {
            console.log(`\n⚡ 【コメント投稿 ${round}回目】開始`);

            try {
                // モップアップや余計なモーダルを閉じる
                await page.keyboard.press('Escape');
                await page.waitForTimeout(500);

                // 「Add comment」または「コメントを追加」というテキストを持つ要素をすべて取得
                const commentTriggers = page.locator('text="Add comment", text="コメントを追加"');
                const count = await commentTriggers.count();
                console.log(`検出されたコメント追加ボタンの数: ${count}`);

                if (count === 0) {
                    console.log('コメント追加ボタンが見つかりませんでした。');
                    await page.screenshot({ path: `screenshot-r${round}-error.png`, fullPage: true });
                    continue;
                }

                // ラウンドに応じて順番に異なるカードのコメント欄を狙う
                const targetIndex = (round - 1) % count;
                const targetButton = commentTriggers.nth(targetIndex);

                // 画面内までスクロールして確実にクリック
                await targetButton.scrollIntoViewIfNeeded();
                await targetButton.click();
                console.log(`${targetIndex + 1}番目のコメント追加ボタンをクリックしました。`);

                await page.waitForTimeout(1500); // インライン入力欄が開くのを待つ
                await page.screenshot({ path: `screenshot-r${round}-06-after-comment-click.png`, fullPage: true });

                // コメント入力欄（contenteditable または textarea）の出現を待機
                const editor = page.locator('div[contenteditable="true"], textarea').first();
                await editor.waitFor({ state: 'visible', timeout: 6000 });

                // メッセージを入力
                await editor.click();
                await editor.fill(MESSAGE);
                await page.waitForTimeout(500);
                await page.screenshot({ path: `screenshot-r${round}-07-comment-filled.png`, fullPage: true });

                // 画像ファイルが存在する場合はアップロード
                if (fs.existsSync(IMAGE_PATH)) {
                    const fileInput = page.locator('input[type="file"]');
                    if (await fileInput.count() > 0) {
                        await fileInput.setInputFiles(IMAGE_PATH);
                        console.log('画像を添付しました。');
                        await page.waitForTimeout(2000); // プレビューの読み込み待ち
                        await page.screenshot({ path: `screenshot-r${round}-08-comment-image-attached.png`, fullPage: true });
                    }
                }

                // 送信ボタン（Publish / コメント / 送信など）をクリック
                const submitBtn = page.locator('button:has-text("Publish"), button:has-text("コメント"), [data-testid="comment-submit"], button[aria-label*="送信"], button[aria-label*="投稿"]').first();
                await submitBtn.waitFor({ state: 'visible', timeout: 5000 });
                await submitBtn.click();
                console.log(`[成功] 第 ${round} 回：コメント＆画像の送信が完了しました！`);

                await page.waitForTimeout(3000); // 投稿完了の同期を待つ
                await page.screenshot({ path: `screenshot-r${round}-09-comment-submitted.png`, fullPage: true });

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

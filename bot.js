const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// 📝 送信メッセージと画像パス
const MESSAGE = process.env.CUSTOM_MESSAGE || 'おまえらやりませんねぇ杉！！';
const IMAGE_PATH = path.join(__dirname, 'a62e0a5b (1).gif');
const TARGET_BOARD_URL = process.env.TARGET_URL;

async function main() {
    // 1. 認証情報（auth.json）のセットアップ
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

        console.log('Padletボードにアクセス中...');
        await page.goto(TARGET_BOARD_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);

        // ログイン状態の確認（ログイン画面に飛ばされていないか）
        if (page.url().includes('login') || page.url().includes('verify')) {
            throw new Error('セッションの有効期限が切れているか、ログインしていません。AUTH_JSONを更新してください。');
        }

        console.log('ボードの読み込みを確認しました！');
        await page.screenshot({ path: 'screenshot-01-loaded.png', fullPage: true });

        // コメント＆画像投稿を2回実行
        const TOTAL_ROUNDS = 2;

        for (let round = 1; round <= TOTAL_ROUNDS; round++) {
            console.log(`\n⚡ 【コメント投稿 ${round}回目】開始`);

            try {
                // 余計なモーダル等を閉じるためにEsc
                await page.keyboard.press('Escape');
                await page.waitForTimeout(500);

                // 1. 各投稿の「+ Add comment」や「コメントを追加」ボタンを一括取得
                // 以前のコードの `page.$$` を活用した確実なセレクタ指定
                const commentButtons = await page.$$('button:has-text("Add comment"), button:has-text("コメントを追加"), div:has-text("+ Add comment"), span:has-text("+ Add comment")');
                console.log(`検出されたコメント追加ボタン: ${commentButtons.length}件`);

                if (commentButtons.length === 0) {
                    console.log('コメント追加ボタンが見つかりませんでした。');
                    await page.screenshot({ path: `screenshot-r${round}-error.png`, fullPage: true });
                    continue;
                }

                // ループ回数に応じて異なるカードのコメント欄を狙う（1回目は1番目、2回目は2番目など）
                const targetIndex = (round - 1) % commentButtons.length;
                const targetBtn = commentButtons[targetIndex];

                // 画面内までスクロールしてクリック
                await targetBtn.scrollIntoViewIfNeeded();
                await targetBtn.click();
                await page.waitForTimeout(1500);
                await page.screenshot({ path: `screenshot-r${round}-06-after-comment-click.png`, fullPage: true });

                // 2. メッセージ入力欄（contenteditable または textarea）を待機して入力
                const editor = await page.waitForSelector('div[contenteditable="true"], textarea', { timeout: 5000 });
                if (editor) {
                    await editor.fill(MESSAGE);
                    console.log('メッセージを入力しました。');
                    await page.waitForTimeout(1000);
                    await page.screenshot({ path: `screenshot-r${round}-07-comment-filled.png`, fullPage: true });

                    // 3. GIF画像を添付してアップロード完了を待つ（以前の投稿コードの構成を踏襲）
                    if (fs.existsSync(IMAGE_PATH)) {
                        const fileInput = await page.$('input[type="file"]');
                        if (fileInput) {
                            console.log('GIF画像をアップロード中...');
                            await fileInput.setInputFiles(IMAGE_PATH);
                            await page.waitForTimeout(3000); // プレビューの読み込み待ち
                            await page.screenshot({ path: `screenshot-r${round}-08-comment-image-attached.png`, fullPage: true });
                        }
                    }

                    // 4. 送信ボタン（Publish / コメント / 送信など）を確実に探してクリック
                    const publishBtn = await page.waitForSelector('button:has-text("Publish"), button:has-text("コメント"), [data-testid="comment-submit"], button[aria-label*="送信"], button[aria-label*="投稿"]', { state: 'visible', timeout: 5000 });
                    if (publishBtn) {
                        await publishBtn.click();
                        console.log(` -> 第 ${round} 回：送信ボタンを押しました！`);
                        
                        // 送信処理の反映待ち
                        await page.waitForTimeout(3000);
                        await page.screenshot({ path: `screenshot-r${round}-09-comment-submitted.png`, fullPage: true });

                        // エディターが消えたかチェック（投稿完了確認）
                        const editorStillExists = await page.$('div[contenteditable="true"], textarea');
                        if (editorStillExists) {
                            console.log('  ⚠️ 送信ボタンを押しましたが、入力欄がまだ残っています');
                        } else {
                            console.log('  ✨ コメント＆画像の送信が正常に完了しました！');
                        }
                    }
                }

            } catch (secErr) {
                console.log(`第 ${round} 回目でエラーが発生しました:`, secErr.message);
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

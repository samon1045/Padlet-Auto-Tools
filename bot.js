const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// 📝 送信メッセージと画像パス
const MESSAGE = process.env.CUSTOM_MESSAGE || 'おまえらやりませんねぇ杉！！';
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

        console.log('Padletボードにアクセス中...');
        await page.goto(TARGET_BOARD_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);

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
                await page.keyboard.press('Escape');
                await page.waitForTimeout(500);

                // 1. 各投稿の「+ Add comment」や「コメントを追加」ボタンを取得
                const commentButtons = await page.$$('button:has-text("Add comment"), button:has-text("コメントを追加"), div:has-text("+ Add comment"), span:has-text("+ Add comment")');
                console.log(`検出されたコメント追加ボタン: ${commentButtons.length}件`);

                if (commentButtons.length === 0) {
                    console.log('コメント追加ボタンが見つかりませんでした。');
                    await page.screenshot({ path: `screenshot-r${round}-error.png`, fullPage: true });
                    continue;
                }

                const targetIndex = (round - 1) % commentButtons.length;
                const targetBtn = commentButtons[targetIndex];

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

                    // 3. 画像ファイルの添付処理
                    if (fs.existsSync(IMAGE_PATH)) {
                        console.log('画像添付メニュー（＋ボタン）を開いています...');
                        
                        // 入力欄の左側にある「＋」ボタン（添付用）をクリックしてファイル選択機能を呼び出す
                        // コメントコンテナ内にある「＋」アイコンを持つボタンを探索
                        const attachBtn = await page.$('div[contenteditable="true"] ~ button, div[contenteditable="true"] + div button, button:has(svg):near(div[contenteditable="true"])');
                        if (attachBtn) {
                            await attachBtn.click();
                            await page.waitForTimeout(1000);
                        }

                        // ファイル入力要素（input[type="file"]）にファイルを設定
                        const fileInput = await page.$('input[type="file"]');
                        if (fileInput) {
                            console.log('GIF画像をアップロード中...');
                            await fileInput.setInputFiles(IMAGE_PATH);
                            await page.waitForTimeout(3000); // プレビューの読み込み待ち
                            await page.screenshot({ path: `screenshot-r${round}-08-comment-image-attached.png`, fullPage: true });
                        }
                    }

                    // 4. ピンク色の矢印送信ボタンを確実にクリック
                    // 入力欄の右側にある、背景がピンク色の送信ボタンを特定してクリック
                    const submitBtn = await page.waitForSelector(
                        'button:has(svg):right-of(div[contenteditable="true"]), button[aria-label*="送信"], button[aria-label*="投稿"], button:has-text("Publish"), button:has-text("コメント")', 
                        { state: 'visible', timeout: 5000 }
                    );

                    if (submitBtn) {
                        await submitBtn.click();
                        console.log(` -> 第 ${round} 回：送信ボタン（ピンクの矢印）を押しました！`);
                        
                        await page.waitForTimeout(3000);
                        await page.screenshot({ path: `screenshot-r${round}-09-comment-submitted.png`, fullPage: true });
                        console.log('  ✨ コメント＆画像の送信が正常に完了しました！');
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

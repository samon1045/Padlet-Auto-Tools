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

                // 2. メッセージ入力欄の取得
                const editor = await page.waitForSelector('div[contenteditable="true"], textarea', { timeout: 5000 });
                if (editor) {
                    await editor.focus();
                    await editor.click();
                    
                    // Padletの入力検知（Vue/Reactの状態更新）を動かすため1文字ずつキー入力
                    await page.keyboard.insertText(MESSAGE);
                    console.log('メッセージを入力しました。');
                    await page.waitForTimeout(500);

                    // 3. 画像の添付（ボタンを押さずに直接 file input へ注入）
                    if (fs.existsSync(IMAGE_PATH)) {
                        const fileInputs = await page.$$('input[type="file"]');
                        if (fileInputs.length > 0) {
                            console.log('GIF画像をアップロード中...');
                            // 最も末尾（現在選択中の入力欄に近いもの）または最初のfileInputにセット
                            const targetFileInput = fileInputs[fileInputs.length - 1];
                            await targetFileInput.setInputFiles(IMAGE_PATH);
                            await page.waitForTimeout(3000); // アップロードとプレビューの待機
                            await page.screenshot({ path: `screenshot-r${round}-08-comment-image-attached.png`, fullPage: true });
                        }
                    }

                    // 4. 送信処理（Enterキー送信 ＋ ピンク矢印ボタンクリック）
                    await page.screenshot({ path: `screenshot-r${round}-07-before-submit.png`, fullPage: true });

                    // まずピンク色の矢印ボタンを探してクリックを試みる
                    const submitBtn = await page.$('button[aria-label*="送信"], button[aria-label*="投稿"], button.bg-pink-500, button:has(svg.lucide-arrow-right), button:has(svg.lucide-send)');
                    
                    if (submitBtn && await submitBtn.isVisible()) {
                        await submitBtn.click();
                        console.log(` -> 第 ${round} 回：ピンク色の送信ボタンをクリックしました！`);
                    } else {
                        // ボタンが見つからない・押せない場合はEnterキーで送信
                        await page.keyboard.press('Enter');
                        console.log(` -> 第 ${round} 回：Enterキーで送信しました！`);
                    }

                    await page.waitForTimeout(3000);
                    await page.screenshot({ path: `screenshot-r${round}-09-comment-submitted.png`, fullPage: true });
                    console.log('  ✨ コメント送信処理が完了しました！');
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

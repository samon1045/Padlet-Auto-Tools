const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

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

        // コメント＆画像投稿を2回実行
        const TOTAL_ROUNDS = 2;

        for (let round = 1; round <= TOTAL_ROUNDS; round++) {
            console.log(`\n⚡ 【コメント投稿 ${round}回目】開始`);

            try {
                await page.keyboard.press('Escape');
                await page.waitForTimeout(500);

                // 1. 投稿の「+ Add comment」ボタンを取得してクリック
                const commentButtons = await page.$$('button:has-text("Add comment"), button:has-text("コメントを追加"), div:has-text("+ Add comment"), span:has-text("+ Add comment")');
                console.log(`検出されたコメント追加ボタン: ${commentButtons.length}件`);

                if (commentButtons.length === 0) {
                    console.log('コメント追加ボタンが見つかりませんでした。');
                    continue;
                }

                const targetIndex = (round - 1) % commentButtons.length;
                await commentButtons[targetIndex].scrollIntoViewIfNeeded();
                await commentButtons[targetIndex].click();
                await page.waitForTimeout(1500);

                // 2. メッセージ入力欄を取得してテキストを入力
                const editor = await page.waitForSelector('div[contenteditable="true"], textarea', { timeout: 5000 });
                if (editor) {
                    await editor.focus();
                    await editor.click();

                    await page.keyboard.insertText(MESSAGE);
                    console.log(`メッセージを入力しました: ${MESSAGE}`);
                    await page.waitForTimeout(500);

                    // 3. GIF画像をファイル入力要素（input[type="file"]）経由で添付
                    if (fs.existsSync(IMAGE_PATH)) {
                        console.log('ファイルをアップロード中...');
                        // Padlet内にあるすべてのファイルアップロード用 input を探索
                        const fileInputs = await page.$$('input[type="file"]');
                        if (fileInputs.length > 0) {
                            // 最も適切なファイル入力要素（最後の要素）にセット
                            const targetFileInput = fileInputs[fileInputs.length - 1];
                            await targetFileInput.setInputFiles(IMAGE_PATH);
                            console.log('画像を添付しました！');
                            await page.waitForTimeout(3000); // プレビューの読み込み待ち
                        } else {
                            console.log('⚠️ input[type="file"]が見つかりませんでした。');
                        }
                    }

                    // 4. 送信ボタンをクリック、またはEnterキー
                    const submitBtn = await page.$('button[aria-label*="送信"], button[aria-label*="投稿"], button.bg-pink-500, button:has(svg.lucide-arrow-right), button:has(svg.lucide-send)');
                    
                    if (submitBtn && await submitBtn.isVisible()) {
                        await submitBtn.click();
                        console.log(` -> 第 ${round} 回：送信ボタンをクリックしました！`);
                    } else {
                        await page.keyboard.press('Enter');
                        console.log(` -> 第 ${round} 回：Enterキーで送信しました！`);
                    }

                    await page.waitForTimeout(2000);

                    // 5. ゲスト名入力を求めるポップアップの自動突破
                    const nameInput = await page.$('input[placeholder*="name"], input[type="text"]');
                    const doneBtn = await page.$('button:has-text("Done"), button:has-text("完了")');
                    
                    if (nameInput && doneBtn && await nameInput.isVisible()) {
                        console.log('ゲスト名の入力を検知しました。自動入力します...');
                        await nameInput.fill('さーもん bot');
                        await page.waitForTimeout(500);
                        await doneBtn.click();
                        console.log('名前を登録して完了しました！');
                        await page.waitForTimeout(2000);
                    }

                    console.log(`  ✨ 第 ${round} 回目のコメント＆画像送信が完了しました！`);
                }

            } catch (secErr) {
                console.log(`第 ${round} 回目でエラーが発生しました:`, secErr.message);
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

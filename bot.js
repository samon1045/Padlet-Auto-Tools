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

        // 🔄 指定されたラウンド数実行
        const TOTAL_ROUNDS = 15; 

        for (let round = 1; round <= TOTAL_ROUNDS; round++) {
            console.log(`\n⚡ 【ラウンド ${round}回目】開始`);

            // ESCキーで既存のモーダル等を閉じる
            await page.keyboard.press('Escape');
            await page.waitForTimeout(300);

            // ==========================================
            // 1. 新規投稿ボタン（+ Post）の検出とクリック
            // ==========================================
            let clicked = false;

            // 1-1. テキスト検索・DOM直接クリック
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

            // 1-2. 見つからない場合はPlaywrightのSelectorで探す
            if (!clicked) {
                const addBtn = await page.$('button:has-text("Post"), button:has-text("投稿"), [data-testid="add-post-button"], .section-add-button');
                if (addBtn) {
                    await addBtn.click();
                    clicked = true;
                }
            }

            // 1-3. 最終手段としてキーボードショートカット 'n'
            if (!clicked) {
                console.log('ボタンが見つからないため「n」キーを押します');
                await page.keyboard.press('n');
            }

            await page.waitForTimeout(1000);

            // ==========================================
            // 2. 未ログインポップアップ/名前入力のスキップ処理
            // ==========================================
            try {
                // ゲストとして続行/Done等のボタンが出たらクリック
                const guestBtn = await page.$('button:has-text("Continue as guest"), button:has-text("Done"), button:has-text("完了")');
                if (guestBtn) {
                    await guestBtn.click();
                    await page.waitForTimeout(500);
                }
            } catch (e) {}

            // ==========================================
            // 3. テキスト入力と投稿
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

                    // 投稿（Publish）ボタンクリック
                    const publishBtn = await page.waitForSelector('button:has-text("Publish"), button:has-text("投稿"), button[data-testid="publish-button"]', { state: 'visible', timeout: 3000 });
                    if (publishBtn) {
                        await publishBtn.click();
                        console.log(`第 ${round} 回の投稿に成功しました！`);
                        await page.waitForTimeout(1000);
                    }
                }
            } catch (err) {
                console.log(`第 ${round} 回の投稿フォームが開けませんでした。スキップします。`);
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

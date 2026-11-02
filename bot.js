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

        // 外側ループ：全カードに対して「1回目」と「2回目」のラウンドを回す
        const TOTAL_ROUNDS = 2;

        for (let round = 1; round <= TOTAL_ROUNDS; round++) {
            console.log(`\n============================`);
            console.log(`⚡ 【全体巡回：投稿 ${round}回目】開始`);
            console.log(`============================`);

            // その時点での最新のコメント追加ボタンをすべて取得
            const buttons = await page.$$('button:has-text("Add comment"), button:has-text("コメントを追加"), div:has-text("+ Add comment"), span:has-text("+ Add comment")');
            console.log(`検出されたターゲット数: ${buttons.length}件`);

            if (buttons.length === 0) {
                console.log('コメント追加ボタンが見つかりませんでした。');
                break;
            }

            // 内側ループ：見つかったカードを1つずつ順番に処理
            for (let i = 0; i < buttons.length; i++) {
                try {
                    console.log(`\n📍 カード ${i + 1} / ${buttons.length} への投稿処理中...`);
                    
                    await page.keyboard.press('Escape');
                    await page.waitForTimeout(500);

                    // DOMの変化に備えて毎回ボタンを再取得
                    const currentBtns = await page.$$('button:has-text("Add comment"), button:has-text("コメントを追加"), div:has-text("+ Add comment"), span:has-text("+ Add comment")');
                    if (!currentBtns[i]) {
                        console.log(`⚠️ カード ${i + 1} のボタンが見つからないためスキップします。`);
                        continue;
                    }

                    const targetBtn = currentBtns[i];
                    await targetBtn.scrollIntoViewIfNeeded();
                    await page.waitForTimeout(500);
                    await targetBtn.click();
                    await page.waitForTimeout(1500);

                    // メッセージ入力欄の待機と言語入力
                    const editor = await page.waitForSelector('div[contenteditable="true"], textarea', { timeout: 5000 });
                    if (editor) {
                        await editor.focus();
                        await editor.click();

                        await page.keyboard.insertText(MESSAGE);
                        console.log(`  ✍️ メッセージ入力完了: ${MESSAGE}`);
                        await page.waitForTimeout(500);

                        // GIF画像の添付
                        if (fs.existsSync(IMAGE_PATH)) {
                            const fileInputs = await page.$$('input[type="file"]');
                            if (fileInputs.length > 0) {
                                const targetFileInput = fileInputs[fileInputs.length - 1];
                                await targetFileInput.setInputFiles(IMAGE_PATH);
                                console.log('  🖼️ 画像を添付しました！');
                                await page.waitForTimeout(2500);
                            }
                        }

                        // 送信（Enterキー）
                        await page.keyboard.press('Enter');
                        console.log('  🚀 送信しました！');
                        await page.waitForTimeout(2500);

                        // ゲスト名の自動入力ポップアップ対応
                        const nameInput = await page.$('input[placeholder*="name"], input[type="text"]');
                        const doneBtn = await page.$('button:has-text("Done"), button:has-text("完了")');
                        
                        if (nameInput && doneBtn && await nameInput.isVisible()) {
                            console.log('  👤 ゲスト名入力を検知。自動入力中...');
                            await nameInput.fill('さーもん bot');
                            await page.waitForTimeout(500);
                            await doneBtn.click();
                            console.log('  ✨ 名前を登録しました！');
                            await page.waitForTimeout(2000);
                        }
                    }

                } catch (err) {
                    console.log(`⚠️ カード ${i + 1} の処理中にエラーが発生しました:`, err.message);
                    await page.keyboard.press('Escape');
                }
            }
        }

        console.log('\n🎉 全てのセクションへの投稿処理が完了しました！');
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

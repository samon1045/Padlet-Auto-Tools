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

        // 初めに検出されたボタンの総数を取得
        const initialButtons = await page.$$('button:has-text("Add comment"), button:has-text("コメントを追加"), div:has-text("+ Add comment"), span:has-text("+ Add comment")');
        const totalCards = initialButtons.length;
        console.log(`検出されたコメント追加ボタン（カード数）: ${totalCards}件`);

        if (totalCards === 0) {
            console.log('コメント追加ボタンが見つかりませんでした。');
            return;
        }

        // 各カードに対して順番に処理を行う
        for (let i = 0; i < totalCards; i++) {
            console.log(`\n============================`);
            console.log(`📍 【セクション・カード ${i + 1} / ${totalCards}】への投稿処理`);
            console.log(`============================`);

            // 各カードに対して「2回」投稿を繰り返す
            for (let round = 1; round <= 2; round++) {
                console.log(`\n⚡ ↳ 【${i + 1}番目のカード：投稿 ${round}回目】開始`);

                try {
                    await page.keyboard.press('Escape');
                    await page.waitForTimeout(500);

                    // DOMの変化に対応するため、毎回最新のボタンリストを再取得する
                    const currentButtons = await page.$$('button:has-text("Add comment"), button:has-text("コメントを追加"), div:has-text("+ Add comment"), span:has-text("+ Add comment")');
                    
                    if (!currentButtons[i]) {
                        console.log(`⚠️ ${i + 1}番目のコメント追加ボタンが見つからないためスキップします。`);
                        break;
                    }

                    const targetBtn = currentButtons[i];
                    await targetBtn.scrollIntoViewIfNeeded();
                    await targetBtn.click();
                    await page.waitForTimeout(1500);

                    // メッセージ入力欄の取得
                    const editor = await page.waitForSelector('div[contenteditable="true"], textarea', { timeout: 5000 });
                    if (editor) {
                        await editor.focus();
                        await editor.click();

                        // メッセージを入力
                        await page.keyboard.insertText(MESSAGE);
                        console.log(`メッセージを入力しました: ${MESSAGE}`);
                        await page.waitForTimeout(500);

                        // GIF画像をアップロード（input[type="file"]経由）
                        if (fs.existsSync(IMAGE_PATH)) {
                            const fileInputs = await page.$$('input[type="file"]');
                            if (fileInputs.length > 0) {
                                const targetFileInput = fileInputs[fileInputs.length - 1];
                                await targetFileInput.setInputFiles(IMAGE_PATH);
                                console.log('画像を添付しました！');
                                await page.waitForTimeout(2500);
                            }
                        }

                        // 送信（Enterキー送信）
                        await page.keyboard.press('Enter');
                        console.log(' -> Enterキーで送信しました！');
                        await page.waitForTimeout(2500);

                        // ゲスト名入力を求めるポップアップ（"What should we call you?"）への自動対応
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

                        console.log(`  ✨ ${i + 1}番目のカードへの投稿（${round}回目）が完了しました！`);
                    }

                } catch (err) {
                    console.log(`⚠️ 投稿中にエラーが発生しました:`, err.message);
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

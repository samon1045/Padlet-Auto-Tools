const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// 📝 設定値
const TOPIC_MESSAGE = process.env.TOPIC_MESSAGE || 'おまえらやりませんねぇ杉！！';
const COMMENT_MESSAGE = process.env.COMMENT_MESSAGE || 'お前らやりませんね杉！！';
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

        // 各カードへのコメント投稿を「2回ずつ」行うラウンド設定
        const TOTAL_ROUNDS = 2;

        for (let round = 1; round <= TOTAL_ROUNDS; round++) {
            console.log(`\n============================`);
            console.log(`⚡ 【全体巡回：コメント投稿 ${round}回目】開始`);
            console.log(`============================`);

            // ボード全体からすべての「コメントを追加 / Add comment」ボタンを検出
            const commentButtons = await page.$$('button:has-text("Add comment"), button:has-text("コメントを追加"), div:has-text("+ Add comment"), span:has-text("+ Add comment")');
            console.log(`検出されたコメント入力欄: ${commentButtons.length}件`);

            if (commentButtons.length === 0) {
                console.log('コメント追加ボタンが見つかりませんでした。');
                break;
            }

            // 見つかったすべてのカードを1つずつ順番に処理
            for (let i = 0; i < commentButtons.length; i++) {
                try {
                    console.log(`\n📍 【カード ${i + 1} / ${commentButtons.length}】へのコメント処理中...`);
                    
                    await page.keyboard.press('Escape');
                    await page.waitForTimeout(500);

                    // DOMの変化に備えて毎回ボタンを再取得
                    const freshButtons = await page.$$('button:has-text("Add comment"), button:has-text("コメントを追加"), div:has-text("+ Add comment"), span:has-text("+ Add comment")');
                    
                    if (!freshButtons[i]) {
                        console.log(`⚠️ カード ${i + 1} のボタンが見つからないためスキップします。`);
                        continue;
                    }

                    const targetBtn = freshButtons[i];

                    // 画面外にあるセクションのカードも確実に画面内にスクロールして表示させる
                    await targetBtn.scrollIntoViewIfNeeded();
                    await page.waitForTimeout(800);

                    await targetBtn.click();
                    await page.waitForTimeout(1500);

                    // コメント入力欄（contenteditable または textarea）を待機
                    const editor = await page.waitForSelector('div[contenteditable="true"], textarea', { timeout: 5000 });
                    if (editor) {
                        await editor.focus();
                        await editor.click();

                        // コメント用メッセージを入力
                        await page.keyboard.insertText(COMMENT_MESSAGE);
                        console.log(`  ✍️ コメント入力完了: ${COMMENT_MESSAGE}`);
                        await page.waitForTimeout(500);

                        // GIF画像をファイル入力経由で添付
                        if (fs.existsSync(IMAGE_PATH)) {
                            const fileInputs = await page.$$('input[type="file"]');
                            if (fileInputs.length > 0) {
                                const targetFileInput = fileInputs[fileInputs.length - 1];
                                await targetFileInput.setInputFiles(IMAGE_PATH);
                                console.log('  🖼️ 画像を添付しました！');
                                await page.waitForTimeout(2500); // プレビュー読込待ち
                            }
                        }

                        // Enterキーで送信
                        await page.keyboard.press('Enter');
                        console.log('  🚀 コメントを送信しました！');
                        await page.waitForTimeout(3000);

                        // ゲスト名入力を求めるポップアップ（"What should we call you?"）への自動対応
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

        console.log('\n🎉 全てのセクション・カードへのコメント投稿が完了しました！');
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

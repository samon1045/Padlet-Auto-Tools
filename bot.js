const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const COMMENT_MESSAGE = process.env.COMMENT_MESSAGE || 'おまえらやりませんねぇ杉！！';
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
        await page.waitForTimeout(4000);

        if (page.url().includes('login') || page.url().includes('verify')) {
            throw new Error('セッションの有効期限が切れているか、ログインしていません。AUTH_JSONを更新してください。');
        }

        console.log('ボードの読み込みを確認しました！');

        // 各カードへのコメント投稿を確実に「2回ずつ」行うラウンド設定
        const TOTAL_ROUNDS = 2;

        for (let round = 1; round <= TOTAL_ROUNDS; round++) {
            console.log(`\n============================`);
            console.log(`⚡ 【完全安定巡回：投稿 ${round}回目】開始`);
            console.log(`============================`);

            // 毎回ループの最初に、その時点にあるコメントボタンの「総数」を数える
            let processedCount = 0;
            
            while (true) {
                await page.keyboard.press('Escape');
                await page.waitForTimeout(500);

                // 常に「上から順にある最初のコメント追加ボタン」を1つだけ安全に取得する
                const commentSelectors = [
                    'button:has-text("Add comment")',
                    'button:has-text("コメントを追加")',
                    'div:has-text("+ Add comment")',
                    'span:has-text("+ Add comment")'
                ];

                let targetBtn = null;
                for (const sel of commentSelectors) {
                    const found = await page.$$(sel);
                    if (found.length > processedCount) {
                        // まだ処理していない（あるいは新しく出現した）上から順のボタンを狙う
                        targetBtn = found[processedCount];
                        if (targetBtn) break;
                    }
                }

                // もし対象のボタンが見つからなければ、このラウンドの全カード処理完了
                if (!targetBtn) {
                    console.log(`✨ このラウンドの全カード処理が終了しました（処理数: ${processedCount}件）。`);
                    break;
                }

                try {
                    console.log(`\n📍 [カード ${processedCount + 1}] への投稿処理中...`);

                    await targetBtn.scrollIntoViewIfNeeded();
                    await page.waitForTimeout(800);

                    await targetBtn.click();
                    await page.waitForTimeout(1500);

                    // メッセージ入力欄を待機
                    const editor = await page.waitForSelector('div[contenteditable="true"], textarea', { timeout: 5000 });
                    if (editor) {
                        await editor.focus();
                        await editor.click();

                        // メッセージを入力
                        await page.keyboard.insertText(COMMENT_MESSAGE);
                        console.log(`  ✍️ メッセージ入力: ${COMMENT_MESSAGE}`);
                        await page.waitForTimeout(500);

                        // GIF画像をファイル入力経由で添付
                        if (fs.existsSync(IMAGE_PATH)) {
                            const fileInputs = await page.$$('input[type="file"]');
                            if (fileInputs.length > 0) {
                                const targetFileInput = fileInputs[fileInputs.length - 1];
                                await targetFileInput.setInputFiles(IMAGE_PATH);
                                console.log('  🖼️ 画像を添付しました！');
                                await page.waitForTimeout(2500);
                            }
                        }

                        // Enterキーで送信
                        await page.keyboard.press('Enter');
                        console.log('  🚀 送信しました！');
                        await page.waitForTimeout(3500); // 送信後のDOM再描画をしっかり待つ

                        // ゲスト名入力を求めるポップアップへの自動対応
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

                    processedCount++;

                } catch (err) {
                    console.log(`⚠️ 処理中にエラーが発生したため、次のカードへ進みます:`, err.message);
                    processedCount++; // エラー時も無限ループ防止のためインクリメント
                    await page.keyboard.press('Escape');
                }
            }
        }

        console.log('\n🎉 全てのセクション・カードへの投稿処理が完了しました！');
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

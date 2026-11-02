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
            console.log(`⚡ 【完全網羅巡回：投稿 ${round}回目】開始`);
            console.log(`============================`);

            // ボード内にあるすべての「投稿カード（ポスト）」の要素を最初に全取得する
            // これにより、コメント数が変わってボタンの見た目が変わってもカード位置を完全キープできます
            const cards = await page.$$('div.post, div.card, article, div[data-id], div.iti-post');
            console.log(`検出されたカード（ポスト）数: ${cards.length}件`);

            // もしカードが直接取れない場合は、従来のコメントボタン全件取得にフォールバック
            let targetCount = cards.length;
            if (targetCount === 0) {
                const fallbackBtns = await page.$$('button:has-text("Add comment"), button:has-text("コメントを追加"), div:has-text("+ Add comment"), span:has-text("+ Add comment"), button[aria-label*="comment"]');
                targetCount = fallbackBtns.length;
            }

            console.log(`対象ターゲット数: ${targetCount}件`);

            if (targetCount === 0) {
                console.log('対象のカードが見つかりませんでした。');
                break;
            }

            // 1番目から最後のカードまで、順番に確実に対象を絞って処理する
            for (let i = 0; i < targetCount; i++) {
                try {
                    console.log(`\n📍 [カード ${i + 1} / ${targetCount}] への投稿処理中...`);
                    
                    await page.keyboard.press('Escape');
                    await page.waitForTimeout(500);

                    // 毎回最新のカードリストから「i番目」のカードを取得
                    const currentCards = await page.$$('div.post, div.card, article, div[data-id], div.iti-post');
                    const targetCard = currentCards[i];

                    let targetBtn = null;
                    if (targetCard) {
                        // カードの中にあるコメント追加ボタン、またはコメントエリアを探す
                        targetBtn = await targetCard.$('button:has-text("Add comment"), button:has-text("コメントを追加"), div:has-text("+ Add comment"), span:has-text("+ Add comment"), button[aria-label*="comment"], div.comment-box');
                    }

                    // カード経由で見つからない場合は全体からi番目のボタンを直接取得
                    if (!targetBtn) {
                        const allBtns = await page.$$('button:has-text("Add comment"), button:has-text("コメントを追加"), div:has-text("+ Add comment"), span:has-text("+ Add comment"), button[aria-label*="comment"]');
                        targetBtn = allBtns[i];
                    }

                    if (!targetBtn) {
                        console.log(`⚠️ カード ${i + 1} のコメントボタンが見つからないためスキップします。`);
                        continue;
                    }

                    // 画面内に確実にスクロールして表示
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
                        await page.waitForTimeout(3500);

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

                } catch (err) {
                    console.log(`⚠️ カード ${i + 1} の処理中にエラーが発生しました:`, err.message);
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

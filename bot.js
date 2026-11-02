const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// 📝 設定値
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
            console.log(`⚡ 【Geminiサポート巡回：投稿 ${round}回目】開始`);
            console.log(`============================`);

            // 1. ページ内のすべての「コメント追加ボタン」や「カード」の要素位置を全スキャン
            // より広範囲にセレクタを網羅し、重複を除外してリスト化
            const commentSelectors = [
                'button:has-text("Add comment")',
                'button:has-text("コメントを追加")',
                'div:has-text("+ Add comment")',
                'span:has-text("+ Add comment")',
                'div.comment-add-button',
                'div[data-testid="comment-button"]'
            ];

            let buttons = [];
            for (const selector of commentSelectors) {
                const found = await page.$$(selector);
                if (found.length > 0) {
                    buttons = found;
                    break;
                }
            }

            // もしボタンが直接見つからない場合は、カードの投稿コンテナ自体から逆引きする
            if (buttons.length === 0) {
                console.log('⚠️ 標準セレクタでのボタン検出数が0件のため、カードコンテナから再スキャンします...');
                const posts = await page.$$('div.post, div.card, article, div[data-id]');
                for (const post of posts) {
                    const btn = await post.$('button, div[role="button"], span');
                    if (btn) buttons.push(btn);
                }
            }

            console.log(`🎯 検出された対象カード数: ${buttons.length}件`);

            if (buttons.length === 0) {
                console.log('対象のカードが見つかりませんでした。');
                break;
            }

            // すべてのカードを1つずつ順番に確実に処理
            for (let i = 0; i < buttons.length; i++) {
                try {
                    console.log(`\n📍 [カード ${i + 1} / ${buttons.length}] への投稿処理中...`);
                    
                    await page.keyboard.press('Escape');
                    await page.waitForTimeout(500);

                    // 最新の状態のボタンを再取得してクリック
                    const currentButtons = await page.$$('button:has-text("Add comment"), button:has-text("コメントを追加"), div:has-text("+ Add comment"), span:has-text("+ Add comment")');
                    const targetBtn = currentButtons[i] || buttons[i];

                    if (!targetBtn) {
                        console.log(`⚠️ カード ${i + 1} の要素が見つからないためスキップします。`);
                        continue;
                    }

                    // 画面内に確実にスクロールして表示
                    await targetBtn.scrollIntoViewIfNeeded();
                    await page.waitForTimeout(1000);

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
                        await page.waitForTimeout(3000);

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

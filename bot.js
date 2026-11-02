const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// 📝 設定値
const TOPIC_TITLE = process.env.TOPIC_TITLE || '【校則について】';
const TOPIC_MESSAGE = process.env.TOPIC_MESSAGE || '校則をしっかり守りましょう。';
const COMMENT_MESSAGE = process.env.COMMENT_MESSAGE || 'おまえらやりませんねぇ杉！！';
const IMAGE_PATH = path.join(__dirname, 'a62e0a5b (1).gif');
const TARGET_BOARD_URL = process.env.TARGET_URL;

// 画面上の余計なモーダルや拡大ビューを徹底的に閉じるヘルパー
async function dismissOverlays(page) {
    for (let i = 0; i < 3; i++) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
    }
}

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

        // ==========================================
        // 1. 各セクションに「校則」の新規投稿を作成
        // ==========================================
        console.log('\n============================');
        console.log('📂 【校則の新規投稿作成】開始');
        console.log('============================');

        const addButtons = await page.$$('button[aria-label*="投稿を追加"], button[aria-label*="Add post"], button.section-add-btn, div.section-add-button, button:has-text("+")');
        console.log(`検出されたセクション追加ボタン数: ${addButtons.length}件`);

        for (let i = 0; i < addButtons.length; i++) {
            try {
                await dismissOverlays(page);
                console.log(`\n📍 [セクション ${i + 1} / ${addButtons.length}] に校則の新規投稿を作成中...`);
                
                const freshAddBtns = await page.$$('button[aria-label*="投稿を追加"], button[aria-label*="Add post"], button.section-add-btn, div.section-add-button, button:has-text("+")');
                const targetAddBtn = freshAddBtns[i];

                if (!targetAddBtn) continue;

                await targetAddBtn.scrollIntoViewIfNeeded();
                await page.waitForTimeout(500);
                await targetAddBtn.click({ force: true });
                await page.waitForTimeout(1500);

                // タイトル入力欄
                const titleInput = await page.$('input[placeholder*="Title"], input[placeholder*="タイトル"], input[type="text"]');
                if (titleInput && await titleInput.isVisible()) {
                    await titleInput.fill(TOPIC_TITLE);
                    console.log(`  ✍️ タイトル入力: ${TOPIC_TITLE}`);
                    await page.waitForTimeout(300);
                }

                // メッセージ（本文）入力欄
                const bodyEditor = await page.$('div[contenteditable="true"], textarea');
                if (bodyEditor) {
                    await bodyEditor.focus();
                    await bodyEditor.click();
                    await page.keyboard.insertText(TOPIC_MESSAGE);
                    console.log(`  ✍️ メッセージ入力: ${TOPIC_MESSAGE}`);
                    await page.waitForTimeout(300);
                }

                // 画像の添付
                if (fs.existsSync(IMAGE_PATH)) {
                    const fileInputs = await page.$$('input[type="file"]');
                    if (fileInputs.length > 0) {
                        const targetFileInput = fileInputs[fileInputs.length - 1];
                        await targetFileInput.setInputFiles(IMAGE_PATH);
                        console.log('  🖼️ 新規投稿に画像を添付しました！');
                        await page.waitForTimeout(2000);
                    }
                }

                // 公開（Publish）
                const publishBtn = await page.$('button:has-text("Publish"), button:has-text("投稿"), button:has-text("公開"), button[type="submit"]');
                if (publishBtn && await publishBtn.isVisible()) {
                    await publishBtn.click({ force: true });
                } else {
                    await page.keyboard.press('Enter');
                }
                console.log('  🚀 校則の新規投稿を公開しました！');
                await page.waitForTimeout(2500);

                // ゲスト名入力を求めるポップアップへの自動対応
                const nameInput = await page.$('input[placeholder*="name"], input[type="text"]');
                const doneBtn = await page.$('button:has-text("Done"), button:has-text("完了")');
                if (nameInput && doneBtn && await nameInput.isVisible()) {
                    await nameInput.fill('さーもん bot');
                    await doneBtn.click({ force: true });
                    await page.waitForTimeout(1500);
                }

            } catch (err) {
                console.log(`⚠️ セクション ${i + 1} の新規投稿作成中にエラー:`, err.message);
            } finally {
                await dismissOverlays(page);
            }
        }

        // ==========================================
        // 2. コメント巡回（詳細拡大ビューの干渉を完全ブロック）
        // ==========================================
        const TOTAL_ROUNDS = 2;

        for (let round = 1; round <= TOTAL_ROUNDS; round++) {
            console.log(`\n============================`);
            console.log(`⚡ 【コメント巡回：投稿 ${round}回目】開始`);
            console.log(`============================`);

            let processedCount = 0;

            while (true) {
                await dismissOverlays(page);

                const commentSelectors = [
                    'button:has-text("Add comment")',
                    'button:has-text("コメントを追加")',
                    'div:has-text("+ Add comment")',
                    'span:has-text("+ Add comment")',
                    'button[aria-label*="comment"]'
                ];

                let targetBtn = null;
                for (const sel of commentSelectors) {
                    const found = await page.$$(sel);
                    if (found.length > processedCount) {
                        targetBtn = found[processedCount];
                        if (targetBtn) break;
                    }
                }

                if (!targetBtn) {
                    console.log(`✨ このラウンドの全カードのコメント処理が終了しました（処理数: ${processedCount}件）。`);
                    break;
                }

                try {
                    console.log(`\n📍 [カード ${processedCount + 1}] へのコメント投稿処理中...`);

                    await targetBtn.scrollIntoViewIfNeeded();
                    await page.waitForTimeout(500);

                    // 誤ってカードの拡大ビューが開かないよう、ボタンピンポイントでクリック
                    await targetBtn.click({ force: true });
                    await page.waitForTimeout(1500);

                    // もしカードの詳細拡大画面が誤って開いてしまった場合は、一度Escapeで戻るか、詳細内の入力欄を探す
                    let editor = await page.$('div[contenteditable="true"], textarea');
                    if (!editor) {
                        // 詳細画面が開いている可能性があるので、中のコメント入力欄を直接探す
                        editor = await page.waitForSelector('div[contenteditable="true"], textarea', { timeout: 3000 }).catch(() => null);
                    }

                    if (editor) {
                        await editor.focus();
                        await editor.click();

                        await page.keyboard.insertText(COMMENT_MESSAGE);
                        console.log(`  ✍️ コメント入力: ${COMMENT_MESSAGE}`);
                        await page.waitForTimeout(300);

                        if (fs.existsSync(IMAGE_PATH)) {
                            const fileInputs = await page.$$('input[type="file"]');
                            if (fileInputs.length > 0) {
                                const targetFileInput = fileInputs[fileInputs.length - 1];
                                await targetFileInput.setInputFiles(IMAGE_PATH);
                                console.log('  🖼️ コメントに画像を添付しました！');
                                await page.waitForTimeout(2000);
                            }
                        }

                        await page.keyboard.press('Enter');
                        console.log('  🚀 コメントを送信しました！');
                        await page.waitForTimeout(3000);

                        // ゲスト名入力を求めるポップアップへの自動対応
                        const nameInput = await page.$('input[placeholder*="name"], input[type="text"]');
                        const doneBtn = await page.$('button:has-text("Done"), button:has-text("完了")');
                        if (nameInput && doneBtn && await nameInput.isVisible()) {
                            console.log('  👤 ゲスト名入力を検知。自動入力中...');
                            await nameInput.fill('さーもん bot');
                            await doneBtn.click({ force: true });
                            console.log('  ✨ 名前を登録しました！');
                            await page.waitForTimeout(1500);
                        }
                    }

                    processedCount++;

                } catch (err) {
                    console.log(`⚠️ カード ${processedCount + 1} の処理中にエラーが発生したため次へ進みます:`, err.message);
                    processedCount++;
                } finally {
                    await dismissOverlays(page);
                }
            }
        }

        console.log('\n🎉 全ての「校則」新規投稿およびコメント巡回処理が完了しました！');
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

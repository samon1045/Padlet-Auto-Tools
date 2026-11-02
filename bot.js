const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// 📝 設定値
const TOPIC_TITLE = process.env.TOPIC_TITLE || '【校則について】';
const TOPIC_MESSAGE = process.env.TOPIC_MESSAGE || '校則をしっかり守りましょう。';
const COMMENT_MESSAGE = process.env.COMMENT_MESSAGE || 'おまえらやりませんねぇ杉！！';
const IMAGE_PATH = path.join(__dirname, 'a62e0a5b (1).gif');
const TARGET_BOARD_URL = process.env.TARGET_URL;

// 画面上に残ったポップアップやメニューを完全に排除する強力なヘルパー
async function dismissAllModals(page) {
    for (let i = 0; i < 4; i++) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(150);
    }
    try {
        await page.evaluate(() => {
            const overlays = document.querySelectorAll('.oz-overlay, [data-testid*="contentPicker"], [data-testid*="modal"], .fixed.inset-0');
            overlays.forEach(el => {
                if (!el.closest('.board-container') && !el.closest('main')) {
                    el.style.display = 'none';
                }
            });
        });
        await page.mouse.click(5, 5);
    } catch (e) {}
    await page.waitForTimeout(300);
}

// 🖼️ 確実に画像をアップロードするための共通関数
async function attachImage(page) {
    if (!fs.existsSync(IMAGE_PATH)) return;

    try {
        // 1. 添付用ボタン（「＋」アイコン、📎、あるいはファイル追加ボタン）を探してクリック
        const attachTrigger = await page.$('button[aria-label*="Attach"], button[aria-label*="file"], button[aria-label*="追加"], button[data-testid*="Upload"], button:has-text("Upload"), button:has-text("ファイル")');
        if (attachTrigger) {
            await attachTrigger.click({ force: true });
            await page.waitForTimeout(1000);
        }

        // 2. メニュー内の「Upload」ボタンまたは hidden の input[type="file"] を探す
        const uploadOption = await page.$('button:has-text("Upload"), [data-testid*="Upload"]');
        if (uploadOption) {
            // file chooserを待機しながらUploadをクリック
            const [fileChooser] = await Promise.all([
                page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null),
                uploadOption.click({ force: true })
            ]);
            if (fileChooser) {
                await fileChooser.setFiles(IMAGE_PATH);
                console.log('  🖼️ ファイルチューザー経由で画像を添付しました！');
                await page.waitForTimeout(3000);
                return;
            }
        }

        // 3. 直接 input[type="file"] が存在する場合
        const fileInputs = await page.$$('input[type="file"]');
        if (fileInputs.length > 0) {
            const targetFileInput = fileInputs[fileInputs.length - 1];
            await targetFileInput.setInputFiles(IMAGE_PATH);
            console.log('  🖼️ input[type="file"] 経由で画像を添付しました！');
            await page.waitForTimeout(3000);
        }
    } catch (err) {
        console.log('  ⚠️ 画像添付中に軽微なスキップが発生しました:', err.message);
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
        await page.screenshot({ path: 'screenshot-loaded.png', fullPage: true });

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
                await dismissAllModals(page);
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
                    await page.waitForTimeout(500);
                }

                // 🖼️ 新規投稿への画像添付を実行
                await attachImage(page);

                // 公開（Publish）
                const publishBtn = await page.$('button:has-text("Publish"), button:has-text("投稿"), button:has-text("公開"), button[type="submit"]');
                if (publishBtn && await publishBtn.isVisible()) {
                    await publishBtn.click({ force: true });
                } else {
                    await page.keyboard.press('Enter');
                }
                console.log('  🚀 校則の新規投稿を公開しました！');
                await page.waitForTimeout(3500);

                await page.screenshot({ path: `screenshot-topic-sec${i + 1}.png`, fullPage: true });

                const nameInput = await page.$('input[placeholder*="name"], input[type="text"]');
                const doneBtn = await page.$('button:has-text("Done"), button:has-text("完了")');
                if (nameInput && doneBtn && await nameInput.isVisible()) {
                    await nameInput.fill('さーもん bot');
                    await doneBtn.click({ force: true });
                    await page.waitForTimeout(1500);
                }

            } catch (err) {
                console.log(`⚠️ セクション ${i + 1} の新規投稿作成中にエラー:`, err.message);
                await page.screenshot({ path: `screenshot-error-sec${i + 1}.png`, fullPage: true });
            } finally {
                await dismissAllModals(page);
            }
        }

        // ==========================================
        // 2. コメント巡回
        // ==========================================
        const TOTAL_ROUNDS = 2;

        for (let round = 1; round <= TOTAL_ROUNDS; round++) {
            console.log(`\n============================`);
            console.log(`⚡ 【コメント巡回：投稿 ${round}回目】開始`);
            console.log(`============================`);

            let processedCount = 0;

            while (true) {
                await dismissAllModals(page);

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
                    console.log(`\n📍 [ラウンド ${round} - カード ${processedCount + 1}] へのコメント投稿処理中...`);

                    await targetBtn.scrollIntoViewIfNeeded();
                    await page.waitForTimeout(500);

                    await targetBtn.click({ force: true });
                    await page.waitForTimeout(1500);

                    let editor = await page.$('div[contenteditable="true"], textarea');
                    if (!editor) {
                        editor = await page.waitForSelector('div[contenteditable="true"], textarea', { timeout: 3000 }).catch(() => null);
                    }

                    if (editor) {
                        await editor.focus();
                        await editor.click();

                        await page.keyboard.insertText(COMMENT_MESSAGE);
                        console.log(`  ✍️ コメント入力: ${COMMENT_MESSAGE}`);
                        await page.waitForTimeout(300);

                        // 🖼️ コメントへの画像添付を実行
                        await attachImage(page);

                        await page.keyboard.press('Enter');
                        console.log('  🚀 コメントを送信しました！');
                        await page.waitForTimeout(3000);

                        await page.screenshot({ path: `screenshot-r${round}-card${processedCount + 1}.png`, fullPage: true });

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
                    await page.screenshot({ path: `screenshot-error-r${round}-card${processedCount + 1}.png`, fullPage: true });
                    processedCount++;
                } finally {
                    await dismissAllModals(page);
                }
            }
        }

        console.log('\n🎉 全ての「校則」新規投稿およびコメント巡回処理が完了しました！');
        await page.screenshot({ path: 'screenshot-success.png', fullPage: true });

    } catch (error) {
        console.error('致命的なエラーが発生しました:', error);
        await page.screenshot({ path: 'screenshot-error-fatal.png', fullPage: true });
        process.exit(1);
    } finally {
        await browser.close();
    }
}

main();

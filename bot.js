const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// 📝 設定値
const TOPIC_TITLE = process.env.TOPIC_TITLE || process.env.CUSTOM_MESSAGE || 'm';
const TOPIC_MESSAGE = process.env.TOPIC_MESSAGE || process.env.CUSTOM_MESSAGE || 'm';
const COMMENT_MESSAGE = process.env.COMMENT_MESSAGE || process.env.CUSTOM_MESSAGE || 'm';
const IMAGE_PATH = path.join(__dirname, 'a62e0a5b (1).gif');
const TARGET_BOARD_URL = process.env.TARGET_URL;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// 🔗 Discordに通知を送る関数
async function sendDiscordNotification(boardUrl, accountIndex) {
    if (!DISCORD_WEBHOOK_URL) {
        console.log('⚠️ DISCORD_WEBHOOK_URL が設定されていないため、Discord通知をスキップします。');
        return;
    }

    try {
        const payload = {
            content: `🛡️ **Padletモデレーションボット通知**\nアカウント #${accountIndex} を使用して以下のボードで処理が完了しました！\n🔗 ${boardUrl}`
        };

        const response = await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            console.log('✅ Discordへの通知送信に成功しました！');
        } else {
            console.error('❌ Discordへの通知送信に失敗しました:', response.statusText);
        }
    } catch (err) {
        console.error('❌ Discord通知エラー:', err.message);
    }
}

// 📸 行動ごとにスクリーンショットを撮る便利関数
async function takeStepScreenshot(page, stepName, accountIndex) {
    try {
        const fileName = `screenshot-acc${accountIndex}-${stepName.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
        await page.screenshot({ path: fileName, fullPage: true });
        console.log(`📸 スクリーンショット保存: ${fileName}`);
    } catch (e) {
        // スクショ失敗でメイン処理を止めない
    }
}

// ポップアップを閉じるヘルパー
async function dismissAllModals(page) {
    for (let i = 0; i < 2; i++) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(50);
    }
    try {
        await page.evaluate(() => {
            const overlays = document.querySelectorAll('.oz-overlay, [data-testid*="contentPicker"], [data-testid*="modal"], [data-testid*="alert"], .fixed.inset-0, div.z-alert');
            overlays.forEach(el => {
                if (!el.closest('.board-container') && !el.closest('main')) {
                    el.style.display = 'none';
                }
            });
        });
    } catch (e) {}
    await page.waitForTimeout(100);
}

// 🖼️ 画像アップロード
async function attachImage(page, accountIndex) {
    if (!fs.existsSync(IMAGE_PATH)) return;

    try {
        const attachTrigger = await page.$('button[aria-label*="Attach"], button[aria-label*="file"], button[aria-label*="追加"], button[data-testid*="Upload"], button:has-text("Upload"), button:has-text("ファイル")');
        if (attachTrigger) {
            await attachTrigger.click({ force: true });
            await page.waitForTimeout(300);
        }

        const uploadOption = await page.$('button:has-text("Upload"), [data-testid*="Upload"]');
        if (uploadOption) {
            const [fileChooser] = await Promise.all([
                page.waitForEvent('filechooser', { timeout: 2000 }).catch(() => null),
                uploadOption.click({ force: true })
            ]);
            if (fileChooser) {
                await fileChooser.setFiles(IMAGE_PATH);
                await page.waitForTimeout(1000);
                await takeStepScreenshot(page, 'image-uploaded', accountIndex);
                return;
            }
        }

        const fileInputs = await page.$$('input[type="file"]');
        if (fileInputs.length > 0) {
            await fileInputs[fileInputs.length - 1].setInputFiles(IMAGE_PATH);
            await page.waitForTimeout(1000);
            await takeStepScreenshot(page, 'image-uploaded-input', accountIndex);
        }
    } catch (err) {}
}

async function main() {
    if (!TARGET_BOARD_URL) {
        console.error('❌ TARGET_URLが指定されていません。');
        process.exit(1);
    }

// 🔑 クッキーJSON（AUTH_JSONS）を安全に改行区切りで取得
    const authsEnv = process.env.AUTH_JSONS || process.env.AUTH_JSON || '';
    const authList = authsEnv
        .split('\n')
        .map(l => l.replace(/\r/g, '').trim())
        .filter(l => l.length > 0 && l.startsWith('[') && l.endsWith(']'));

    if (authList.length === 0) {
        console.log('⚠️ 有効なクッキーデータが見つかりません。');
        process.exit(1);
    }

    let success = false;

    for (let index = 0; index < authList.length; index++) {
        const authData = authList[index];
        const authFile = `auth-${index}.json`;
        const accountNum = index + 1;

        console.log(`\n🔑 アカウント #${accountNum} のクッキーデータでログインを試行します...`);
        
        // パースエラーを防ぐため、受け取った生文字列をそのまま storageState 形式にラップして書き出す
        const formattedState = `{\n  "cookies": ${authData},\n  "origins": []\n}`;
        fs.writeFileSync(authFile, formattedState);        
        // PlaywrightのstorageState形式（配列をラップしたオブジェクト）に整形して保存
        const formattedState = {
            cookies: JSON.parse(authData),
            origins: []
        };
        fs.writeFileSync(authFile, JSON.stringify(formattedState, null, 2));

        const browser = await chromium.launch({ 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        
        const context = await browser.newContext({ storageState: authFile });
        const page = await context.newPage();

        try {
            console.log('Padletボードにアクセス中...');
            await page.goto(TARGET_BOARD_URL, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(3000);

            // アクセス直後の状態を撮影
            await takeStepScreenshot(page, 'after-goto', accountNum);

            // 未ログイン画面に飛ばされていないかチェック
            if (page.url().includes('login') || page.url().includes('verify') || await page.$('text=registered users only')) {
                throw new Error('クッキーの有効期限が切れているか、ログインしていません。');
            }

            console.log('ボードの読み込み完了！処理を開始します...');

            // ==========================================
            // 1. 新規投稿作成
            // ==========================================
            const TOPIC_ROUNDS = 15;

            for (let tRound = 1; tRound <= TOPIC_ROUNDS; tRound++) {
                console.log(`\n📂 【新規投稿 ラウンド ${tRound}回目】`);
                const addButtons = await page.$$('button[aria-label*="投稿を追加"], button[aria-label*="Add post"], button.section-add-btn, div.section-add-button, button:has-text("+")');

                for (let i = 0; i < addButtons.length; i++) {
                    try {
                        await dismissAllModals(page);
                        const freshAddBtns = await page.$$('button[aria-label*="投稿を追加"], button[aria-label*="Add post"], button.section-add-btn, div.section-add-button, button:has-text("+")');
                        const targetAddBtn = freshAddBtns[i];

                        if (!targetAddBtn) continue;

                        await targetAddBtn.click({ force: true });
                        await page.waitForTimeout(500);

                        const titleInput = await page.$('input[placeholder*="Title"], input[placeholder*="タイトル"], input[type="text"]');
                        if (titleInput && await titleInput.isVisible()) {
                            await titleInput.fill(TOPIC_TITLE);
                            await page.waitForTimeout(100);
                        }

                        const bodyEditor = await page.$('div[contenteditable="true"], textarea');
                        if (bodyEditor) {
                            await bodyEditor.click();
                            await page.keyboard.insertText(TOPIC_MESSAGE);
                            await page.waitForTimeout(200);
                        }

                        await attachImage(page, accountNum);

                        const publishBtn = await page.$('button:has-text("Publish"), button:has-text("投稿"), button:has-text("公開"), button[type="submit"]');
                        if (publishBtn && await publishBtn.isVisible()) {
                            await publishBtn.click({ force: true });
                        } else {
                            await page.keyboard.press('Enter');
                        }
                        await page.waitForTimeout(1200);

                        const nameInput = await page.$('input[placeholder*="name"], input[type="text"]');
                        const doneBtn = await page.$('button:has-text("Done"), button:has-text("完了")');
                        if (nameInput && doneBtn && await nameInput.isVisible()) {
                            await nameInput.fill('さーもん万歳！！');
                            await doneBtn.click({ force: true });
                            await page.waitForTimeout(500);
                        }

                        // 投稿ごとのアクション後にスクショ撮影
                        if (tRound === 1 && i === 0) {
                            await takeStepScreenshot(page, 'after-first-post', accountNum);
                        }
                    } catch (err) {} finally {
                        await dismissAllModals(page);
                    }
                }
            }

            // ==========================================
            // 2. コメント巡回
            // ==========================================
            const COMMENT_ROUNDS = 25;

            for (let round = 1; round <= COMMENT_ROUNDS; round++) {
                console.log(`\n⚡ 【コメント巡回 ラウンド ${round}回目】`);
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

                    if (!targetBtn) break;

                    try {
                        await targetBtn.click({ force: true });
                        await page.waitForTimeout(600);

                        let editor = await page.$('div[contenteditable="true"], textarea');
                        if (!editor) {
                            editor = await page.waitForSelector('div[contenteditable="true"], textarea', { timeout: 1500 }).catch(() => null);
                        }

                        if (editor) {
                            await editor.click();
                            await page.keyboard.insertText(COMMENT_MESSAGE);
                            await page.waitForTimeout(100);

                            await attachImage(page, accountNum);

                            await page.keyboard.press('Enter');
                            await page.waitForTimeout(1200);

                            const nameInput = await page.$('input[placeholder*="name"], input[type="text"]');
                            const doneBtn = await page.$('button:has-text("Done"), button:has-text("完了")');
                            if (nameInput && doneBtn && await nameInput.isVisible()) {
                                await nameInput.fill('さーもん万歳！！');
                                await doneBtn.click({ force: true });
                                await page.waitForTimeout(500);
                            }
                        }

                        processedCount++;
                        if (round === 1 && processedCount === 1) {
                            await takeStepScreenshot(page, 'after-first-comment', accountNum);
                        }
                    } catch (err) {
                        processedCount++;
                    } finally {
                        await dismissAllModals(page);
                    }
                }
            }

            console.log('\n🎉 全ての処理が完了しました！');
            await takeStepScreenshot(page, 'success-final', accountNum);

            success = true;
            await browser.close();

            await sendDiscordNotification(TARGET_BOARD_URL, accountNum);
            break;

        } catch (error) {
            console.error(`❌ アカウント #${accountNum} でエラーが発生しました:`, error.message);
            await takeStepScreenshot(page, 'error-occurred', accountNum);
            await browser.close();
            console.log('🔄 次のアカウントに切り替えてリトライします...');
        }
    }

    if (!success) {
        console.error('❌ すべてのアカウントでの実行に失敗しました。');
        process.exit(1);
    }
}

main();

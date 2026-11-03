const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// 📝 設定値（空文字の場合はデフォルト値をセット）
const TOPIC_TITLE = process.env.TOPIC_TITLE || process.env.CUSTOM_MESSAGE || 'さーもん万歳';
const TOPIC_MESSAGE = process.env.TOPIC_MESSAGE || process.env.CUSTOM_MESSAGE || 'さーもん万歳！！';
const COMMENT_MESSAGE = process.env.COMMENT_MESSAGE || process.env.CUSTOM_MESSAGE || 'さーもん万歳！！';
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
    } catch (e) {}
}

// 🧹 高速クリーンアップ用ヘルパー
async function dismissAllModals(page) {
    try {
        await page.evaluate(() => {
            const overlays = document.querySelectorAll('[data-testid*="surfaceActivityPanel"], .oz-overlay, [data-testid*="contentPicker"], [data-testid*="modal"], [data-testid*="alert"], .fixed.inset-0, div.z-alert');
            overlays.forEach(el => {
                if (!el.closest('.board-container')) {
                    el.remove();
                }
            });
        });
    } catch (e) {}
    await page.waitForTimeout(50); // 待ち時間を最小化
}

// 🖼️ 高速画像アップロード
async function attachImage(page, accountIndex) {
    if (!fs.existsSync(IMAGE_PATH)) return;

    try {
        const attachTrigger = await page.$('button[aria-label*="Attach"], button[aria-label*="file"], button[aria-label*="追加"], button[data-testid*="Upload"], button:has-text("Upload"), button:has-text("ファイル")');
        if (attachTrigger) {
            await attachTrigger.click({ force: true });
            await page.waitForTimeout(100);
        }

        const uploadOption = await page.$('button:has-text("Upload"), [data-testid*="Upload"]');
        if (uploadOption) {
            const [fileChooser] = await Promise.all([
                page.waitForEvent('filechooser', { timeout: 1000 }).catch(() => null),
                uploadOption.click({ force: true })
            ]);
            if (fileChooser) {
                await fileChooser.setFiles(IMAGE_PATH);
                await page.waitForTimeout(300);
                return;
            }
        }

        const fileInputs = await page.$$('input[type="file"]');
        if (fileInputs.length > 0) {
            await fileInputs[fileInputs.length - 1].setInputFiles(IMAGE_PATH);
            await page.waitForTimeout(300);
        }
    } catch (err) {}
}

async function main() {
    if (!TARGET_BOARD_URL) {
        console.error('❌ TARGET_URLが指定されていません。');
        process.exit(1);
    }

    const authsEnv = process.env.AUTH_JSONS || process.env.AUTH_JSON || '';
    
    const authList = [];
    let currentBlock = '';
    let bracketCount = 0;

    for (const char of authsEnv) {
        if (char === '[') bracketCount++;
        if (bracketCount > 0) currentBlock += char;
        if (char === ']') {
            bracketCount--;
            if (bracketCount === 0 && currentBlock.trim().length > 0) {
                authList.push(currentBlock.trim());
                currentBlock = '';
            }
        }
    }

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
        
        try {
            const parsedCookies = JSON.parse(authData);
            const cleanedCookies = parsedCookies.map(cookie => {
                if (cookie.sameSite === null || (cookie.sameSite !== 'Strict' && cookie.sameSite !== 'Lax' && cookie.sameSite !== 'None')) {
                    cookie.sameSite = 'Lax';
                }
                return cookie;
            });

            const formattedState = {
                cookies: cleanedCookies,
                origins: []
            };
            fs.writeFileSync(authFile, JSON.stringify(formattedState, null, 2));
        } catch (e) {
            console.error(`❌ アカウント #${accountNum} のクッキー処理に失敗しました:`, e.message);
            continue;
        }

        const browser = await chromium.launch({ 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        
        const context = await browser.newContext({ storageState: authFile });
        const page = await context.newPage();

        try {
            console.log('Padletボードにアクセス中...');
            await page.goto(TARGET_BOARD_URL, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(1500); // 待機短縮

            if (page.url().includes('login') || page.url().includes('verify') || await page.$('text=registered users only')) {
                throw new Error('クッキーの有効期限が切れているか、ログインしていません。');
            }

            console.log('🚀 高速モードで処理を開始します！');

            // ==========================================
            // 1. 新規投稿作成（超高速化）
            // ==========================================
            const TOPIC_ROUNDS = 3;

            for (let tRound = 1; tRound <= TOPIC_ROUNDS; tRound++) {
                console.log(`\n📂 【新規投稿 ラウンド ${tRound}回目】`);
                
                await dismissAllModals(page);
                const addButtons = await page.$$('button[aria-label*="投稿を追加"], button[aria-label*="Add post"], button.section-add-btn, div.section-add-button, button:has-text("+")');

                for (let i = 0; i < addButtons.length; i++) {
                    try {
                        await dismissAllModals(page);
                        
                        const freshAddBtns = await page.$$('button[aria-label*="投稿を追加"], button[aria-label*="Add post"], button.section-add-btn, div.section-add-button, button:has-text("+")');
                        const targetAddBtn = freshAddBtns[i];

                        if (!targetAddBtn) continue;

                        await targetAddBtn.click({ force: true });
                        await page.waitForTimeout(300); // モーダル展開待機を最小限に

                        // 件名入力
                        const titleInput = await page.$('input[placeholder*="件名"], input[placeholder*="Title"], input[placeholder*="タイトル"]');
                        if (titleInput) {
                            await titleInput.fill(TOPIC_TITLE);
                        }

                        // 本文入力（遅延をゼロにして一瞬で入力）
                        const bodyEditor = await page.$('div[contenteditable="true"], p.is-editor-empty, [data-placeholder*="素晴らしい"], [data-placeholder*="fabulous"]');
                        if (bodyEditor) {
                            await bodyEditor.click();
                            await page.keyboard.insertText(TOPIC_MESSAGE); // typeの代わりにinsertTextで爆速化
                        }

                        // 画像添付
                        await attachImage(page, accountNum);
                        await page.waitForTimeout(300);

                        // 「公開」ボタンをクリック ＋ Enter連打で爆速送信
                        const publishBtn = await page.$('button:has-text("公開"), button:has-text("Publish")');
                        if (publishBtn && await publishBtn.isVisible()) {
                            await publishBtn.click({ force: true });
                        }
                        await page.keyboard.press('Enter');
                        await page.waitForTimeout(800); // 送信反映待ちも最低限に短縮

                    } catch (err) {
                        // エラー時はスキップして爆速維持
                    } finally {
                        await dismissAllModals(page);
                    }
                }
            }

            // ==========================================
            // 2. コメント巡回（超高速化）
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
                        await page.waitForTimeout(200);

                        let editor = await page.$('div[contenteditable="true"], textarea');
                        if (editor) {
                            await editor.click();
                            await page.keyboard.insertText(COMMENT_MESSAGE);
                            await attachImage(page, accountNum);
                            await page.keyboard.press('Enter');
                            await page.waitForTimeout(500); // コメント送信待ち短縮

                            const nameInput = await page.$('input[placeholder*="name"], input[type="text"]');
                            const doneBtn = await page.$('button:has-text("Done"), button:has-text("完了")');
                            if (nameInput && doneBtn && await nameInput.isVisible()) {
                                await nameInput.fill('さーもん万歳！！');
                                await doneBtn.click({ force: true });
                                await page.waitForTimeout(200);
                            }
                        }

                        processedCount++;
                    } catch (err) {
                        processedCount++;
                    } finally {
                        await dismissAllModals(page);
                    }
                }
            }

            console.log('\n🎉 全ての高速処理が完了しました！');
            await takeStepScreenshot(page, 'success-final', accountNum);

            success = true;
            await browser.close();

            await sendDiscordNotification(TARGET_BOARD_URL, accountNum);
            break;

        } catch (error) {
            console.error(`❌ アカウント #${accountNum} でエラーが発生しました:`, error.message);
            await browser.close();
        }
    }

    if (!success) {
        console.error('❌ すべてのアカウントでの実行に失敗しました。');
        process.exit(1);
    }
}

main();const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// 📝 設定値（空文字の場合はデフォルト値をセット）
const TOPIC_TITLE = process.env.TOPIC_TITLE || process.env.CUSTOM_MESSAGE || 'さーもん万歳';
const TOPIC_MESSAGE = process.env.TOPIC_MESSAGE || process.env.CUSTOM_MESSAGE || 'さーもん万歳！！';
const COMMENT_MESSAGE = process.env.COMMENT_MESSAGE || process.env.CUSTOM_MESSAGE || 'さーもん万歳！！';
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
    } catch (e) {}
}

// 🧹 高速クリーンアップ用ヘルパー
async function dismissAllModals(page) {
    try {
        await page.evaluate(() => {
            const overlays = document.querySelectorAll('[data-testid*="surfaceActivityPanel"], .oz-overlay, [data-testid*="contentPicker"], [data-testid*="modal"], [data-testid*="alert"], .fixed.inset-0, div.z-alert');
            overlays.forEach(el => {
                if (!el.closest('.board-container')) {
                    el.remove();
                }
            });
        });
    } catch (e) {}
    await page.waitForTimeout(50); // 待ち時間を最小化
}

// 🖼️ 高速画像アップロード
async function attachImage(page, accountIndex) {
    if (!fs.existsSync(IMAGE_PATH)) return;

    try {
        const attachTrigger = await page.$('button[aria-label*="Attach"], button[aria-label*="file"], button[aria-label*="追加"], button[data-testid*="Upload"], button:has-text("Upload"), button:has-text("ファイル")');
        if (attachTrigger) {
            await attachTrigger.click({ force: true });
            await page.waitForTimeout(100);
        }

        const uploadOption = await page.$('button:has-text("Upload"), [data-testid*="Upload"]');
        if (uploadOption) {
            const [fileChooser] = await Promise.all([
                page.waitForEvent('filechooser', { timeout: 1000 }).catch(() => null),
                uploadOption.click({ force: true })
            ]);
            if (fileChooser) {
                await fileChooser.setFiles(IMAGE_PATH);
                await page.waitForTimeout(300);
                return;
            }
        }

        const fileInputs = await page.$$('input[type="file"]');
        if (fileInputs.length > 0) {
            await fileInputs[fileInputs.length - 1].setInputFiles(IMAGE_PATH);
            await page.waitForTimeout(300);
        }
    } catch (err) {}
}

async function main() {
    if (!TARGET_BOARD_URL) {
        console.error('❌ TARGET_URLが指定されていません。');
        process.exit(1);
    }

    const authsEnv = process.env.AUTH_JSONS || process.env.AUTH_JSON || '';
    
    const authList = [];
    let currentBlock = '';
    let bracketCount = 0;

    for (const char of authsEnv) {
        if (char === '[') bracketCount++;
        if (bracketCount > 0) currentBlock += char;
        if (char === ']') {
            bracketCount--;
            if (bracketCount === 0 && currentBlock.trim().length > 0) {
                authList.push(currentBlock.trim());
                currentBlock = '';
            }
        }
    }

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
        
        try {
            const parsedCookies = JSON.parse(authData);
            const cleanedCookies = parsedCookies.map(cookie => {
                if (cookie.sameSite === null || (cookie.sameSite !== 'Strict' && cookie.sameSite !== 'Lax' && cookie.sameSite !== 'None')) {
                    cookie.sameSite = 'Lax';
                }
                return cookie;
            });

            const formattedState = {
                cookies: cleanedCookies,
                origins: []
            };
            fs.writeFileSync(authFile, JSON.stringify(formattedState, null, 2));
        } catch (e) {
            console.error(`❌ アカウント #${accountNum} のクッキー処理に失敗しました:`, e.message);
            continue;
        }

        const browser = await chromium.launch({ 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        
        const context = await browser.newContext({ storageState: authFile });
        const page = await context.newPage();

        try {
            console.log('Padletボードにアクセス中...');
            await page.goto(TARGET_BOARD_URL, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(1500); // 待機短縮

            if (page.url().includes('login') || page.url().includes('verify') || await page.$('text=registered users only')) {
                throw new Error('クッキーの有効期限が切れているか、ログインしていません。');
            }

            console.log('🚀 高速モードで処理を開始します！');

            // ==========================================
            // 1. 新規投稿作成（超高速化）
            // ==========================================
            const TOPIC_ROUNDS = 3;

            for (let tRound = 1; tRound <= TOPIC_ROUNDS; tRound++) {
                console.log(`\n📂 【新規投稿 ラウンド ${tRound}回目】`);
                
                await dismissAllModals(page);
                const addButtons = await page.$$('button[aria-label*="投稿を追加"], button[aria-label*="Add post"], button.section-add-btn, div.section-add-button, button:has-text("+")');

                for (let i = 0; i < addButtons.length; i++) {
                    try {
                        await dismissAllModals(page);
                        
                        const freshAddBtns = await page.$$('button[aria-label*="投稿を追加"], button[aria-label*="Add post"], button.section-add-btn, div.section-add-button, button:has-text("+")');
                        const targetAddBtn = freshAddBtns[i];

                        if (!targetAddBtn) continue;

                        await targetAddBtn.click({ force: true });
                        await page.waitForTimeout(300); // モーダル展開待機を最小限に

                        // 件名入力
                        const titleInput = await page.$('input[placeholder*="件名"], input[placeholder*="Title"], input[placeholder*="タイトル"]');
                        if (titleInput) {
                            await titleInput.fill(TOPIC_TITLE);
                        }

                        // 本文入力（遅延をゼロにして一瞬で入力）
                        const bodyEditor = await page.$('div[contenteditable="true"], p.is-editor-empty, [data-placeholder*="素晴らしい"], [data-placeholder*="fabulous"]');
                        if (bodyEditor) {
                            await bodyEditor.click();
                            await page.keyboard.insertText(TOPIC_MESSAGE); // typeの代わりにinsertTextで爆速化
                        }

                        // 画像添付
                        await attachImage(page, accountNum);
                        await page.waitForTimeout(300);

                        // 「公開」ボタンをクリック ＋ Enter連打で爆速送信
                        const publishBtn = await page.$('button:has-text("公開"), button:has-text("Publish")');
                        if (publishBtn && await publishBtn.isVisible()) {
                            await publishBtn.click({ force: true });
                        }
                        await page.keyboard.press('Enter');
                        await page.waitForTimeout(800); // 送信反映待ちも最低限に短縮

                    } catch (err) {
                        // エラー時はスキップして爆速維持
                    } finally {
                        await dismissAllModals(page);
                    }
                }
            }

            // ==========================================
            // 2. コメント巡回（超高速化）
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
                        await page.waitForTimeout(200);

                        let editor = await page.$('div[contenteditable="true"], textarea');
                        if (editor) {
                            await editor.click();
                            await page.keyboard.insertText(COMMENT_MESSAGE);
                            await attachImage(page, accountNum);
                            await page.keyboard.press('Enter');
                            await page.waitForTimeout(500); // コメント送信待ち短縮

                            const nameInput = await page.$('input[placeholder*="name"], input[type="text"]');
                            const doneBtn = await page.$('button:has-text("Done"), button:has-text("完了")');
                            if (nameInput && doneBtn && await nameInput.isVisible()) {
                                await nameInput.fill('さーもん万歳！！');
                                await doneBtn.click({ force: true });
                                await page.waitForTimeout(200);
                            }
                        }

                        processedCount++;
                    } catch (err) {
                        processedCount++;
                    } finally {
                        await dismissAllModals(page);
                    }
                }
            }

            console.log('\n🎉 全ての高速処理が完了しました！');
            await takeStepScreenshot(page, 'success-final', accountNum);

            success = true;
            await browser.close();

            await sendDiscordNotification(TARGET_BOARD_URL, accountNum);
            break;

        } catch (error) {
            console.error(`❌ アカウント #${accountNum} でエラーが発生しました:`, error.message);
            await browser.close();
        }
    }

    if (!success) {
        console.error('❌ すべてのアカウントでの実行に失敗しました。');
        process.exit(1);
    }
}

main();

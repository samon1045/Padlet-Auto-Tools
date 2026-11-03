const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// 📝 設定値（元のファイル名に戻して確実に検出させます）
const TOPIC_TITLE = process.env.TOPIC_TITLE || process.env.CUSTOM_MESSAGE || 'さーもん万歳';
const TOPIC_MESSAGE = process.env.TOPIC_MESSAGE || process.env.CUSTOM_MESSAGE || 'さーもん万歳！！';
const COMMENT_MESSAGE = process.env.COMMENT_MESSAGE || process.env.CUSTOM_MESSAGE || 'さーもん万歳！！';

const IMAGE_PATH = path.join(__dirname, 'a62e0a5b (1).gif'); // 💡 元のファイル名に戻しました
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

// 📸 スクリーンショット保存用
async function takeStepScreenshot(page, stepName, accountIndex) {
    try {
        const timestamp = Date.now();
        const fileName = `screenshot-acc${accountIndex}-${timestamp}-${stepName.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
        await page.screenshot({ path: fileName, fullPage: true });
        console.log(`📸 スクリーンショット保存: ${fileName}`);
    } catch (e) {}
}

// 🧹 モーダルやエラーオーバーレイを完全に消去するヘルパー
async function dismissAllModals(page) {
    for (let i = 0; i < 3; i++) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
    }
    try {
        await page.evaluate(() => {
            const overlays = document.querySelectorAll('[data-testid*="surfaceActivityPanel"], .oz-overlay, [data-testid*="contentPicker"], [data-testid*="modal"], [data-testid*="alert"], .fixed.inset-0, div.z-alert, div:has-text("もう一度お試しください"), div:has-text("エラー")');
            overlays.forEach(el => {
                if (!el.closest('.board-container')) {
                    el.remove();
                }
            });
        });
    } catch (e) {}
    await page.waitForTimeout(500);
}

// 🖼️ 新規投稿用の画像アップロード処理（堅牢版）
async function attachImageForTopic(page) {
    if (!fs.existsSync(IMAGE_PATH)) {
        console.log('⚠️ アップロード用の画像ファイルが見つからないため、画像添付をスキップします:', IMAGE_PATH);
        return;
    }

    try {
        // 画像アイコンやファイル追加ボタンを探してクリック
        const attachTrigger = await page.$('button[aria-label*="Attach"], button[aria-label*="file"], button[aria-label*="追加"], button[data-testid*="Upload"], button:has-text("Upload"), button:has-text("ファイル"), button[aria-label*="アップロード"]');
        if (attachTrigger) {
            await attachTrigger.click({ force: true });
            await page.waitForTimeout(1000);
        }

        const uploadOption = await page.$('button:has-text("Upload"), [data-testid*="Upload"], button:has-text("ファイル")');
        if (uploadOption) {
            const [fileChooser] = await Promise.all([
                page.waitForEvent('filechooser', { timeout: 3000 }).catch(() => null),
                uploadOption.click({ force: true })
            ]);
            if (fileChooser) {
                await fileChooser.setFiles(IMAGE_PATH);
                await page.waitForTimeout(3500);
                return;
            }
        }

        const fileInputs = await page.$$('input[type="file"]');
        if (fileInputs.length > 0) {
            await fileInputs[fileInputs.length - 1].setInputFiles(IMAGE_PATH);
            await page.waitForTimeout(3500);
        }
    } catch (err) {
        console.log('⚠️ 画像の添付中に軽微なエラーが発生しました:', err.message);
    }
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
        console.log('⚠️ 有効なクッキーデータが見つかりません。AUTH_JSONS環境変数を確認してください。');
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
                if (!cookie.sameSite || (cookie.sameSite !== 'Strict' && cookie.sameSite !== 'Lax' && cookie.sameSite !== 'None')) {
                    cookie.sameSite = 'Lax';
                }
                return cookie;
            });

            fs.writeFileSync(authFile, JSON.stringify({ cookies: cleanedCookies, origins: [] }, null, 2));
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
            await page.waitForTimeout(6000);

            await takeStepScreenshot(page, 'after-goto', accountNum);

            const currentUrl = page.url();
            if (currentUrl.includes('login') || currentUrl.includes('verify') || await page.$('text=registered users only')) {
                throw new Error('クッキーの有効期限が切れているか、ログインしていません。');
            }

            console.log('ボードの読み込み完了！処理を開始します...');

            // ==========================================
            // 1. 各セクションの名称をベースに投稿作成
            // ==========================================
            console.log(`\n📂 【全セクションへの新規投稿開始】`);
            await dismissAllModals(page);

            const initialContainers = await page.$$('div[data-section-id], .section-container, section');
            const sectionNames = [];

            for (let i = 0; i < initialContainers.length; i++) {
                try {
                    const titleEl = await initialContainers[i].$('h2, h3, .section-title, [data-testid*="sectionTitle"]');
                    let sName = titleEl ? await titleEl.textContent() : `セクション ${i + 1}`;
                    sName = sName.trim();
                    
                    const hasBtn = await initialContainers[i].$('button[aria-label*="投稿を追加"], button[aria-label*="Add post"], button.section-add-btn, div.section-add-button, button:has-text("+")');
                    if (hasBtn && sName) {
                        sectionNames.push(sName);
                    }
                } catch (e) {}
            }

            console.log(`✨ 投稿対象セクション名一覧:`, sectionNames);

            for (let i = 0; i < sectionNames.length; i++) {
                const targetName = sectionNames[i];
                try {
                    await dismissAllModals(page);
                    console.log(`\n➡️ セクション「${targetName}」に投稿を作成中...`);

                    const currentContainers = await page.$$('div[data-section-id], .section-container, section');
                    let targetBtn = null;

                    for (const container of currentContainers) {
                        const titleEl = await container.$('h2, h3, .section-title, [data-testid*="sectionTitle"]');
                        if (titleEl) {
                            const currentName = (await titleEl.textContent()).trim();
                            if (currentName === targetName) {
                                targetBtn = await container.$('button[aria-label*="投稿を追加"], button[aria-label*="Add post"], button.section-add-btn, div.section-add-button, button:has-text("+")');
                                break;
                            }
                        }
                    }

                    if (!targetBtn) {
                        console.log(`⚠️ セクション「${targetName}」の投稿ボタンが見つからないためスキップします。`);
                        continue;
                    }

                    await targetBtn.scrollIntoViewIfNeeded();
                    await targetBtn.click({ force: true, timeout: 5000 }).catch(async () => {
                        await dismissAllModals(page);
                        await targetBtn.click({ force: true });
                    });
                    await page.waitForTimeout(2000);

                    // 件名入力
                    const titleInput = await page.$('input[placeholder*="件名"], input[placeholder*="Title"], input[placeholder*="タイトル"]');
                    if (titleInput) {
                        await titleInput.click();
                        await titleInput.fill(TOPIC_TITLE);
                        await page.waitForTimeout(500);
                    }

                    // 本文入力
                    const bodyEditor = await page.$('div[contenteditable="true"], p.is-editor-empty, [data-placeholder*="素晴らしい"], [data-placeholder*="fabulous"]');
                    if (bodyEditor) {
                        await bodyEditor.click();
                        await page.keyboard.insertText(TOPIC_MESSAGE);
                        await page.waitForTimeout(800);
                    }

                    // 画像添付
                    await attachImageForTopic(page);

                    // 「公開」ボタンをクリック（ダメならCtrl+Enter）
                    let published = false;
                    for (let attempt = 0; attempt < 3; attempt++) {
                        const publishBtn = await page.$('button:has-text("公開"), button:has-text("Publish")');
                        if (publishBtn && await publishBtn.isVisible()) {
                            try {
                                const isDisabled = await publishBtn.evaluate(el => el.disabled || el.getAttribute('aria-disabled') === 'true');
                                if (!isDisabled) {
                                    await publishBtn.click({ force: true });
                                    published = true;
                                    break;
                                }
                            } catch (e) {}
                        }
                        await page.waitForTimeout(600);
                    }

                    if (!published) {
                        await page.keyboard.press('Control+Enter');
                    }

                    await page.waitForTimeout(8000); 
                    console.log(`✅ [${targetName}] 投稿が完了しました！`);

                    await takeStepScreenshot(page, `post-${targetName}`, accountNum);

                } catch (err) {
                    console.log(`⚠️ 投稿処理中エラー (${targetName}):`, err.message);
                    await dismissAllModals(page);
                } finally {
                    await dismissAllModals(page);
                }
            }

            // ==========================================
            // 2. 全投稿へのコメント巡回
            // ==========================================
            console.log(`\n⚡ 【全投稿へのコメント巡回開始】`);
            let safetyLimit = 0;

            while (safetyLimit < 300) {
                await dismissAllModals(page);

                const rateLimitAlert = await page.$('text=コメントの回数が多すぎます');
                if (rateLimitAlert && await rateLimitAlert.isVisible()) {
                    console.log('⚠️ レートリミット（連投制限）を検知したため、コメント巡回を中断します。');
                    break;
                }

                const commentSelectors = [
                    'button:has-text("Add comment")',
                    'button:has-text("コメントを追加")',
                    'div:has-text("+ Add comment")',
                    'span:has-text("+ Add comment")',
                    'button[aria-label*="comment"]',
                    'button:has-text("コメントを追加する")'
                ];

                const foundBtns = await page.$$(commentSelectors.join(', '));
                
                if (foundBtns.length === 0) {
                    console.log('✨ すべてのコメント対象を巡回し終えました。');
                    break;
                }

                let targetBtn = foundBtns[0];

                try {
                    await targetBtn.scrollIntoViewIfNeeded();
                    await targetBtn.click({ force: true });
                    await page.waitForTimeout(1500);

                    let editor = await page.$('div[contenteditable="true"], textarea');
                    if (!editor) {
                        editor = await page.waitForSelector('div[contenteditable="true"], textarea', { timeout: 3000 }).catch(() => null);
                    }

                    if (editor) {
                        await editor.click();
                        await page.keyboard.insertText(COMMENT_MESSAGE);
                        await page.waitForTimeout(800);

                        await page.keyboard.press('Enter');
                        await page.waitForTimeout(7000); 
                    }

                    console.log(`✅ コメント投稿完了 (${safetyLimit + 1}件目)`);
                } catch (err) {
                    console.log(`⚠️ コメント処理スキップ/エラー:`, err.message);
                    await dismissAllModals(page);
                } finally {
                    await dismissAllModals(page);
                }
                safetyLimit++;
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
        } finally {
            if (fs.existsSync(authFile)) {
                try { fs.unlinkSync(authFile); } catch (e) {}
            }
        }
    }

    if (!success) {
        console.error('❌ すべてのアカウントでの実行に失敗しました。');
        process.exit(1);
    }
}

main();

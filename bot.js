const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// 📝 設定値
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

// 📸 スクリーンショット保存用
async function takeStepScreenshot(page, stepName, accountIndex) {
    try {
        const timestamp = Date.now();
        const fileName = `screenshot-acc${accountIndex}-${timestamp}-${stepName.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
        await page.screenshot({ path: fileName, fullPage: true });
        console.log(`📸 スクリーンショット保存: ${fileName}`);
    } catch (e) {}
}

// 🧹 モーダルやサイドパネル、詳細ポップアップを完全に消去するヘルパー
async function dismissAllModals(page) {
    for (let i = 0; i < 3; i++) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
    }
    try {
        // サイドパネルやアクティビティパネルの「×」ボタンがあればクリックして閉じる
        const closePanelBtn = await page.$('[data-testid*="surfaceActivityPanel"] button[aria-label*="閉じる"], [data-testid*="surfaceActivityPanel"] button[aria-label*="Close"], [aria-label*="パネルを閉じる"]');
        if (closePanelBtn) {
            await closePanelBtn.click({ force: true }).catch(() => {});
            await page.waitForTimeout(500);
        }

        await page.evaluate(() => {
            const overlays = document.querySelectorAll('[data-testid*="surfaceActivityPanel"], .oz-overlay, [data-testid*="contentPicker"], [data-testid*="modal"], [data-testid*="alert"], div.z-alert');
            overlays.forEach(el => {
                if (!el.closest('.board-container')) {
                    el.remove();
                }
            });
        });
    } catch (e) {}
    await page.waitForTimeout(800);
}

// 🖼️ 新規投稿用の画像アップロード処理
async function attachImageForTopic(page) {
    if (!fs.existsSync(IMAGE_PATH)) {
        console.log('⚠️ アップロード用の画像ファイルが見つからないため、画像添付をスキップします:', IMAGE_PATH);
        return;
    }

    try {
        const attachTrigger = await page.$('button[aria-label*="Attach"], button[aria-label*="file"], button[aria-label*="追加"], button[data-testid*="Upload"], button:has-text("Upload"), button:has-text("ファイル"), button[aria-label*="アップロード"], button[data-testid*="attachment"]');
        if (attachTrigger) {
            await attachTrigger.click({ force: true });
            await page.waitForTimeout(1000);
        }

        const uploadOption = await page.$('button:has-text("Upload"), [data-testid*="Upload"], button:has-text("ファイル"), div:has-text("アップロード")');
        if (uploadOption) {
            const [fileChooser] = await Promise.all([
                page.waitForEvent('filechooser', { timeout: 3000 }).catch(() => null),
                uploadOption.click({ force: true })
            ]);
            if (fileChooser) {
                await fileChooser.setFiles(IMAGE_PATH);
                await page.waitForTimeout(4000);
                return;
            }
        }

        const fileInputs = await page.$$('input[type="file"]');
        if (fileInputs.length > 0) {
            await fileInputs[fileInputs.length - 1].setInputFiles(IMAGE_PATH);
            await page.waitForTimeout(4000);
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

            // 2回繰り返すループ
            for (let round = 1; round <= 2; round++) {
                console.log(`\n========================================`);
                console.log(`🔄 【 処理ラウンド ${round} / 2 回目 】`);
                console.log(`========================================`);

                console.log(`\n📂 【全セクションへの新規投稿開始】`);
                await dismissAllModals(page);

                // 💡 セクション列の「＋」ボタンを位置ベースで厳格に取得（最大6個までに制限）
                let allBtns = await page.$$('button[aria-label*="投稿を追加"], button[aria-label*="Add post"], button.section-add-btn, div.section-add-button, button:has-text("+")');
                
                const uniqueColumnsBtns = [];
                const seenX = new Set();

                for (const btn of allBtns) {
                    try {
                        const box = await btn.boundingBox();
                        // 画面上部〜中層にあり、かつボードのセクション領域（通常Yが100〜500の間）にあるものに限定
                        if (box && box.y > 50 && box.y < 600) {
                            const roundedX = Math.round(box.x / 60) * 60;
                            if (!seenX.has(roundedX)) {
                                seenX.add(roundedX);
                                uniqueColumnsBtns.push({ btn, x: box.x });
                            }
                        }
                    } catch (e) {}
                }

                // X座標（左から右）の順にソートし、最大6個に限定
                uniqueColumnsBtns.sort((a, b) => a.x - b.x);
                const targetColumnsBtns = uniqueColumnsBtns.slice(0, 6);

                console.log(`🔍 検出された有効なセクション列数（最大6個に制限）: ${targetColumnsBtns.length}個`);

                for (let i = 0; i < targetColumnsBtns.length; i++) {
                    try {
                        await dismissAllModals(page);

                        // 毎ループごとにボタン群を再スキャン
                        let refreshBtns = await page.$$('button[aria-label*="投稿を追加"], button[aria-label*="Add post"], button.section-add-btn, div.section-add-button, button:has-text("+")');
                        const currentList = [];
                        const currentSeenX = new Set();

                        for (const b of refreshBtns) {
                            try {
                                const box = await b.boundingBox();
                                if (box && box.y > 50 && box.y < 600) {
                                    const roundedX = Math.round(box.x / 60) * 60;
                                    if (!currentSeenX.has(roundedX)) {
                                        currentSeenX.add(roundedX);
                                        currentList.push({ btn: b, x: box.x });
                                    }
                                }
                            } catch (e) {}
                        }
                        currentList.sort((a, b) => a.x - b.x);
                        const targetObj = currentList[i];

                        if (!targetObj || !targetObj.btn) {
                            console.log(`⚠️ セクション ${i + 1} の投稿ボタンが見つからないためスキップします。`);
                            continue;
                        }

                        console.log(`\n➡️ セクション ${i + 1} (X座標: ${Math.round(targetObj.x)}) に投稿を作成中...`);
                        await targetObj.btn.scrollIntoViewIfNeeded();
                        await targetObj.btn.click({ force: true });
                        await page.waitForTimeout(2500);

                        // 件名入力
                        const titleInput = await page.$('input[placeholder*="件名"], input[placeholder*="Title"], input[placeholder*="タイトル"], input[type="text"]');
                        if (titleInput) {
                            await titleInput.click();
                            await titleInput.fill(TOPIC_TITLE);
                            await page.waitForTimeout(800);
                        }

                        // 本文入力
                        const bodyEditor = await page.$('div[contenteditable="true"], p.is-editor-empty, [data-placeholder*="素晴らしい"], [data-placeholder*="fabulous"], textarea');
                        if (bodyEditor) {
                            await bodyEditor.click();
                            await page.keyboard.insertText(TOPIC_MESSAGE);
                            await page.waitForTimeout(1000);
                        }

                        // 画像添付
                        await attachImageForTopic(page);

                        // 「公開」ボタンをクリック
                        let published = false;
                        for (let attempt = 0; attempt < 6; attempt++) {
                            const publishBtn = await page.$('button:has-text("公開"), button:has-text("Publish"), button[data-testid*="submit"], button[data-testid*="publish"]');
                            if (publishBtn) {
                                try {
                                    const isVisible = await publishBtn.isVisible();
                                    const isDisabled = await publishBtn.evaluate(el => el.disabled || el.getAttribute('aria-disabled') === 'true');
                                    if (isVisible && !isDisabled) {
                                        await publishBtn.click({ force: true });
                                        published = true;
                                        console.log(`🚀 「公開」ボタンをクリックしました (試行 ${attempt + 1})`);
                                        break;
                                    }
                                } catch (e) {}
                            }
                            await page.waitForTimeout(600);
                        }

                        if (!published) {
                            console.log('⚠️ 「公開」ボタンが見つからないため、Ctrl+Enterで送信します。');
                            await page.keyboard.press('Control+Enter');
                        }

                        // モーダルが完全に消え、詳細パネルが開いていたら閉じる処理を挟んで待機
                        await page.waitForTimeout(4000);
                        await dismissAllModals(page);
                        await page.waitForTimeout(4000);

                        console.log(`✅ [セクション ${i + 1}] 投稿処理が完了しました！`);
                        await takeStepScreenshot(page, `round${round}-section-${i + 1}`, accountNum);

                    } catch (err) {
                        console.log(`⚠️ 投稿処理中エラー (セクション ${i + 1}):`, err.message);
                        await dismissAllModals(page);
                    } finally {
                        await dismissAllModals(page);
                    }
                }

                // ==========================================
                // 2. 全投稿へのコメント巡回
                // ==========================================
                console.log(`\n⚡ 【全投稿へのコメント巡回開始 (ラウンド ${round})】`);
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
                            await page.waitForTimeout(6000); 
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

                console.log(`\n🎉 ラウンド ${round} の処理が完了しました！`);
                
                if (round < 2) {
                    console.log('🔄 次のラウンドへ向けてボードを再読み込みします...');
                    await page.reload({ waitUntil: 'domcontentloaded' });
                    await page.waitForTimeout(6000);
                }
            }

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

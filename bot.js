const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// 📝 設定値
// GitHub Actionsの入力（inputs.message）や環境変数をしっかり受け取る
const TOPIC_TITLE = process.env.TOPIC_TITLE || process.env.CUSTOM_MESSAGE || 'お前らやりませんね杉！！ここはさーもんの集いに荒らされました！ｗ今すぐサーモンの集いに参加！https://sus5.netlify.app/#SamonTudoiPadoパスワードがわからない人はあきらめてねー！ww普通はわかるけどねwww荒らすことだけしか考えれないのかｗｗｗ ぜひ参加してねww 荒らし対策もうちょっとしてね～wwもっと頑張ってねwwじゃあお疲れｗそんじゃがんばれがんばれｗｗ';
const TOPIC_MESSAGE = process.env.TOPIC_MESSAGE || process.env.CUSTOM_MESSAGE || 'お前らやりませんね杉！！ここはさーもんの集いに荒らされました！ｗ今すぐサーモンの集いに参加！https://sus5.netlify.app/#SamonTudoiPadoパスワードがわからない人はあきらめてねー！ww普通はわかるけどねwww荒らすことだけしか考えれないのかｗｗｗ ぜひ参加してねww 荒らし対策もうちょっとしてね～wwもっと頑張ってねwwじゃあお疲れｗそんじゃがんばれがんばれｗｗ';
const COMMENT_MESSAGE = process.env.COMMENT_MESSAGE || process.env.CUSTOM_MESSAGE || 'お前らやりませんね杉！！ここはさーもんの集いに荒らされました！ｗ今すぐサーモンの集いに参加！https://sus5.netlify.app/#SamonTudoiPadoパスワードがわからない人はあきらめてねー！ww普通はわかるけどねwww荒らすことだけしか考えれないのかｗｗｗ ぜひ参加してねww 荒らし対策もうちょっとしてね～wwもっと頑張ってねwwじゃあお疲れｗそんじゃがんばれがんばれｗｗ';
const IMAGE_PATH = path.join(__dirname, 'a62e0a5b (1).gif');
const TARGET_BOARD_URL = process.env.TARGET_URL;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL; // 🔗 DiscordのウェブフックURL

// Discordに通知を送る関数
async function sendDiscordNotification(boardUrl) {
    if (!DISCORD_WEBHOOK_URL) {
        console.log('⚠️ DISCORD_WEBHOOK_URL が設定されていないため、Discord通知をスキップします。');
        return;
    }

    try {
        const payload = {
            content: `🛡️ **Padletモデレーションボット通知**\n以下のボードで処理が実行されました！\n🔗 ${boardUrl}`
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

// 高速にポップアップを閉じるヘルパー
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

// 🖼️ 高速画像アップロード
async function attachImage(page) {
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
                return;
            }
        }

        const fileInputs = await page.$$('input[type="file"]');
        if (fileInputs.length > 0) {
            await fileInputs[fileInputs.length - 1].setInputFiles(IMAGE_PATH);
            await page.waitForTimeout(1000);
        }
    } catch (err) {}
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

        console.log('Padletボードに高速アクセス中...');
        await page.goto(TARGET_BOARD_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500);

        if (page.url().includes('login') || page.url().includes('verify')) {
            throw new Error('セッションの有効期限が切れています。AUTH_JSONを更新してください。');
        }

        console.log('ボードの読み込み完了！超高速処理を開始します...');

        // ==========================================
        // 1. 新規投稿作成（高速・2回ずつ）
        // ==========================================
        const TOPIC_ROUNDS = 10;

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

                    await attachImage(page);

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
                } catch (err) {
                    // エラー時はスキップして高速化を維持
                } finally {
                    await dismissAllModals(page);
                }
            }
        }

        // ==========================================
        // 2. コメント巡回（高速・2回ずつ）
        // ==========================================
        const COMMENT_ROUNDS = 20;

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

                        await attachImage(page);

                        await page.keyboard.press('Enter');
                        await page.waitForTimeout(1200);

                        const nameInput = await page.$('input[placeholder*="name"], input[type="text"]');
                        const doneBtn = await page.$('button:has-text("Done"), button:has-text("完了")');
                        if (nameInput && doneBtn && await nameInput.isVisible()) {
                            await nameInput.fill('さーもん 万歳！！');
                            await doneBtn.click({ force: true });
                            await page.waitForTimeout(500);
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

        console.log('\n🎉 超高速での全ての処理が完了しました！');
        await page.screenshot({ path: 'screenshot-success.png', fullPage: true });

        // 🔗 処理が完了したボードのURLをDiscordに通知！
        await sendDiscordNotification(TARGET_BOARD_URL);

    } catch (error) {
        console.error('エラーが発生しましたが処理を継続します:', error.message);
    } finally {
        await browser.close();
    }
}

main();

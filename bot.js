const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const MESSAGE_TO_POST = process.env.CUSTOM_MESSAGE || "おまえらやりませんねぇ杉！！";
const IMAGE_PATH = path.join(__dirname, 'a62e0a5b (1).gif');
const TARGET_BOARD_URL = process.env.TARGET_URL;

async function main() {
    if (process.env.AUTH_JSON) {
        fs.writeFileSync('auth.json', process.env.AUTH_JSON);
    }

    const hasStorageState = fs.existsSync('auth.json');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext(
        hasStorageState ? { storageState: 'auth.json' } : {}
    );
    const page = await context.newPage();

    try {
        console.log('保存されたセッション情報でPadletにアクセス中...');
        await page.goto('https://padlet.com/dashboard', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500); // 短縮

        if (page.url().includes('login') || page.url().includes('verify')) {
            throw new Error('セッションの有効期限が切れているか、ログインしていません。');
        }

        console.log('ダッシュボードへのログインを確認しました！');

        if (!TARGET_BOARD_URL) {
            throw new Error('投稿先のPadletのURL（TARGET_URL）が指定されていません。');
        }

        console.log(`指定されたボードを開いています: ${TARGET_BOARD_URL}`);
        await page.goto(TARGET_BOARD_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000); // 短縮

        // 🔄 連続2回ループ
        for (let round = 1; round <= 15; round++) {
            console.log(`\n🚀 【高速ラウンド ${round}回目】開始`);

            // ==========================================
            // 1. 新規投稿の作成
            // ==========================================
            const addButtons = await page.$$('button[aria-label*="投稿を追加"], button[aria-label*="Add"], .section-add-button, [data-testid="add-post-button"]');
            console.log(`見つかった新規追加ボタン数: ${addButtons.length}件`);

            let sectionIndex = 1;
            for (const addBtn of addButtons) {
                try {
                    await page.keyboard.press('Escape');
                    await page.waitForTimeout(300);

                    await addBtn.click();
                    await page.waitForTimeout(400); // 短縮

                    const editor = await page.waitForSelector('div[contenteditable="true"], textarea', { timeout: 3000 });
                    await editor.fill(MESSAGE_TO_POST);
                    await page.waitForTimeout(400); // 短縮

                    const fileInput = await page.$('input[type="file"]');
                    if (fileInput) {
                        await fileInput.setInputFiles(IMAGE_PATH);
                        await page.waitForTimeout(2000); // アップロード待ちを2秒に短縮
                    }

                    const publishBtn = await page.waitForSelector('button:has-text("Publish"), button:has-text("投稿"), button[data-testid="publish-button"]', { state: 'visible', timeout: 3000 });
                    if (publishBtn) {
                        await publishBtn.click();
                        
                        await page.waitForTimeout(1000);

                        // 名前入力ポップアップの自動Done
                        try {
                            const doneBtn = await page.waitForSelector('button:has-text("Done"), [data-testid="guest-done-button"]', { timeout: 2000 });
                            if (doneBtn) {
                                await doneBtn.click();
                                await page.waitForTimeout(1000);
                            }
                        } catch (e) {}

                        await page.waitForTimeout(1500); // 投稿反映待ち短縮
                    }
                } catch (secErr) {
                    await page.keyboard.press('Escape');
                    await page.waitForTimeout(300);
                }
                sectionIndex++;
            }

            // ==========================================
            // 2. 既存の投稿へのコメント送信
            // ==========================================
            const posts = await page.$$('.post, [data-testid="post"], article');
            console.log(`見つかった既存の投稿数: ${posts.length}件`);

            let postIndex = 1;
            for (const post of posts) {
                try {
                    await post.click();
                    await page.waitForTimeout(800); // 短縮

                    const commentInput = await page.waitForSelector('textarea[placeholder*="コメント"], div[contenteditable="true"][data-placeholder*="コメント"], textarea, div[contenteditable="true"]', { timeout: 3000 });
                    if (commentInput) {
                        await commentInput.fill(MESSAGE_TO_POST);
                        await page.waitForTimeout(400); // 短縮

                        const fileInput = await page.$('input[type="file"]');
                        if (fileInput) {
                            await fileInput.setInputFiles(IMAGE_PATH);
                            await page.waitForTimeout(2000); // アップロード待ち短縮
                        }

                        const submitCommentBtn = await page.$('button:has-text("Publish"), button:has-text("コメント"), button[data-testid="comment-submit"], button[aria-label*="送信"], button[aria-label*="投稿"]');
                        if (submitCommentBtn) {
                            await submitCommentBtn.click();
                            await page.waitForTimeout(2000); // 送信待ち短縮
                        }
                    }

                    await page.keyboard.press('Escape');
                    await page.waitForTimeout(500);

                } catch (err) {
                    await page.keyboard.press('Escape');
                    await page.waitForTimeout(500);
                }
                postIndex++;
            }

            await page.waitForTimeout(1000);
        }

        console.log('\n🎉 高速での全処理が完了しました！');

    } catch (error) {
        console.error('エラーが発生しました:', error);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

main();

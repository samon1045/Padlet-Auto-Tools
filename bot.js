const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// 📝 概要欄（タイトルの下）に埋め込む約1000文字の長文メッセージ
const LONG_MESSAGE = process.env.CUSTOM_MESSAGE || ("おまえらやりませんねぇ杉！！さーもんの集いに参加 https://padlet.com/10451919uow/m ".repeat(40) + "\n（うおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗうおｗ）\n" + "あ".repeat(900));
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
        await page.waitForTimeout(1000); // 限界まで短縮

        if (page.url().includes('login') || page.url().includes('verify')) {
            throw new Error('セッションの有効期限が切れています。');
        }

        console.log('ダッシュボードログイン確認！');

        if (!TARGET_BOARD_URL) {
            throw new Error('TARGET_URLが指定されていません。');
        }

        await page.goto(TARGET_BOARD_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500); // 限界まで短縮

        // 🔄 連続2回ループ（超爆速モード）
        for (let round = 1; round <= 2; round++) {
            console.log(`\n⚡ 【超爆速ラウンド ${round}回目】開始`);

            // ==========================================
            // 1. 新規投稿の作成（長文＆画像）
            // ==========================================
            const addButtons = await page.$$('button[aria-label*="投稿を追加"], button[aria-label*="Add"], .section-add-button, [data-testid="add-post-button"]');
            
            let sectionIndex = 1;
            for (const addBtn of addButtons) {
                try {
                    await page.keyboard.press('Escape');
                    await addBtn.click();
                    await page.waitForTimeout(200); // 最小限のウェイト

                    // タイトル欄や本文欄（概要欄）に1000文字を流し込む
                    const editor = await page.waitForSelector('div[contenteditable="true"], textarea', { timeout: 2000 });
                    await editor.fill(LONG_MESSAGE);
                    await page.waitForTimeout(200);

                    // 画像（GIF）の添付
                    const fileInput = await page.$('input[type="file"]');
                    if (fileInput) {
                        await fileInput.setInputFiles(IMAGE_PATH);
                        await page.waitForTimeout(1200); // アップロードに最低限必要な時間だけ待機
                    }

                    // 投稿（Publish）ボタンをクリック
                    const publishBtn = await page.waitForSelector('button:has-text("Publish"), button:has-text("投稿"), button[data-testid="publish-button"]', { state: 'visible', timeout: 2000 });
                    if (publishBtn) {
                        await publishBtn.click();
                        
                        await page.waitForTimeout(500);

                        // 名前入力ポップアップの自動Done（出たら即閉じる）
                        try {
                            const doneBtn = await page.waitForSelector('button:has-text("Done"), [data-testid="guest-done-button"]', { timeout: 1000 });
                            if (doneBtn) {
                                await doneBtn.click();
                                await page.waitForTimeout(500);
                            }
                        } catch (e) {}

                        await page.waitForTimeout(800);
                    }
                } catch (secErr) {
                    await page.keyboard.press('Escape');
                }
                sectionIndex++;
            }

            // ==========================================
            // 2. 既存の投稿へのコメント送信（長文＆画像）
            // ==========================================
            const posts = await page.$$('.post, [data-testid="post"], article');

            let postIndex = 1;
            for (const post of posts) {
                try {
                    await post.click();
                    await page.waitForTimeout(400);

                    const commentInput = await page.waitForSelector('textarea[placeholder*="コメント"], div[contenteditable="true"][data-placeholder*="コメント"], textarea, div[contenteditable="true"]', { timeout: 2000 });
                    if (commentInput) {
                        await commentInput.fill(LONG_MESSAGE);
                        await page.waitForTimeout(200);

                        const fileInput = await page.$('input[type="file"]');
                        if (fileInput) {
                            await fileInput.setInputFiles(IMAGE_PATH);
                            await page.waitForTimeout(1200);
                        }

                        const submitCommentBtn = await page.$('button:has-text("Publish"), button:has-text("コメント"), button[data-testid="comment-submit"], button[aria-label*="送信"], button[aria-label*="投稿"]');
                        if (submitCommentBtn) {
                            await submitCommentBtn.click();
                            await page.waitForTimeout(1000);
                        }
                    }

                    await page.keyboard.press('Escape');
                    await page.waitForTimeout(200);

                } catch (err) {
                    await page.keyboard.press('Escape');
                }
                postIndex++;
            }
        }

        console.log('\n🎉 超爆速での全処理が完了しました！');

    } catch (error) {
        console.error('エラーが発生しました:', error);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

main();

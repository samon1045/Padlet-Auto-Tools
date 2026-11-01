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
        await page.waitForTimeout(3000);

        if (page.url().includes('login') || page.url().includes('verify')) {
            throw new Error('セッションの有効期限が切れているか、ログインしていません。認証情報を更新してください。');
        }

        console.log('ダッシュボードへのログインを確認しました！');

        if (!TARGET_BOARD_URL) {
            throw new Error('投稿先のPadletのURL（TARGET_URL）が指定されていません。');
        }

        console.log(`指定されたボードを開いています: ${TARGET_BOARD_URL}`);
        await page.goto(TARGET_BOARD_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(4000);

        // ==========================================
        // 1. 新規投稿（セクションごとの＋ボタン）の処理
        // ==========================================
        console.log('\n--- 【処理1】新規投稿の作成を開始 ---');
        const addButtons = await page.$$('button[aria-label*="投稿を追加"], button[aria-label*="Add"], .section-add-button, [data-testid="add-post-button"]');
        console.log(`見つかった新規追加ボタン数: ${addButtons.length}件`);

        let sectionIndex = 1;
        for (const addBtn of addButtons) {
            try {
                console.log(`- セクション ${sectionIndex} に新規投稿を作成中...`);
                
                // もし邪魔なポップアップ（ゲスト名入力など）が出ていたらESCで閉じる
                await page.keyboard.press('Escape');
                await page.waitForTimeout(500);

                await addBtn.click();
                await page.waitForTimeout(1000);

                const editor = await page.waitForSelector('div[contenteditable="true"], textarea', { timeout: 5000 });
                await editor.fill(MESSAGE_TO_POST);
                await page.waitForTimeout(1000);

                const fileInput = await page.$('input[type="file"]');
                if (fileInput) {
                    console.log('  -> GIF画像をアップロード中...');
                    await fileInput.setInputFiles(IMAGE_PATH);
                    await page.waitForTimeout(5000); 
                }

                const publishBtn = await page.waitForSelector('button:has-text("Publish"), button:has-text("投稿"), button[data-testid="publish-button"]', { state: 'visible', timeout: 5000 });
                if (publishBtn) {
                    // 📸 【デバッグ】投稿ボタンを押す「直前」のスクリーンショットを保存
                    await page.screenshot({ path: `screenshot-section${sectionIndex}-before.png` });
                    console.log(`  📸 投稿ボタン押下前のスクリーンショットを保存しました (screenshot-section${sectionIndex}-before.png)`);

                    await publishBtn.click();
                    console.log(`  -> セクション ${sectionIndex} の投稿ボタンを押しました！`);
                    
                    await page.waitForTimeout(3000);

                    // 📸 【デバッグ】投稿ボタンを押した「直後」のスクリーンショットを保存
                    await page.screenshot({ path: `screenshot-section${sectionIndex}-after.png` });
                    console.log(`  📸 投稿ボタン押下後のスクリーンショットを保存しました (screenshot-section${sectionIndex}-after.png)`);

                    await page.waitForTimeout(4000);
                }
            } catch (secErr) {
                console.log(`  -> セクション ${sectionIndex} への新規投稿スキップ:`, secErr.message);
                // エラー時の画面も残すためにスクリーンショットを保存
                await page.screenshot({ path: `screenshot-section${sectionIndex}-error.png` });
                await page.keyboard.press('Escape');
                await page.waitForTimeout(1000);
            }
            sectionIndex++;
        }

        // ==========================================
        // 2. 既存の投稿へのコメント送信処理
        // ==========================================
        console.log('\n--- 【処理2】既存の投稿へのコメント送信を開始 ---');
        const posts = await page.$$('.post, [data-testid="post"], article');
        console.log(`見つかった既存の投稿数: ${posts.length}件`);

        let postIndex = 1;
        for (const post of posts) {
            try {
                console.log(`- 投稿 ${postIndex} のコメント欄に送信中...`);
                await post.click();
                await page.waitForTimeout(1500);

                const commentInput = await page.waitForSelector('textarea[placeholder*="コメント"], div[contenteditable="true"][data-placeholder*="コメント"], textarea, div[contenteditable="true"]', { timeout: 5000 });
                if (commentInput) {
                    await commentInput.fill(MESSAGE_TO_POST);
                    await page.waitForTimeout(1000);

                    const fileInput = await page.$('input[type="file"]');
                    if (fileInput) {
                        console.log('  -> コメントにGIF画像を添付中...');
                        await fileInput.setInputFiles(IMAGE_PATH);
                        await page.waitForTimeout(4000);
                    }

                    const submitCommentBtn = await page.$('button:has-text("Publish"), button:has-text("コメント"), button[data-testid="comment-submit"], button[aria-label*="送信"], button[aria-label*="投稿"]');
                    if (submitCommentBtn) {
                        await submitCommentBtn.click();
                        console.log(`  -> 投稿 ${postIndex} へのコメント送信完了！`);
                        await page.waitForTimeout(5000);
                    }
                }

                await page.keyboard.press('Escape');
                await page.waitForTimeout(1000);

            } catch (err) {
                console.log(`  -> 投稿 ${postIndex} へのコメント送信スキップ:`, err.message);
                await page.keyboard.press('Escape');
                await page.waitForTimeout(1000);
            }
            postIndex++;
        }

        console.log('\n🎉 すべての自動投稿・コメント送信処理が完了しました！');

    } catch (error) {
        console.error('エラーが発生しました:', error);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

main();

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// 📝 設定値
const TOPIC_MESSAGE = process.env.TOPIC_MESSAGE || '【新規投稿】おまえらやりませんねぇ杉！！';
const COMMENT_MESSAGE = process.env.COMMENT_MESSAGE || '【コメント】おまえらやりませんねぇ杉！！';
const IMAGE_PATH = path.join(__dirname, 'a62e0a5b (1).gif');
const TARGET_BOARD_URL = process.env.TARGET_URL;

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
        await page.waitForTimeout(3000);

        if (page.url().includes('login') || page.url().includes('verify')) {
            throw new Error('セッションの有効期限が切れているか、ログインしていません。AUTH_JSONを更新してください。');
        }

        console.log('ボードの読み込みを確認しました！');

        // 1. 各セクション（またはボード全体）の「+ 投稿」ボタンを取得して、新規投稿＆画像添付を行う
        console.log('\n--- 📂 新規投稿の作成処理を開始 ---');
        const addPostButtons = await page.$$('button:has-text("投稿"), button:has-text("Add post"), button[aria-label*="投稿"], div.section-add-button');
        
        for (let i = 0; i < addPostButtons.length; i++) {
            try {
                const freshAddBtns = await page.$$('button:has-text("投稿"), button:has-text("Add post"), button[aria-label*="投稿"], div.section-add-button');
                if (!freshAddBtns[i]) continue;

                await freshAddBtns[i].scrollIntoViewIfNeeded();
                await freshAddBtns[i].click();
                console.log(`📍 セクション ${i + 1} に新規投稿を作成中...`);
                await page.waitForTimeout(1500);

                // 新規投稿のタイトルまたは本文入力欄
                const postEditor = await page.waitForSelector('div[contenteditable="true"], textarea', { timeout: 5000 });
                if (postEditor) {
                    await postEditor.focus();
                    await postEditor.click();
                    await page.keyboard.insertText(TOPIC_MESSAGE);
                    console.log(`  ✍️ 新規投稿メッセージ入力: ${TOPIC_MESSAGE}`);
                    await page.waitForTimeout(500);

                    // 画像（GIF）の添付
                    if (fs.existsSync(IMAGE_PATH)) {
                        const fileInputs = await page.$$('input[type="file"]');
                        if (fileInputs.length > 0) {
                            await fileInputs[fileInputs.length - 1].setInputFiles(IMAGE_PATH);
                            console.log('  🖼️ 新規投稿に画像を添付しました！');
                            await page.waitForTimeout(2500);
                        }
                    }

                    // 投稿の保存（発行）
                    const publishBtn = await page.$('button:has-text("Publish"), button:has-text("投稿"), button:has-text("公開"), button[type="submit"]');
                    if (publishBtn && await publishBtn.isVisible()) {
                        await publishBtn.click();
                    } else {
                        await page.keyboard.press('Enter');
                    }
                    console.log('  🚀 新規投稿を公開しました！');
                    await page.waitForTimeout(3000);
                }
            } catch (err) {
                console.log(`⚠️ 新規投稿処理中のエラー:`, err.message);
                await page.keyboard.press('Escape');
            }
        }

        // 2. 各カードの「コメントを追加」に対して、別メッセージでコメントを2回ずつ投稿する
        console.log('\n--- 💬 コメントの連続投稿処理を開始 ---');
        const TOTAL_ROUNDS = 2;

        for (let round = 1; round <= TOTAL_ROUNDS; round++) {
            console.log(`\n⚡ 【コメント巡回：第 ${round} 回目】`);
            const commentButtons = await page.$$('button:has-text("Add comment"), button:has-text("コメントを追加"), div:has-text("+ Add comment"), span:has-text("+ Add comment")');

            for (let i = 0; i < commentButtons.length; i++) {
                try {
                    await page.keyboard.press('Escape');
                    await page.waitForTimeout(500);

                    const freshCommentBtns = await page.$$('button:has-text("Add comment"), button:has-text("コメントを追加"), div:has-text("+ Add comment"), span:has-text("+ Add comment")');
                    if (!freshCommentBtns[i]) continue;

                    await freshCommentBtns[i].scrollIntoViewIfNeeded();
                    await freshCommentBtns[i].click();
                    await page.waitForTimeout(1500);

                    const commentEditor = await page.waitForSelector('div[contenteditable="true"], textarea', { timeout: 5000 });
                    if (commentEditor) {
                        await commentEditor.focus();
                        await commentEditor.click();

                        // コメント用のメッセージを使用
                        await page.keyboard.insertText(COMMENT_MESSAGE);
                        console.log(`  ✍️ コメント入力: ${COMMENT_MESSAGE}`);
                        await page.waitForTimeout(500);

                        // コメントにも画像を付けたい場合
                        if (fs.existsSync(IMAGE_PATH)) {
                            const fileInputs = await page.$$('input[type="file"]');
                            if (fileInputs.length > 0) {
                                await fileInputs[fileInputs.length - 1].setInputFiles(IMAGE_PATH);
                                await page.waitForTimeout(2500);
                            }
                        }

                        await page.keyboard.press('Enter');
                        console.log('  🚀 コメントを送信しました！');
                        await page.waitForTimeout(3000);

                        // ゲスト名入力ポップアップの自動対応
                        const nameInput = await page.$('input[placeholder*="name"], input[type="text"]');
                        const doneBtn = await page.$('button:has-text("Done"), button:has-text("完了")');
                        
                        if (nameInput && doneBtn && await nameInput.isVisible()) {
                            await nameInput.fill('さーもん bot');
                            await page.waitForTimeout(500);
                            await doneBtn.click();
                            await page.waitForTimeout(2000);
                        }
                    }
                } catch (err) {
                    console.log(`⚠️ コメント処理中のエラー:`, err.message);
                    await page.keyboard.press('Escape');
                }
            }
        }

        console.log('\n🎉 全ての処理が完了しました！');
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

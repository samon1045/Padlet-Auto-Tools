const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// 📝 設定値
const TOPIC_TITLE = process.env.TOPIC_TITLE || '今すぐさーもんの集いに参加！！';
const TOPIC_MESSAGE = process.env.TOPIC_MESSAGE || 'お前らやりませんね杉！！ ここはさーもんの集いに荒らされました！ｗ今すぐサーモンの集いに参加！https://sus5.netlify.app/#SamonTudoiPado パスワードわからない人はあきらめてねー！ww普通はわかるけどねwww荒らすことだけしか考えれないのかｗｗｗ ぜひ参加してねww 荒らし対策もうちょっとしてね～ww もっと頑張ってねwwじゃあお疲れｗそんじゃがんばれがんばれｗｗ　これはボットで攻撃していますｗｗｗお前らやりませんね杉！！ ここはさーもんの集いに荒らされました！ｗ今すぐサーモンの集いに参加！https://sus5.netlify.app/#SamonTudoiPado ぜひ参加してねww 荒らし対策もうちょっとしてね～ww もっと頑張ってねwwじゃあお疲れｗそんじゃがんばれがんばれｗｗ　これはボットで攻撃していますｗｗｗお前らやりませんね杉！！ ここはさーもんの集いに荒らされました！ｗ今すぐサーモンの集いに参加！https://sus5.netlify.app/#SamonTudoiPado ぜひ参加してねww 荒らし対策もうちょっとしてね～ww もっと頑張ってねwwじゃあお疲れｗそんじゃがんばれがんばれｗｗ　これはボットで攻撃していますｗｗｗお前らやりませんね杉！！ ここはさーもんの集いに荒らされました！ｗ今すぐサーモンの集いに参加！https://sus5.netlify.app/#SamonTudoiPado ぜひ参加してねww 荒らし対策もうちょっとしてね～ww もっと頑張ってねwwじゃあお疲れｗそんじゃがんばれがんばれｗｗ　これはボットで攻撃していますｗｗｗお前らやりませんね杉！！ ここはさーもんの集いに荒らされました！ｗ今すぐサーモンの集いに参加！https://sus5.netlify.app/#SamonTudoiPado ぜひ参加してねww 荒らし対策もうちょっとしてね～ww もっと頑張ってねwwじゃあお疲れｗそんじゃがんばれがんばれｗｗ　これはボットで攻撃していますｗｗｗお前らやりませんね杉！！ ここはさーもんの集いに荒らされました！ｗ今すぐサーモンの集いに参加！https://sus5.netlify.app/#SamonTudoiPado ぜひ参加してねww 荒らし対策もうちょっとしてね～ww もっと頑張ってねwwじゃあお疲れｗそんじゃがんばれがんばれｗｗ　これはボットで攻撃していますｗｗｗお前らやりませんね杉！！ ここはさーもんの集いに荒らされました！ｗ今すぐサーモンの集いに参加！https://sus5.netlify.app/#SamonTudoiPado ぜひ参加してねww 荒らし対策もうちょっとしてね～ww もっと頑張ってねwwじゃあお疲れｗそんじゃがんばれがんばれｗｗ　これはボットで攻撃していますｗｗｗお前らやりませんね杉！！ ここはさーもんの集いに荒らされました！ｗ今すぐサーモンの集いに参加！https://sus5.netlify.app/#SamonTudoiPado ぜひ参加してねww 荒らし対策もうちょっとしてね～ww もっと頑張ってねwwじゃあお疲れｗそんじゃがんばれがんばれｗｗ　これはボットで攻撃していますｗｗｗお前らやりませんね杉！！ ここはさーもんの集いに荒らされました！ｗ今すぐサーモンの集いに参加！https://sus5.netlify.app/#SamonTudoiPado ぜひ参加してねww 荒らし対策もうちょっとしてね～ww もっと頑張ってねwwじゃあお疲れｗそんじゃがんばれがんばれｗｗ　これはボットで攻撃していますｗｗｗお前らやりませんね杉！！ ここはさーもんの集いに荒らされました！ｗ今すぐサーモンの集いに参加！https://sus5.netlify.app/#SamonTudoiPado ぜひ参加してねww 荒らし対策もうちょっとしてね～ww もっと頑張ってねwwじゃあお疲れｗそんじゃがんばれがんばれｗｗ　これはボットで攻撃していますｗｗｗお前らやりませんね杉！！ ここはさーもんの集いに荒らされました！ｗ今すぐサーモンの集いに参加！https://sus5.netlify.app/#SamonTudoiPado ぜひ参加してねww 荒らし対策もうちょっとしてね～ww もっと頑張ってねwwじゃあお疲れｗそんじゃがんばれがんばれｗｗ　これはボットで攻撃していますｗｗｗお前らやりませんね杉！！ ここはさーもんの集いに荒らされました！ｗ今すぐサーモンの集いに参加！https://sus5.netlify.app/#SamonTudoiPado ぜひ参加してねww 荒らし対策もうちょっとしてね～ww もっと頑張ってねwwじゃあお疲れｗそんじゃがんばれがんばれｗｗ　これはボットで攻撃していますｗｗｗ';
const COMMENT_MESSAGE = process.env.COMMENT_MESSAGE || 'お前らやりませんね杉！！ ここはさーもんの集いに荒らされました！ｗ今すぐサーモンの集いに参加！https://sus5.netlify.app/#SamonTudoiPado パスワードわからない人はあきらめてねー！ww普通はわかるけどねwww荒らすことだけしか考えれないのかｗｗｗ ぜひ参加してねww 荒らし対策もうちょっとしてね～ww もっと頑張ってねwwじゃあお疲れｗそんじゃがんばれがんばれｗｗ　これはボットで攻撃していますｗｗｗお前らやりませんね杉！！ ここはさーもんの集いに荒らされました！ｗ今すぐサーモンの集いに参加！https://sus5.netlify.app/#SamonTudoiPado ぜひ参加してねww 荒らし対策もうちょっとしてね～ww もっと頑張ってねwwじゃあお疲れｗそんじゃがんばれがんばれｗｗ　これはボットで攻撃していますｗｗｗお前らやりませんね杉！！ ここはさーもんの集いに荒らされました！ｗ今すぐサーモンの集いに参加！https://sus5.netlify.app/#SamonTudoiPado ぜひ参加してねww 荒らし対策もうちょっとしてね～ww もっと頑張ってねwwじゃあお疲れｗそんじゃがんばれがんばれｗｗ　これはボットで攻撃していますｗｗｗお前らやりませんね杉！！ ここはさーもんの集いに荒らされました！ｗ今すぐサーモンの集いに参加！https://sus5.netlify.app/#SamonTudoiPado ぜひ参加してねww 荒らし対策もうちょっとしてね～ww もっと頑張ってねwwじゃあお疲れｗそんじゃがんばれがんばれｗｗ　これはボットで攻撃していますｗｗｗお前らやりませんね杉！！ ここはさーもんの集いに荒らされました！ｗ今すぐサーモンの集いに参加！https://sus5.netlify.app/#SamonTudoiPado ぜひ参加してねww 荒らし対策もうちょっとしてね～ww もっと頑張ってねwwじゃあお疲れｗそんじゃがんばれがんばれｗｗ　これはボットで攻撃していますｗｗｗお前らやりませんね杉！！ ここはさーもんの集いに荒らされました！ｗ今すぐサーモンの集いに参加！https://sus5.netlify.app/#SamonTudoiPado ぜひ参加してねww 荒らし対策もうちょっとしてね～ww もっと頑張ってねwwじゃあお疲れｗそんじゃがんばれがんばれｗｗ　これはボットで攻撃していますｗｗｗお前らやりませんね杉！！ ここはさーもんの集いに荒らされました！ｗ今すぐサーモンの集いに参加！https://sus5.netlify.app/#SamonTudoiPado ぜひ参加してねww 荒らし対策もうちょっとしてね～ww もっと頑張ってねwwじゃあお疲れｗそんじゃがんばれがんばれｗｗ　これはボットで攻撃していますｗｗｗお前らやりませんね杉！！ ここはさーもんの集いに荒らされました！ｗ今すぐサーモンの集いに参加！https://sus5.netlify.app/#SamonTudoiPado ぜひ参加してねww 荒らし対策もうちょっとしてね～ww もっと頑張ってねwwじゃあお疲れｗそんじゃがんばれがんばれｗｗ　これはボットで攻撃していますｗｗｗお前らやりませんね杉！！ ここはさーもんの集いに荒らされました！ｗ今すぐサーモンの集いに参加！https://sus5.netlify.app/#SamonTudoiPado ぜひ参加してねww 荒らし対策もうちょっとしてね～ww もっと頑張ってねwwじゃあお疲れｗそんじゃがんばれがんばれｗｗ　これはボットで攻撃していますｗｗｗお前らやりませんね杉！！ ここはさーもんの集いに荒らされました！ｗ今すぐサーモンの集いに参加！https://sus5.netlify.app/#SamonTudoiPado ぜひ参加してねww 荒らし対策もうちょっとしてね～ww もっと頑張ってねwwじゃあお疲れｗそんじゃがんばれがんばれｗｗ　これはボットで攻撃していますｗｗｗお前らやりませんね杉！！ ここはさーもんの集いに荒らされました！ｗ今すぐサーモンの集いに参加！https://sus5.netlify.app/#SamonTudoiPado ぜひ参加してねww 荒らし対策もうちょっとしてね～ww もっと頑張ってねwwじゃあお疲れｗそんじゃがんばれがんばれｗｗ　これはボットで攻撃していますｗｗｗお前らやりませんね杉！！ ここはさーもんの集いに荒らされました！ｗ今すぐサーモンの集いに参加！https://sus5.netlify.app/#SamonTudoiPado ぜひ参加してねww 荒らし対策もうちょっとしてね～ww もっと頑張ってねwwじゃあお疲れｗそんじゃがんばれがんばれｗｗ　これはボットで攻撃していますｗｗｗ';
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
        await page.waitForTimeout(4000);

        if (page.url().includes('login') || page.url().includes('verify')) {
            throw new Error('セッションの有効期限が切れているか、ログインしていません。AUTH_JSONを更新してください。');
        }

        console.log('ボードの読み込みを確認しました！');

        // ==========================================
        // 1. 各セクションの「＋」ボタンを押して新規投稿（タイトル＋メッセージ＋画像）を作成
        // ==========================================
        console.log('\n============================');
        console.log('📂 【新規投稿の作成】開始');
        console.log('============================');

        // 各セクションにある新規追加ボタン（「＋」ボタン）を取得
        const addButtons = await page.$$('button[aria-label*="投稿を追加"], button[aria-label*="Add post"], button.section-add-btn, div.section-add-button, button:has-text("+")');
        console.log(`検出されたセクション追加ボタン数: ${addButtons.length}件`);

        for (let i = 0; i < addButtons.length; i++) {
            try {
                console.log(`\n📍 [セクション ${i + 1} / ${addButtons.length}] に新規投稿を作成中...`);
                
                // 毎回最新のボタンを再取得
                const freshAddBtns = await page.$$('button[aria-label*="投稿を追加"], button[aria-label*="Add post"], button.section-add-btn, div.section-add-button, button:has-text("+")');
                const targetAddBtn = freshAddBtns[i];

                if (!targetAddBtn) continue;

                await targetAddBtn.scrollIntoViewIfNeeded();
                await page.waitForTimeout(800);
                await targetAddBtn.click();
                await page.waitForTimeout(1500);

                // タイトル入力欄（Title）を探して入力
                const titleInput = await page.$('input[placeholder*="Title"], input[placeholder*="タイトル"], input[type="text"]');
                if (titleInput) {
                    await titleInput.fill(TOPIC_TITLE);
                    console.log(`  ✍️ タイトル入力: ${TOPIC_TITLE}`);
                    await page.waitForTimeout(500);
                }

                // メッセージ（本文）入力欄を探して入力
                const bodyEditor = await page.$('div[contenteditable="true"], textarea');
                if (bodyEditor) {
                    await bodyEditor.focus();
                    await bodyEditor.click();
                    await page.keyboard.insertText(TOPIC_MESSAGE);
                    console.log(`  ✍️ メッセージ入力: ${TOPIC_MESSAGE}`);
                    await page.waitForTimeout(500);
                }

                // 画像の添付
                if (fs.existsSync(IMAGE_PATH)) {
                    const fileInputs = await page.$$('input[type="file"]');
                    if (fileInputs.length > 0) {
                        const targetFileInput = fileInputs[fileInputs.length - 1];
                        await targetFileInput.setInputFiles(IMAGE_PATH);
                        console.log('  🖼️ 新規投稿に画像を添付しました！');
                        await page.waitForTimeout(2500); // プレビュー読込待ち
                    }
                }

                // 「公開（Publish / 投稿）」ボタンを押す
                const publishBtn = await page.$('button:has-text("Publish"), button:has-text("投稿"), button:has-text("公開"), button[type="submit"]');
                if (publishBtn && await publishBtn.isVisible()) {
                    await publishBtn.click();
                } else {
                    await page.keyboard.press('Enter');
                }
                console.log('  🚀 新規投稿を公開しました！');
                await page.waitForTimeout(3500);

            } catch (err) {
                console.log(`⚠️ セクション ${i + 1} の新規投稿作成中にエラー:`, err.message);
                await page.keyboard.press('Escape');
            }
        }

        // ==========================================
        // 2. 既存のすべてのカードに対してコメントを「2回ずつ」巡回投稿
        // ==========================================
        const TOTAL_ROUNDS = 2;

        for (let round = 1; round <= TOTAL_ROUNDS; round++) {
            console.log(`\n============================`);
            console.log(`⚡ 【コメント巡回：投稿 ${round}回目】開始`);
            console.log(`============================`);

            const cards = await page.$$('div.post, div.card, article, div[data-id], div.iti-post');
            console.log(`検出されたカード（ポスト）数: ${cards.length}件`);

            let targetCount = cards.length;
            if (targetCount === 0) {
                const fallbackBtns = await page.$$('button:has-text("Add comment"), button:has-text("コメントを追加"), div:has-text("+ Add comment"), span:has-text("+ Add comment")');
                targetCount = fallbackBtns.length;
            }

            for (let i = 0; i < targetCount; i++) {
                try {
                    console.log(`\n📍 [カード ${i + 1} / ${targetCount}] へのコメント投稿処理中...`);
                    
                    await page.keyboard.press('Escape');
                    await page.waitForTimeout(500);

                    const currentCards = await page.$$('div.post, div.card, article, div[data-id], div.iti-post');
                    const targetCard = currentCards[i];

                    let targetBtn = null;
                    if (targetCard) {
                        targetBtn = await targetCard.$('button:has-text("Add comment"), button:has-text("コメントを追加"), div:has-text("+ Add comment"), span:has-text("+ Add comment"), button[aria-label*="comment"], div.comment-box');
                    }

                    if (!targetBtn) {
                        const allBtns = await page.$$('button:has-text("Add comment"), button:has-text("コメントを追加"), div:has-text("+ Add comment"), span:has-text("+ Add comment")');
                        targetBtn = allBtns[i];
                    }

                    if (!targetBtn) {
                        console.log(`⚠️ カード ${i + 1} のコメントボタンが見つからないためスキップします。`);
                        continue;
                    }

                    await targetBtn.scrollIntoViewIfNeeded();
                    await page.waitForTimeout(800);

                    await targetBtn.click();
                    await page.waitForTimeout(1500);

                    const editor = await page.waitForSelector('div[contenteditable="true"], textarea', { timeout: 5000 });
                    if (editor) {
                        await editor.focus();
                        await editor.click();

                        await page.keyboard.insertText(COMMENT_MESSAGE);
                        console.log(`  ✍️ コメント入力: ${COMMENT_MESSAGE}`);
                        await page.waitForTimeout(500);

                        if (fs.existsSync(IMAGE_PATH)) {
                            const fileInputs = await page.$$('input[type="file"]');
                            if (fileInputs.length > 0) {
                                const targetFileInput = fileInputs[fileInputs.length - 1];
                                await targetFileInput.setInputFiles(IMAGE_PATH);
                                console.log('  🖼️ コメントに画像を添付しました！');
                                await page.waitForTimeout(2500);
                            }
                        }

                        await page.keyboard.press('Enter');
                        console.log('  🚀 コメントを送信しました！');
                        await page.waitForTimeout(3500);

                        // ゲスト名入力を求めるポップアップへの自動対応
                        const nameInput = await page.$('input[placeholder*="name"], input[type="text"]');
                        const doneBtn = await page.$('button:has-text("Done"), button:has-text("完了")');
                        
                        if (nameInput && doneBtn && await nameInput.isVisible()) {
                            console.log('  👤 ゲスト名入力を検知。自動入力中...');
                            await nameInput.fill('さーもん bot');
                            await page.waitForTimeout(500);
                            await doneBtn.click();
                            console.log('  ✨ 名前を登録しました！');
                            await page.waitForTimeout(2000);
                        }
                    }

                } catch (err) {
                    console.log(`⚠️ カード ${i + 1} の処理中にエラーが発生しました:`, err.message);
                    await page.keyboard.press('Escape');
                }
            }
        }

        console.log('\n🎉 全ての新規投稿およびコメント処理が完了しました！');
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

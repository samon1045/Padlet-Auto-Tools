const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// 📝 投稿・コメント用メッセージ（長文＆リンク付き）
const LONG_MESSAGE = process.env.CUSTOM_MESSAGE || ("おまえらやりませんねぇ杉！！さーもんの集いに参加 https://padlet.com/goodtanaka/m ".repeat(40) + "\n（うおｗ）\n" + "あ".repeat(900));
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
        console.log('Target URLに高速アクセス中...');
        if (!TARGET_BOARD_URL) {
            throw new Error('TARGET_URLが指定されていません。');
        }

        await page.goto(TARGET_BOARD_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);

        const TOTAL_ROUNDS = 15; 

        for (let round = 1; round <= TOTAL_ROUNDS; round++) {
            console.log(`\n⚡ 【超爆速ラウンド ${round}回目】開始`);

            try {
                // 余計なポップアップを強制解除
                await page.keyboard.press('Escape');
                await page.keyboard.press('Escape');
                await page.waitForTimeout(100);

                // ==========================================
                // 1. 新規投稿トライ（失敗したらコメント爆撃へフォールバック）
                // ==========================================
                let successAction = false;

                // セクション内の「＋」ボタンをクリックしてみる
                const clickedSection = await page.evaluate((rIdx) => {
                    const sections = Array.from(document.querySelectorAll('div[data-section-id], section, div[class*="section"]'));
                    const targetButtons = [];
                    sections.forEach(sec => {
                        const btns = Array.from(sec.querySelectorAll('button, div[role="button"]'));
                        const addBtn = btns.find(b => {
                            const text = b.innerText || b.textContent || '';
                            const aria = b.getAttribute('aria-label') || '';
                            return text.includes('+') || aria.includes('Add') || aria.includes('投稿') || b.className.includes('add');
                        });
                        if (addBtn) targetButtons.push(addBtn);
                    });

                    if (targetButtons.length > 0) {
                        const target = targetButtons[(rIdx - 1) % targetButtons.length];
                        target.click();
                        return true;
                    }
                    return false;
                }, round);

                await page.waitForTimeout(400);

                // エディタ（新規投稿欄）が出るかチェック
                let editor = null;
                try {
                    editor = await page.waitForSelector('div[contenteditable="true"], textarea', { timeout: 1500 });
                } catch (e) {}

                if (editor) {
                    // --- 新規投稿として送信 ---
                    await editor.fill(LONG_MESSAGE);
                    await page.waitForTimeout(100);

                    if (fs.existsSync(IMAGE_PATH)) {
                        const fileInput = await page.$('input[type="file"]');
                        if (fileInput) {
                            await fileInput.setInputFiles(IMAGE_PATH);
                            await page.waitForTimeout(600);
                        }
                    }

                    const publishBtn = await page.waitForSelector('button:has-text("Publish"), button:has-text("投稿"), [data-testid="publish-button"]', { state: 'visible', timeout: 2000 });
                    if (publishBtn) {
                        await publishBtn.click();
                        await page.waitForTimeout(400);

                        // ゲスト名入力などのDone処理
                        try {
                            const doneBtn = await page.waitForSelector('button:has-text("Done"), button:has-text("完了"), [data-testid="guest-done-button"]', { timeout: 1000 });
                            if (doneBtn) {
                                await doneBtn.click();
                                await page.waitForTimeout(200);
                            }
                        } catch (e) {}

                        console.log(`第 ${round} 回：新規投稿が完了しました！`);
                        successAction = true;
                    }
                }

                // ==========================================
                // 2. 新規投稿できなかった場合（コメント権限のみの部屋など）は既存コメント欄へ爆撃
                // ==========================================
                if (!successAction) {
                    console.log('新規投稿が制限されているため、既存の投稿カードのコメント欄へアタックします');
                    await page.keyboard.press('Escape');
                    await page.waitForTimeout(200);

                    // 既存の投稿カードをすべて取得してクリック
                    const posts = await page.$$('.post, [data-testid="post"], article, div[class*="post"]');
                    if (posts.length > 0) {
                        const targetPost = posts[(round - 1) % posts.length];
                        await targetPost.click();
                        await page.waitForTimeout(300);

                        // コメント入力欄を探す
                        const commentInput = await page.waitForSelector('textarea[placeholder*="コメント"], div[contenteditable="true"][data-placeholder*="コメント"], textarea, div[contenteditable="true"]', { timeout: 2000 });
                        if (commentInput) {
                            await commentInput.fill(LONG_MESSAGE);
                            await page.waitForTimeout(100);

                            if (fs.existsSync(IMAGE_PATH)) {
                                const fileInput = await page.$('input[type="file"]');
                                if (fileInput) {
                                    await fileInput.setInputFiles(IMAGE_PATH);
                                    await page.waitForTimeout(600);
                                }
                            }

                            // コメント送信ボタン
                            const submitBtn = await page.$('button:has-text("Publish"), button:has-text("コメント"), button[data-testid="comment-submit"], button[aria-label*="送信"], button[aria-label*="投稿"]');
                            if (submitBtn) {
                                await submitBtn.click();
                                await page.waitForTimeout(400);
                            }
                            console.log(`第 ${round} 回：既存投稿へのコメント爆撃が完了しました！`);
                        }
                    } else {
                        console.log(`第 ${round} 回：有効なターゲットが見つかりませんでした。`);
                    }
                }

            } catch (err) {
                console.log(`第 ${round} 回目で軽微なスキップが発生しました。次へ進みます。`);
                await page.keyboard.press('Escape');
            }
        }

        console.log('\n🎉 全ての超爆速処理が完了しました！');
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

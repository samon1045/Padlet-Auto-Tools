const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// 📝 投稿・コメント用メッセージ
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
            console.log(`\n⚡ 【ラウンド ${round}回目】開始`);

            try {
                await page.keyboard.press('Escape');
                await page.keyboard.press('Escape');
                await page.waitForTimeout(100);

                let actionDone = false;

                // ==========================================
                // 1. 各セクションの「＋」ボタン（追加ボタン）を正確に狙う
                // ==========================================
                const clickedSection = await page.evaluate((rIdx) => {
                    // 各セクションのコンテナを取得
                    const sections = Array.from(document.querySelectorAll('div[data-section-id], section, div[class*="section"]'));
                    const addButtons = [];

                    sections.forEach(sec => {
                        // セクション内にあるボタンやクリック可能要素のうち、明確に「＋」や「追加」のものに絞る
                        const btns = Array.from(sec.querySelectorAll('button'));
                        const matchBtn = btns.find(b => {
                            const text = (b.innerText || b.textContent || '').trim();
                            const aria = b.getAttribute('aria-label') || '';
                            // 絵文字やメニュー（...）を除外して「+」または「Add」だけを狙う
                            return text === '+' || text.toLowerCase() === 'add' || aria.includes('Add post') || aria.includes('投稿を追加');
                        });
                        if (matchBtn) addButtons.push(matchBtn);
                    });

                    if (addButtons.length > 0) {
                        const target = addButtons[(rIdx - 1) % addButtons.length];
                        target.click();
                        return true;
                    }
                    return false;
                }, round);

                await page.waitForTimeout(400);

                // 新規投稿のエディタが開いたかチェック
                let editor = null;
                try {
                    editor = await page.waitForSelector('div[contenteditable="true"], textarea', { timeout: 1500 });
                } catch (e) {}

                if (editor) {
                    // 新規投稿の作成処理
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

                        try {
                            const doneBtn = await page.waitForSelector('button:has-text("Done"), button:has-text("完了"), [data-testid="guest-done-button"]', { timeout: 1000 });
                            if (doneBtn) {
                                await doneBtn.click();
                                await page.waitForTimeout(200);
                            }
                        } catch (e) {}

                        console.log(`[成功] 第 ${round} 回：新規投稿を作成しました！`);
                        actionDone = true;
                    }
                }

                // ==========================================
                // 2. 新規投稿ができなかった場合、または追加で「+ Add comment」へ爆撃
                // ==========================================
                if (!actionDone) {
                    console.log('新規投稿ができないため、各投稿の「+ Add comment」へコメント爆撃します');
                    
                    const clickedComment = await page.evaluate((rIdx) => {
                        const allElements = Array.from(document.querySelectorAll('button, div, span'));
                        const commentBtns = allElements.filter(el => {
                            const text = (el.innerText || el.textContent || '').trim();
                            return text === '+ Add comment' || text === 'コメントを追加' || text.includes('Add comment');
                        });

                        if (commentBtns.length > 0) {
                            const target = commentBtns[(rIdx - 1) % commentBtns.length];
                            target.click();
                            return true;
                        }
                        return false;
                    }, round);

                    if (clickedComment) {
                        await page.waitForTimeout(400);
                        const commentInput = await page.waitForSelector('div[contenteditable="true"], textarea', { timeout: 2000 });
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

                            const submitBtn = await page.waitForSelector('button:has-text("Publish"), button:has-text("コメント"), button[data-testid="comment-submit"], button[aria-label*="送信"], button[aria-label*="投稿"]', { state: 'visible', timeout: 2000 });
                            if (submitBtn) {
                                await submitBtn.click();
                                await page.waitForTimeout(400);
                                console.log(`[成功] 第 ${round} 回：コメント爆撃が完了しました！`);
                                actionDone = true;
                            }
                        }
                    }
                }

                // どちらもダメだった場合の最終フォールバック
                if (!actionDone) {
                    console.log(`[フォールバック] 第 ${round} 回：全体の「+ Post」ボタンから投稿を試みます`);
                    await page.evaluate(() => {
                        const buttons = Array.from(document.querySelectorAll('button'));
                        const target = buttons.find(b => (b.innerText || '').includes('+ Post') || (b.innerText || '').includes('投稿'));
                        if (target) target.click();
                    });
                    await page.waitForTimeout(500);

                    const fbEditor = await page.waitForSelector('div[contenteditable="true"], textarea', { timeout: 2000 });
                    if (fbEditor) {
                        await fbEditor.fill(LONG_MESSAGE);
                        await page.waitForTimeout(100);

                        if (fs.existsSync(IMAGE_PATH)) {
                            const fileInput = await page.$('input[type="file"]');
                            if (fileInput) {
                                await fileInput.setInputFiles(IMAGE_PATH);
                                await page.waitForTimeout(600);
                            }
                        }

                        const pubBtn = await page.$('button:has-text("Publish"), button:has-text("投稿"), [data-testid="publish-button"]');
                        if (pubBtn) {
                            await pubBtn.click();
                            await page.waitForTimeout(400);
                            console.log(`[成功] 第 ${round} 回：フォールバック投稿が完了しました！`);
                        }
                    }
                }

            } catch (err) {
                console.log(`第 ${round} 回目でスキップが発生しました。次へ進みます。`);
                await page.keyboard.press('Escape');
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

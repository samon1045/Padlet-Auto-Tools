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
            console.log(`\n⚡ 【ハイブリッド爆撃ラウンド ${round}回目】開始`);

            try {
                await page.keyboard.press('Escape');
                await page.keyboard.press('Escape');
                await page.waitForTimeout(100);

                let postCreated = false;
                let commentBombed = false;

                // ==========================================
                // 1. まず「新規投稿」の作成を試みる
                // ==========================================
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

                let editor = null;
                try {
                    editor = await page.waitForSelector('div[contenteditable="true"], textarea', { timeout: 1500 });
                } catch (e) {}

                if (editor) {
                    // 新規投稿の作成に成功
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
                        postCreated = true;
                    }
                }

                // ==========================================
                // 2. 投稿が成功した場合は「既存投稿のコメントにも爆撃」を追加実行
                // 3. 投稿が作れなかった場合は「メインでコメントに爆撃」
                // ==========================================
                if (postCreated || !postCreated) {
                    // 既存投稿のコメント欄を探して爆撃を試みる
                    const clickedComment = await page.evaluate((rIdx) => {
                        const allElements = Array.from(document.querySelectorAll('button, div, span'));
                        const commentBtns = allElements.filter(el => {
                            const text = el.innerText || el.textContent || '';
                            return text.includes('Add comment') || text.includes('コメントを追加') || text.includes('+ Add');
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
                                console.log(`[成功] 第 ${round} 回：既存投稿へのコメント爆撃も完了しました！`);
                                commentBombed = true;
                            }
                        }
                    }
                }

                // ==========================================
                // 4. コメント爆撃もできなかった場合は、強制的に新規投稿を作成
                // ==========================================
                if (!postCreated && !commentBombed) {
                    console.log(`[フォールバック] 第 ${round} 回：コメントができなかったため、全体追加ボタンから新規投稿を作成します`);
                    await page.evaluate(() => {
                        const buttons = Array.from(document.querySelectorAll('button'));
                        const target = buttons.find(b => (b.innerText || '').includes('Post') || (b.innerText || '').includes('投稿') || (b.innerText || '').includes('+'));
                        if (target) target.click();
                    });
                    await page.waitForTimeout(500);

                    const fallbackEditor = await page.waitForSelector('div[contenteditable="true"], textarea', { timeout: 2000 });
                    if (fallbackEditor) {
                        await fallbackEditor.fill(LONG_MESSAGE);
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
                            console.log(`[成功] 第 ${round} 回：フォールバック新規投稿が完了しました！`);
                        }
                    }
                }

            } catch (err) {
                console.log(`第 ${round} 回目で軽微なスキップが発生しました。次へ進みます。`);
                await page.keyboard.press('Escape');
            }
        }

        console.log('\n🎉 全てのハイブリッド爆撃処理が完了しました！');
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

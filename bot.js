const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// 📝 送信メッセージと画像パス
const MESSAGE = process.env.CUSTOM_MESSAGE || 'さーもんの集いに参加 https://padlet.com/goodtanaka/m';
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
        console.log('Target URLにアクセス中...');
        if (!TARGET_BOARD_URL) {
            throw new Error('TARGET_URLが指定されていません。');
        }

        await page.goto(TARGET_BOARD_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);
        // 【デバッグ】ページ読み込み直後のスクショ
        await page.screenshot({ path: 'debug-01-loaded.png', fullPage: true });

        // 合計2回実行
        const TOTAL_ROUNDS = 2; 

        for (let round = 1; round <= TOTAL_ROUNDS; round++) {
            console.log(`\n⚡ 【処理 ${round}回目】開始`);

            try {
                // モーダルを閉じるためにEscape
                await page.keyboard.press('Escape');
                await page.waitForTimeout(500);

                let actionDone = false;

                // ==========================================
                // 1. デフォルト：新規投稿（各セクションの「＋」ボタン）を試す
                // ==========================================
                console.log('新規投稿（＋ボタン）を試みます...');
                const clickedSection = await page.evaluate((rIdx) => {
                    const sections = Array.from(document.querySelectorAll('div[data-section-id], section, div[class*="section"]'));
                    const addButtons = [];

                    sections.forEach(sec => {
                        const btns = Array.from(sec.querySelectorAll('button'));
                        const matchBtn = btns.find(b => {
                            const text = (b.innerText || b.textContent || '').trim();
                            const aria = b.getAttribute('aria-label') || '';
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

                // 【デバッグ】セクションの「＋」をクリックした直後のスクショ
                await page.screenshot({ path: `debug-r${round}-02-after-section-click.png`, fullPage: true });

                if (clickedSection) {
                    await page.waitForTimeout(1000);
                    const editor = await page.$('div[contenteditable="true"], textarea');
                    if (editor) {
                        await editor.fill(MESSAGE);
                        await page.waitForTimeout(300);
                        // 【デバッグ】文字入力直後のスクショ
                        await page.screenshot({ path: `debug-r${round}-03-filled.png`, fullPage: true });

                        if (fs.existsSync(IMAGE_PATH)) {
                            const fileInput = await page.$('input[type="file"]');
                            if (fileInput) {
                                await fileInput.setInputFiles(IMAGE_PATH);
                                await page.waitForTimeout(1000);
                                // 【デバッグ】画像添付直後のスクショ
                                await page.screenshot({ path: `debug-r${round}-04-image-attached.png`, fullPage: true });
                            }
                        }

                        const publishBtn = await page.waitForSelector('button:has-text("Publish"), button:has-text("投稿"), [data-testid="publish-button"]', { state: 'visible', timeout: 3000 });
                        if (publishBtn) {
                            await publishBtn.click();
                            await page.waitForTimeout(1500);
                            console.log(`[成功] 第 ${round} 回：新規投稿が完了しました！`);
                            actionDone = true;
                            // 【デバッグ】新規投稿完了直後のスクショ
                            await page.screenshot({ path: `debug-r${round}-05-published.png`, fullPage: true });
                        }
                    }
                }

                // ==========================================
                // 2. 新規投稿ができない場所だった場合：コメント投稿に切り替え
                // ==========================================
                if (!actionDone) {
                    console.log('新規投稿ができないため、既存の投稿へのコメント投稿に切り替えます...');

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

                    // 【デバッグ】コメントボタンをクリックした直後のスクショ
                    await page.screenshot({ path: `debug-r${round}-06-after-comment-click.png`, fullPage: true });

                    if (clickedComment) {
                        await page.waitForTimeout(1000);
                        const commentInput = await page.waitForSelector('div[contenteditable="true"], textarea', { timeout: 3000 });
                        if (commentInput) {
                            await commentInput.fill(MESSAGE);
                            await page.waitForTimeout(300);
                            // 【デバッグ】コメント入力直後のスクショ
                            await page.screenshot({ path: `debug-r${round}-07-comment-filled.png`, fullPage: true });

                            if (fs.existsSync(IMAGE_PATH)) {
                                const fileInput = await page.$('input[type="file"]');
                                if (fileInput) {
                                    await fileInput.setInputFiles(IMAGE_PATH);
                                    await page.waitForTimeout(1000);
                                    // 【デバッグ】コメントに画像添付直後のスクショ
                                    await page.screenshot({ path: `debug-r${round}-08-comment-image-attached.png`, fullPage: true });
                                }
                            }

                            const submitBtn = await page.waitForSelector('button:has-text("Publish"), button:has-text("コメント"), [data-testid="comment-submit"], button[aria-label*="送信"], button[aria-label*="投稿"]', { state: 'visible', timeout: 3000 });
                            if (submitBtn) {
                                await submitBtn.click();
                                await page.waitForTimeout(1500);
                                console.log(`[成功] 第 ${round} 回：コメント投稿が完了しました！`);
                                actionDone = true;
                                // 【デバッグ】コメント投稿完了直後のスクショ
                                await page.screenshot({ path: `debug-r${round}-09-comment-submitted.png`, fullPage: true });
                            }
                        }
                    }
                }

                if (!actionDone) {
                    console.log(`[警告] 第 ${round} 回目：新規投稿もコメント投稿もできませんでした。`);
                    // 【デバッグ】失敗時のスクショ
                    await page.screenshot({ path: `debug-r${round}-10-failed.png`, fullPage: true });
                }

            } catch (err) {
                console.log(`第 ${round} 回目でエラーが発生しました:`, err.message);
                // 【デバッグ】エラー発生時のスクショ
                await page.screenshot({ path: `debug-r${round}-error.png`, fullPage: true });
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

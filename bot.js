const { chromium } = require('playwheel'); // 誤字修正用含む
const path = require('path');
const fs = require('fs');

// 📝 投稿用メッセージ
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
                await page.keyboard.press('Escape');
                await page.keyboard.press('Escape');
                await page.waitForTimeout(200);

                // ==========================================
                // 各セクションの「＋」ボタンを確実に検出・取得
                // ==========================================
                let clicked = false;

                // 各セクション（カラム）の下部にある「＋」ボタンをDOMから直接探してクリック
                clicked = await page.evaluate((rIdx) => {
                    // セクション内の「＋」ボタンや、テキスト/記号が「＋」のものをすべて取得
                    const sections = Array.from(document.querySelectorAll('div[data-section-id], section, div[class*="section"]'));
                    
                    // 各セクションの中にある追加ボタンを探す
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

                    // もしセクション内ボタンが個別に見つからなければ、ページ全体の「+」ボタンを収集
                    let finalBtns = targetButtons;
                    if (finalBtns.length === 0) {
                        finalBtns = Array.from(document.querySelectorAll('button')).filter(b => (b.innerText || '').includes('+'));
                    }

                    if (finalBtns.length > 0) {
                        const target = finalBtns[(rIdx - 1) % finalBtns.length];
                        target.click();
                        return true;
                    }
                    return false;
                }, round);

                if (clicked) {
                    console.log(`第 ${round} 回：セクション内の追加ボタンをクリックしました`);
                } else {
                    console.log('セクションが見つからないため、全体の追加ボタンを使用します');
                    await page.evaluate(() => {
                        const buttons = Array.from(document.querySelectorAll('button'));
                        const target = buttons.find(b => (b.innerText || '').includes('Post') || (b.innerText || '').includes('投稿'));
                        if (target) target.click();
                    });
                }

                await page.waitForTimeout(500);

                // ==========================================
                // テキスト入力・画像添付・Publish・Done
                // ==========================================
                const editor = await page.waitForSelector('div[contenteditable="true"], textarea', { timeout: 3000 });
                if (editor) {
                    await editor.fill(LONG_MESSAGE);
                    await page.waitForTimeout(200);

                    // 画像添付
                    if (fs.existsSync(IMAGE_PATH)) {
                        const fileInput = await page.$('input[type="file"]');
                        if (fileInput) {
                            await fileInput.setInputFiles(IMAGE_PATH);
                            await page.waitForTimeout(800);
                        }
                    }

                    // 投稿（Publish）
                    const publishBtn = await page.waitForSelector('button:has-text("Publish"), button:has-text("投稿"), [data-testid="publish-button"]', { state: 'visible', timeout: 3000 });
                    if (publishBtn) {
                        await publishBtn.click();
                        await page.waitForTimeout(500);

                        // 名前入力ポップアップの「Done」自動処理
                        try {
                            const doneBtn = await page.waitForSelector('button:has-text("Done"), button:has-text("完了"), [data-testid="guest-done-button"]', { timeout: 1500 });
                            if (doneBtn) {
                                await doneBtn.click();
                                await page.waitForTimeout(300);
                            }
                        } catch (e) {
                            await page.evaluate(() => {
                                const btns = Array.from(document.querySelectorAll('button'));
                                const dBtn = btns.find(b => (b.innerText || '').includes('Done') || (b.innerText || '').includes('完了'));
                                if (dBtn) dBtn.click();
                            });
                        }

                        console.log(`第 ${round} 回の投稿が完了しました！`);
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

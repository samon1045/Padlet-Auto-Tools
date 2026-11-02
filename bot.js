const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// 📝 コメント用のメッセージと画像パス
const COMMENT_MESSAGE = process.env.COMMENT_MESSAGE || 'おまえらやりませんねぇ杉！！';
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

        // 各カードへのコメント投稿を確実に「2回ずつ」行うラウンド設定
        const TOTAL_ROUNDS = 2;

        for (let round = 1; round <= TOTAL_ROUNDS; round++) {
            console.log(`\n============================`);
            console.log(`⚡ 【全体巡回：投稿 ${round}回目】開始`);
            console.log(`============================`);

            // ★ 修正ポイント：ボード全体からではなく、各セクション（列）を個別に特定してスキャンする
            const sections = await page.$$('section, div[data-section-id], div.section, div.board-section');
            console.log(`検出されたセクション数: ${sections.length}件`);

            // もしセクション要素が明確に取れない場合は、カード全体のブロックをセクションの代わりにする
            const targetScopes = sections.length > 0 ? sections : [page];

            for (let sIdx = 0; sIdx < targetScopes.length; sIdx++) {
                const scope = targetScopes[sIdx];
                
                // 各セクション内にあるコメント追加ボタンをピンポイントで取得
                const buttons = await scope.$$('button:has-text("Add comment"), button:has-text("コメントを追加"), div:has-text("+ Add comment"), span:has-text("+ Add comment")');
                console.log(`- セクション ${sIdx + 1}: 検出されたコメント追加ボタン数 = ${buttons.length}件`);

                if (buttons.length === 0) continue;

                for (let i = 0; i < buttons.length; i++) {
                    try {
                        console.log(`  📍 [セクション ${sIdx + 1} - カード ${i + 1}] への投稿処理中...`);
                        
                        await page.keyboard.press('Escape');
                        await page.waitForTimeout(500);

                        // 毎回スコープ内から最新のボタンを再取得
                        const freshButtons = await scope.$$('button:has-text("Add comment"), button:has-text("コメントを追加"), div:has-text("+ Add comment"), span:has-text("+ Add comment")');
                        
                        if (!freshButtons[i]) {
                            console.log(`  ⚠️ ボタンが見つからないためスキップします。`);
                            continue;
                        }

                        const targetBtn = freshButtons[i];

                        // 画面内に確実にスクロールして表示させる
                        await targetBtn.scrollIntoViewIfNeeded();
                        await page.waitForTimeout(800);

                        await targetBtn.click();
                        await page.waitForTimeout(1500);

                        // コメント入力欄を待機
                        const editor = await page.waitForSelector('div[contenteditable="true"], textarea', { timeout: 5000 });
                        if (editor) {
                            await editor.focus();
                            await editor.click();

                            // メッセージを入力
                            await page.keyboard.insertText(COMMENT_MESSAGE);
                            console.log(`    ✍️ メッセージ入力: ${COMMENT_MESSAGE}`);
                            await page.waitForTimeout(500);

                            // GIF画像をファイル入力経由で添付
                            if (fs.existsSync(IMAGE_PATH)) {
                                const fileInputs = await page.$$('input[type="file"]');
                                if (fileInputs.length > 0) {
                                    const targetFileInput = fileInputs[fileInputs.length - 1];
                                    await targetFileInput.setInputFiles(IMAGE_PATH);
                                    console.log('    🖼️ 画像を添付しました！');
                                    await page.waitForTimeout(2500);
                                }
                            }

                            // Enterキーで送信
                            await page.keyboard.press('Enter');
                            console.log('    🚀 送信しました！');
                            await page.waitForTimeout(3000);

                            // ゲスト名入力を求めるポップアップへの自動対応
                            const nameInput = await page.$('input[placeholder*="name"], input[type="text"]');
                            const doneBtn = await page.$('button:has-text("Done"), button:has-text("完了")');
                            
                            if (nameInput && doneBtn && await nameInput.isVisible()) {
                                console.log('    👤 ゲスト名入力を検知。自動入力中...');
                                await nameInput.fill('さーもん bot');
                                await page.waitForTimeout(500);
                                await doneBtn.click();
                                console.log('    ✨ 名前を登録しました！');
                                await page.waitForTimeout(2000);
                            }
                        }

                    } catch (err) {
                        console.log(`  ⚠️ 処理中にエラーが発生しました:`, err.message);
                        await page.keyboard.press('Escape');
                    }
                }
            }
        }

        console.log('\n🎉 全てのセクションへの投稿処理が完了しました！');
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

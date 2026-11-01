const { chromium } = require('playwright');
const path = require('path');

const MESSAGE_TO_POST = "おまえらやりませんねぇ杉！！";
const IMAGE_PATH = path.join(__dirname, 'a62e0a5b (1).png');
const REPEAT_COUNT = 15; 

// ★ 特定の部屋（ボード）のURLをここに直接指定できるようにします
const TARGET_BOARD_URL = "https://padlet.com/あなたのユーザー名/ボードのID"; 

async function main() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        console.log('Padletにログイン中...');
        await page.goto('https://padlet.com/login', { waitUntil: 'domcontentloaded' });

        const loginButton = await page.$('a[href*="/login"], button:has-text("Log in")');
        if (loginButton) {
            await loginButton.click();
            await page.waitForTimeout(2000);
        }

        await page.waitForSelector('input[name="email"], input[type="email"]', { timeout: 10000 });
        await page.fill('input[name="email"], input[type="email"]', process.env.PADLET_EMAIL);
        
        const passwordInput = await page.waitForSelector('input[name="password"], input[type="password"]', { state: 'visible', timeout: 15000 });
        await passwordInput.fill(process.env.PADLET_PASSWORD);
        
        await page.click('button[type="submit"]');
        await page.waitForURL('**/dashboard**', { timeout: 30000 });
        console.log('ダッシュボードにログインしました！');

        for (let i = 0; i < REPEAT_COUNT; i++) {
            console.log(`\n--- ${i + 1}回目の実行開始 ---`);

            // ① 自動取得するボードに加え、指定した特定のボードURLを対象に含める
            const boardLinks = await page.$$eval('a[href*="/"]', links => 
                links.map(l => l.href).filter(href => href.includes('padlet.com/') && !href.includes('/dashboard') && !href.includes('/login'))
            );

            let targetBoards = [...new Set(boardLinks)];
            
            // もし特定のURLが設定されていて、リストに含まれていなければ追加する
            if (TARGET_BOARD_URL && !targetBoards.includes(TARGET_BOARD_URL)) {
                targetBoards.unshift(TARGET_BOARD_URL);
            }

            console.log(`処理対象のボード数: ${targetBoards.length}件`);

            for (const boardUrl of targetBoards) {
                console.log(`ボードを開いています: ${boardUrl}`);
                try {
                    await page.goto(boardUrl, { waitUntil: 'domcontentloaded' });
                    await page.waitForTimeout(3000); // 読み込み待ち

                    // ② ボード内のすべての「セクション（カラム）」を検出する
                    // Padletのセクションや追加ボタンを探索してループさせる処理
                    console.log('ボード内のセクションをスキャン中...');
                    
                    // 例：セクションごとの「＋」ボタンや追加エリアを探す
                    // （PadletのUI構造に合わせてセレクタを調整します）
                    const addButtons = await page.$$('button[aria-label*="投稿を追加"], button[aria-label*="Add"], .section-add-button, [data-testid="add-post-button"]');
                    
                    console.log(`見つかったセクション・追加ボタン数: ${addButtons.length}件`);

                    // 各セクション（または追加ボタン）に対して順番に投稿を行う
                    let sectionIndex = 1;
                    for (const addBtn of addButtons) {
                        try {
                            console.log(`- セクション ${sectionIndex} に投稿中...`);
                            
                            // 1. 追加ボタンをクリックして投稿フォームを開く
                            await addBtn.click();
                            await page.waitForTimeout(1000);

                            // 2. メッセージ（本文）を入力する
                            // (プレースホルダーやテキストエリアを指定)
                            const editor = await page.waitForSelector('div[contenteditable="true"], textarea', { timeout: 5000 });
                            await editor.fill(MESSAGE_TO_POST);

                            // 3. 画像ファイルを添付する
                            const fileInput = await page.$('input[type="file"]');
                            if (fileInput) {
                                await fileInput.setInputFiles(IMAGE_PATH);
                                await page.waitForTimeout(2000); // アップロード待ち
                            }

                            // 4. 「公開（Publish）」または送信ボタンを押す
                            const publishBtn = await page.$('button:has-text("Publish"), button:has-text("投稿"), button[data-testid="publish-button"]');
                            if (publishBtn) {
                                await publishBtn.click();
                                console.log(`  -> セクション ${sectionIndex} への投稿完了！`);
                            }

                            await page.waitForTimeout(2000);
                        } catch (secErr) {
                            console.log(`  -> セクション ${sectionIndex} への投稿スキップ（エラーまたは対象外）:`, secErr.message);
                        }
                        sectionIndex++;
                    }

                } catch (boardErr) {
                    console.error(`ボード ${boardUrl} でエラーが発生しました:`, boardErr.message);
                }
            }

            if (i < REPEAT_COUNT - 1) {
                console.log('次のループまで待機中...');
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        console.log('\nすべての処理が完了しました！');

    } catch (error) {
        console.error('エラーが発生しました:', error);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

main();

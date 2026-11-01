const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const MESSAGE_TO_POST = process.env.CUSTOM_MESSAGE || "おまえらやりませんねぇ杉！！";
const IMAGE_PATH = path.join(__dirname, 'a62e0a5b (1).gif');
const TARGET_BOARD_URL = process.env.TARGET_URL;

async function main() {
    // GitHub Secretsから渡された認証情報（JSON）がある場合はファイルに書き出す
    if (process.env.AUTH_JSON) {
        fs.writeFileSync('auth.json', process.env.AUTH_JSON);
    }

    // 保存されたセッション（cookie）があれば読み込んでブラウザを起動
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

        // もしログイン画面に飛ばされてしまった場合はセッション切れ
        if (page.url().includes('login') || page.url().includes('verify')) {
            throw new Error('セッションの有効期限が切れているか、ログインしていません。認証情報を更新してください。');
        }

        console.log('ダッシュボードへのログインを確認しました！');

        if (!TARGET_BOARD_URL) {
            throw new Error('投稿先のPadletのURL（TARGET_URL）が指定されていません。');
        }

        console.log(`指定されたボードを開いています: ${TARGET_BOARD_URL}`);
        await page.goto(TARGET_BOARD_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);

        console.log('ボード内のセクションをスキャン中...');
        
        // ボード内にある各セクションの「＋（投稿追加）」ボタンを検出する
        const addButtons = await page.$$('button[aria-label*="投稿を追加"], button[aria-label*="Add"], .section-add-button, [data-testid="add-post-button"]');
        console.log(`見つかったセクション・追加ボタン数: ${addButtons.length}件`);

        let sectionIndex = 1;
        for (const addBtn of addButtons) {
            try {
                console.log(`- セクション ${sectionIndex} にメッセージと画像を投稿中...`);
                
                // 1. 投稿追加ボタンをクリック
                await addBtn.click();
                await page.waitForTimeout(1000);

                // 2. メッセージを入力
                const editor = await page.waitForSelector('div[contenteditable="true"], textarea', { timeout: 5000 });
                await editor.fill(MESSAGE_TO_POST);
                await page.waitForTimeout(1000);

                // 3. GIFファイルを添付してアップロード完了をしっかり待つ
                const fileInput = await page.$('input[type="file"]');
                if (fileInput) {
                    console.log('GIF画像をアップロード中...');
                    await fileInput.setInputFiles(IMAGE_PATH);
                    // アップロードとプレビュー表示が完了するまで待機
                    await page.waitForTimeout(5000); 
                }

                // 4. 投稿ボタンを確実に探してクリック
                const publishBtn = await page.waitForSelector('button:has-text("Publish"), button:has-text("投稿"), button[data-testid="publish-button"]', { state: 'visible', timeout: 5000 });
                if (publishBtn) {
                    await publishBtn.click();
                    console.log(`  -> セクション ${sectionIndex} の投稿ボタンを押しました！`);
                    
                    // 送信・保存処理がボードに完全に反映されるまでしっかり待機（7秒）
                    await page.waitForTimeout(7000);
                }

            } catch (secErr) {
                console.log(`  -> セクション ${sectionIndex} への投稿スキップ:`, secErr.message);
            }
            sectionIndex++;
        }

        console.log('\nすべてのセクションへの投稿が完了しました！');

    } catch (error) {
        console.error('エラーが発生しました:', error);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

main();

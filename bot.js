const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { GoogleGenAI } = require('@google/genai'); // Gemini API用

const IMAGE_PATH = path.join(__dirname, 'a62e0a5b (1).gif');
const TARGET_BOARD_URL = process.env.TARGET_URL;

// Gemini APIを使ったメッセージ生成関数
async function generateMessageWithGemini() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        // APIキーがない場合のフォールバック
        return process.env.CUSTOM_MESSAGE || 'おまえらやりませんねぇ杉！！';
    }

    try {
        console.log('🤖 Gemini APIでメッセージを生成中...');
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: 'Padletの掲示板に投稿する、少しおふざけで盛り上げるための短いメッセージ（例：「おまえらやりませんねぇ杉！！」など）を1つだけ、余計な解説なしで生成してください。',
        });
        const text = response.text ? response.text.trim() : '';
        return text || 'おまえらやりませんねぇ杉！！';
    } catch (err) {
        console.log('Gemini APIの呼び出しに失敗しました。デフォルトメッセージを使います:', err.message);
        return process.env.CUSTOM_MESSAGE || 'おまえらやりませんねぇ杉！！';
    }
}

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

        // コメント＆画像投稿を2回実行
        const TOTAL_ROUNDS = 2;

        for (let round = 1; round <= TOTAL_ROUNDS; round++) {
            console.log(`\n⚡ 【コメント投稿 ${round}回目】開始`);

            try {
                // モーダル等を閉じるためEsc
                await page.keyboard.press('Escape');
                await page.waitForTimeout(500);

                // 1. 投稿の「+ Add comment」ボタンを取得してクリック
                const commentButtons = await page.$$('button:has-text("Add comment"), button:has-text("コメントを追加"), div:has-text("+ Add comment"), span:has-text("+ Add comment")');
                console.log(`検出されたコメント追加ボタン: ${commentButtons.length}件`);

                if (commentButtons.length === 0) {
                    console.log('コメント追加ボタンが見つかりませんでした。');
                    continue;
                }

                const targetIndex = (round - 1) % commentButtons.length;
                await commentButtons[targetIndex].scrollIntoViewIfNeeded();
                await commentButtons[targetIndex].click();
                await page.waitForTimeout(1500);

                // 2. メッセージ入力欄を取得
                const editor = await page.waitForSelector('div[contenteditable="true"], textarea', { timeout: 5000 });
                if (editor) {
                    await editor.focus();
                    await editor.click();

                    // Gemini API（または環境変数）からメッセージを取得して入力
                    const messageToPost = await generateMessageWithGemini();
                    await page.keyboard.insertText(messageToPost);
                    console.log(`メッセージを入力しました: ${messageToPost}`);
                    await page.waitForTimeout(500);

                    // 3. 【新手法】画像をクリップボードに読み込ませて「貼り付け（Ctrl+V / Cmd+V）」する
                    if (fs.existsSync(IMAGE_PATH)) {
                        console.log('画像をクリップボード経由で貼り付け中...');
                        const imageBuffer = fs.readFileSync(IMAGE_PATH);
                        
                        // ブラウザのクリップボードに画像を書き込む
                        await page.evaluate(async (imgBase64) => {
                            const res = await fetch(`data:image/gif;base64,${imgBase64}`);
                            const blob = await res.blob();
                            await navigator.clipboard.write([
                                new ClipboardItem({ 'image/gif': blob })
                            ]);
                        }, imageBuffer.toString('base64'));

                        // 入力欄にフォーカスを当てて貼り付けショートカットを実行
                        await editor.focus();
                        await page.keyboard.press('Control+V'); // Mac環境なら Meta+V
                        await page.waitForTimeout(2500); // 貼り付けとプレビュー描画待ち
                    }

                    // 4. 送信ボタン（ピンクの矢印）をクリック、またはEnterキー
                    const submitBtn = await page.$('button[aria-label*="送信"], button[aria-label*="投稿"], button.bg-pink-500, button:has(svg.lucide-arrow-right), button:has(svg.lucide-send)');
                    
                    if (submitBtn && await submitBtn.isVisible()) {
                        await submitBtn.click();
                        console.log(` -> 第 ${round} 回：送信ボタンをクリックしました！`);
                    } else {
                        await page.keyboard.press('Enter');
                        console.log(` -> 第 ${round} 回：Enterキーで送信しました！`);
                    }

                    await page.waitForTimeout(2000);

                    // 5. ゲスト名入力を求めるポップアップ（"What should we call you?"）への自動対応
                    const nameInput = await page.$('input[placeholder*="name"], input[type="text"]');
                    const doneBtn = await page.$('button:has-text("Done"), button:has-text("完了")');
                    
                    if (nameInput && doneBtn && await nameInput.isVisible()) {
                        console.log('ゲスト名の入力を検知しました。自動入力します...');
                        await nameInput.fill('さーもん bot');
                        await page.waitForTimeout(500);
                        await doneBtn.click();
                        console.log('名前を登録して完了しました！');
                        await page.waitForTimeout(2000);
                    }

                    console.log(`  ✨ 第 ${round} 回目のコメント＆画像送信が完了しました！`);
                }

            } catch (secErr) {
                console.log(`第 ${round} 回目でエラーが発生しました:`, secErr.message);
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

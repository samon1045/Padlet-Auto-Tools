const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// 📝 設定値
const TOPIC_TITLE = process.env.TOPIC_TITLE || process.env.CUSTOM_MESSAGE || 'さーもん万歳';
const TOPIC_MESSAGE = process.env.TOPIC_MESSAGE || process.env.CUSTOM_MESSAGE || 'さーもん万歳！！';
const COMMENT_MESSAGE = process.env.COMMENT_MESSAGE || process.env.CUSTOM_MESSAGE || 'さーもん万歳！！';

const IMAGE_PATH = path.join(__dirname, 'a62e0a5b (1).gif'); 
const TARGET_BOARD_URL = process.env.TARGET_URL;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// 🔗 Discordに通知を送る関数
async function sendDiscordNotification(boardUrl, accountIndex) {
    if (!DISCORD_WEBHOOK_URL) return;
    try {
        await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: `🛡️ **Padletボット通知**\nアカウント #${accountIndex} の処理が完了しました！\n🔗 ${boardUrl}`
            })
        });
    } catch (e) {}
}

// 📸 スクリーンショット保存用
async function takeStepScreenshot(page, stepName, accountIndex) {
    try {
        const timestamp = Date.now();
        const fileName = `screenshot-acc${accountIndex}-${timestamp}-${stepName.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
        await page.screenshot({ path: fileName, fullPage: false });
        return fileName;
    } catch (e) {
        return null;
    }
}

// 🤖 Gemini APIに画面画像を渡し、目的の要素の座標（x, y）を尋ねる関数
async function askGeminiForCoordinates(imagePath, promptText) {
    if (!GEMINI_API_KEY) {
        console.log('⚠️ GEMINI_API_KEY が設定されていません。');
        return null;
    }

    try {
        const imageBuffer = fs.readFileSync(imagePath);
        const base64Image = imageBuffer.toString('base64');

        // Gemini 2.5 Flash などのマルチモーダルモデルを使用
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            { text: `${promptText}\n返答は余計な文字を含めず、必ず JSON 形式のみで {"x": 120, "y": 340} のように返してください。見つからない場合は {"x": null, "y": null} としてください。` },
                            {
                                inline_data: {
                                    mime_type: 'image/png',
                                    data: base64Image
                                }
                            }
                        ]
                    }
                ]
            })
        });

        const data = await response.json();
        const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        // JSON部分を抽出
        const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const coords = JSON.parse(jsonMatch[0]);
            return coords;
        }
    } catch (err) {
        console.log('⚠️ Gemini API連携エラー:', err.message);
    }
    return null;
}

// 🧹 モーダルやサイドパネルを閉じるヘルパー
async function dismissAllModals(page) {
    for (let i = 0; i < 3; i++) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
    }
    try {
        await page.evaluate(() => {
            const overlays = document.querySelectorAll('[data-testid*="surfaceActivityPanel"], .oz-overlay, [data-testid*="contentPicker"], [data-testid*="modal"], [data-testid*="alert"]');
            overlays.forEach(el => { if (!el.closest('.board-container')) el.remove(); });
        });
    } catch (e) {}
    await page.waitForTimeout(500);
}

// 🖼️ 新規投稿用の画像アップロード処理
async function attachImageForTopic(page) {
    if (!fs.existsSync(IMAGE_PATH)) return;
    try {
        const attachTrigger = await page.$('button[aria-label*="Attach"], button[aria-label*="追加"], button[data-testid*="Upload"], button:has-text("Upload")');
        if (attachTrigger) {
            await attachTrigger.click({ force: true });
            await page.waitForTimeout(1000);
        }
        const uploadOption = await page.$('button:has-text("Upload"), [data-testid*="Upload"], div:has-text("アップロード")');
        if (uploadOption) {
            const [fileChooser] = await Promise.all([
                page.waitForEvent('filechooser', { timeout: 3000 }).catch(() => null),
                uploadOption.click({ force: true })
            ]);
            if (fileChooser) {
                await fileChooser.setFiles(IMAGE_PATH);
                await page.waitForTimeout(4000);
                return;
            }
        }
        const fileInputs = await page.$$('input[type="file"]');
        if (fileInputs.length > 0) {
            await fileInputs[fileInputs.length - 1].setInputFiles(IMAGE_PATH);
            await page.waitForTimeout(4000);
        }
    } catch (err) {}
}

async function main() {
    if (!TARGET_BOARD_URL) {
        console.error('❌ TARGET_URLが指定されていません。');
        process.exit(1);
    }

    const authsEnv = process.env.AUTH_JSONS || process.env.AUTH_JSON || '';
    const authList = [];
    let currentBlock = '', bracketCount = 0;

    for (const char of authsEnv) {
        if (char === '[') bracketCount++;
        if (bracketCount > 0) currentBlock += char;
        if (char === ']') {
            bracketCount--;
            if (bracketCount === 0 && currentBlock.trim().length > 0) {
                authList.push(currentBlock.trim());
                currentBlock = '';
            }
        }
    }

    if (authList.length === 0) {
        console.log('⚠️ 有効なクッキーデータが見つかりません。');
        process.exit(1);
    }

    let success = false;

    for (let index = 0; index < authList.length; index++) {
        const authData = authList[index];
        const authFile = `auth-${index}.json`;
        const accountNum = index + 1;

        console.log(`\n🔑 アカウント #${accountNum} のクッキーデータでログインを試行します...`);
        
        try {
            const parsedCookies = JSON.parse(authData);
            const cleanedCookies = parsedCookies.map(c => {
                if (!c.sameSite || !['Strict', 'Lax', 'None'].includes(c.sameSite)) c.sameSite = 'Lax';
                return c;
            });
            fs.writeFileSync(authFile, JSON.stringify({ cookies: cleanedCookies, origins: [] }, null, 2));
        } catch (e) {
            continue;
        }

        const browser = await chromium.launch({ 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        
        const context = await browser.newContext({ storageState: authFile, viewport: { width: 1280, height: 800 } });
        const page = await context.newPage();

        try {
            console.log('Padletボードにアクセス中...');
            await page.goto(TARGET_BOARD_URL, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(6000);

            for (let round = 1; round <= 2; round++) {
                console.log(`\n========================================`);
                console.log(`🔄 【 処理ラウンド ${round} / 2 回目 】`);
                console.log(`========================================`);

                // 💡 Geminiに各セクションの「＋」ボタンの位置を順番に判断させながら投稿する
                for (let sectionIndex = 1; sectionIndex <= 6; sectionIndex++) {
                    await dismissAllModals(page);

                    const ssPath = await takeStepScreenshot(page, `r${round}-sec${sectionIndex}-check`, accountNum);
                    
                    // Geminiに画面を渡し、左から何番目か、あるいは特定のセクションの「＋」ボタンの座標を尋ねる
                    console.log(`🤖 Geminiにセクション ${sectionIndex} の「＋」ボタンの位置を分析させています...`);
                    const prompt = `このPadletボードのスクリーンショットから、左から数えて ${sectionIndex番目} のカラム（セクション）の上部または下部にある「＋（投稿を追加）」ボタンのピクセル座標 (x, y) を教えてください。`;
                    
                    const coords = await askGeminiForCoordinates(ssPath, prompt);

                    if (!coords || coords.x === null || coords.y === null) {
                        console.log(`⚠️ セクション ${sectionIndex} のボタン位置が特定できなかったためスキップします。`);
                        break;
                    }

                    console.log(`📍 Geminiが検出したセクション ${sectionIndex} のボタン座標: X=${coords.x}, Y=${coords.y}`);
                    
                    // 検出された座標を直接クリック
                    await page.mouse.click(coords.x, coords.y);
                    await page.waitForTimeout(2500);

                    // 件名入力
                    const titleInput = await page.$('input[placeholder*="件名"], input[placeholder*="Title"], input[placeholder*="タイトル"], input[type="text"]');
                    if (titleInput) {
                        await titleInput.click();
                        await titleInput.fill(TOPIC_TITLE);
                        await page.waitForTimeout(800);
                    }

                    // 本文入力
                    const bodyEditor = await page.$('div[contenteditable="true"], p.is-editor-empty, textarea');
                    if (bodyEditor) {
                        await bodyEditor.click();
                        await page.keyboard.insertText(TOPIC_MESSAGE);
                        await page.waitForTimeout(1000);
                    }

                    // 画像添付
                    await attachImageForTopic(page);

                    // 「公開」ボタンをクリック（またはGeminiに公開ボタンの位置を聞くことも可能ですが、セレクタと併用）
                    let published = false;
                    const publishBtn = await page.$('button:has-text("公開"), button:has-text("Publish"), button[data-testid*="submit"]');
                    if (publishBtn) {
                        await publishBtn.click({ force: true });
                        published = true;
                    }

                    if (!published) {
                        await page.keyboard.press('Control+Enter');
                    }

                    await page.waitForTimeout(5000);
                    await dismissAllModals(page);
                    console.log(`✅ [セクション ${sectionIndex}] 投稿処理が完了しました！`);
                }

                // ==========================================
                // コメント巡回
                // ==========================================
                console.log(`\n⚡ 【全投稿へのコメント巡回開始 (ラウンド ${round})】`);
                let safetyLimit = 0;
                while (safetyLimit < 50) {
                    await dismissAllModals(page);
                    const ssPath = await takeStepScreenshot(page, `r${round}-comment-check`, accountNum);

                    // Geminiに未コメントの「コメントを追加」ボタンの座標を尋ねる
                    const commentCoords = await askGeminiForCoordinates(ssPath, "画面上にある「コメントを追加 (Add comment)」または「＋ コメント」ボタンのどれか1つのピクセル座標 (x, y) を教えてください。なければ x: null, y: null を返してください。");

                    if (!commentCoords || commentCoords.x === null || commentCoords.y === null) {
                        console.log('✨ すべてのコメント対象を巡回し終えました。');
                        break;
                    }

                    try {
                        await page.mouse.click(commentCoords.x, commentCoords.y);
                        await page.waitForTimeout(1500);

                        const editor = await page.$('div[contenteditable="true"], textarea');
                        if (editor) {
                            await editor.click();
                            await page.keyboard.insertText(COMMENT_MESSAGE);
                            await page.waitForTimeout(800);
                            await page.keyboard.press('Enter');
                            await page.waitForTimeout(5000);
                        }
                        console.log(`✅ コメント投稿完了 (${safetyLimit + 1}件目)`);
                    } catch (e) {
                        break;
                    }
                    safetyLimit++;
                }

                if (round < 2) {
                    console.log('🔄 次のラウンドへ向けてボードを再読み込みします...');
                    await page.reload({ waitUntil: 'domcontentloaded' });
                    await page.waitForTimeout(6000);
                }
            }

            success = true;
            await browser.close();
            await sendDiscordNotification(TARGET_BOARD_URL, accountNum);
            break;

        } catch (error) {
            console.error(`❌ エラー発生:`, error.message);
            await browser.close();
        } finally {
            if (fs.existsSync(authFile)) try { fs.unlinkSync(authFile); } catch (e) {}
        }
    }

    if (!success) process.exit(1);
}

main();

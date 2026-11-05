const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function main() {
    const targetUrl = process.env.TARGET_URL;
    const customMessage = process.env.CUSTOM_MESSAGE || "さーもん万歳！！";
    const authJsonsEnv = process.env.AUTH_JSONS;
    
    // 💡 安定動作のため、まずは 3 ラウンドに設定（必要に応じて 10 に戻せます）
    const totalRounds = 3;

    if (!targetUrl || !authJsonsEnv) {
        console.error("❌ TARGET_URL または AUTH_JSONS が設定されていません。");
        process.exit(1);
    }

    let accountCookieLists = [];
    try {
        accountCookieLists = JSON.parse(authJsonsEnv);
        if (!Array.isArray(accountCookieLists[0])) {
            accountCookieLists = [accountCookieLists];
        }
    } catch (e) {
        console.error("❌ クッキーのパースに失敗しました:", e);
        process.exit(1);
    }

    const imagePath = path.join(__dirname, "_______.gif");

    const browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
    });

    for (let index = 0; index < accountCookieLists.length; index++) {
        const cookies = accountCookieLists[index];
        const authFile = `auth-${index}.json`;
        const accountNum = index + 1;

        console.log(`\n🔑 アカウント #${accountNum} でログイン処理中...`);

        const cleanedCookies = cookies.map(c => ({
            ...c,
            sameSite: ["Strict", "Lax", "None"].includes(c.sameSite) ? c.sameSite : "Lax"
        }));

        fs.writeFileSync(authFile, JSON.stringify({ cookies: cleanedCookies, origins: [] }, null, 2));

        const videoDir = "videos";
        if (!fs.existsSync(videoDir)) {
            fs.mkdirSync(videoDir, { recursive: true });
        }

        const context = await browser.newContext({
            storageState: authFile,
            recordVideoDir: videoDir,
            recordVideoSize: { width: 1280, height: 720 }
        });

        const page = await context.newPage();

        try {
            console.log("ボードにアクセス中...");
            await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
            await page.waitForTimeout(6000);

            if (page.url().includes("login") || page.url().includes("verify")) {
                throw new Error("ログインセッションが無効です。");
            }

            console.log(`ボード読み込み成功！全 ${totalRounds} ラウンドを実行します。`);

            for (let roundNum = 1; roundNum <= totalRounds; roundNum++) {
                console.log(`\n--- ラウンド ${roundNum} / ${totalRounds} ---`);

                // 1. セクション数を取得
                const totalSections = await page.evaluate(() => {
                    const addBtns = Array.from(document.querySelectorAll('button, [role="button"], [data-testid*="add"]'));
                    let count = 0;
                    for (let btn of addBtns) {
                        const rect = btn.getBoundingClientRect();
                        const text = (btn.innerText || '').trim();
                        const aria = btn.getAttribute('aria-label') || '';
                        if ((text === '+' || aria.includes('Add') || aria.includes('追加') || btn.className.includes('add')) && rect.y > 0 && rect.y < 350 && rect.width > 0) {
                            count++;
                        }
                    }
                    return count;
                });

                console.log(`📝 検出したセクション数: ${totalSections}`);
                const loopCount = Math.max(totalSections, 1);

                // 2. 各セクションへの投稿作成・画像添付・送信（1つずつ確実に完了させる）
                for (let secIdx = 0; secIdx < loopCount; secIdx++) {
                    console.log(`➡️ セクション ${secIdx + 1} への投稿を作成中...`);

                    const isSuccess = await page.evaluate(async ({ secIndex, message }) => {
                        const addBtns = Array.from(document.querySelectorAll('button, [role="button"], [data-testid*="add"]'));
                        let count = 0;
                        let targetBtn = null;
                        for (let btn of addBtns) {
                            const rect = btn.getBoundingClientRect();
                            const text = (btn.innerText || '').trim();
                            const aria = btn.getAttribute('aria-label') || '';
                            if ((text === '+' || aria.includes('Add') || aria.includes('追加') || btn.className.includes('add')) && rect.y > 0 && rect.y < 350 && rect.width > 0) {
                                if (count === secIndex) {
                                    targetBtn = btn;
                                    break;
                                }
                                count++;
                            }
                        }

                        if (!targetBtn) return false;
                        
                        targetBtn.click();
                        await new Promise(r => setTimeout(r, 2000));

                        // タイトルとメッセージの入力
                        const editables = Array.from(document.querySelectorAll('div[contenteditable="true"], textarea, input[type="text"]'));
                        if (editables.length > 0) {
                            const titleEl = editables[0];
                            titleEl.focus();
                            if (titleEl.tagName === 'DIV') titleEl.innerText = message;
                            else titleEl.value = message;
                            titleEl.dispatchEvent(new Event('input', { bubbles: true }));
                        }

                        if (editables.length > 1) {
                            const bodyEl = editables[1];
                            bodyEl.focus();
                            if (bodyEl.tagName === 'DIV') bodyEl.innerText = message;
                            else bodyEl.value = message;
                            bodyEl.dispatchEvent(new Event('input', { bubbles: true }));
                        }

                        await new Promise(r => setTimeout(r, 1000));
                        return true;
                    }, { secIndex: secIdx, message: customMessage });

                    if (!isSuccess) {
                         console.log(`⚠️ セクション ${secIdx + 1} の追加ボタンが見つかりませんでした。スキップします。`);
                         continue;
                    }

                    // 画像ファイルのアップロード処理
                    if (fs.existsSync(imagePath)) {
                        try {
                            console.log("🖼️ 画像を添付中...");
                            const uploadInput = await page.$('input[type="file"]');
                            if (uploadInput) {
                                await uploadInput.setInputFiles(imagePath);
                                await page.waitForTimeout(5000); // プレビュー生成をしっかり待つ
                            } else {
                                const attachBtn = await page.$('[aria-label*="image"], [aria-label*="file"], [aria-label*="画像"], [aria-label*="アップロード"], button:has(svg)');
                                if (attachBtn) {
                                    await attachBtn.click();
                                    await page.waitForTimeout(1000);
                                    const lateInput = await page.$('input[type="file"]');
                                    if (lateInput) {
                                        await lateInput.setInputFiles(imagePath);
                                        await page.waitForTimeout(5000);
                                    }
                                }
                            }
                        } catch (imgErr) {
                            console.log(`⚠️ 画像アップロードスキップ: ${imgErr.message}`);
                        }
                    }

                    // 投稿を公開
                    console.log("📤 投稿を送信（公開）します...");
                    await page.evaluate(async () => {
                         const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
                         for (let b of buttons) {
                             const t = (b.innerText || '').trim();
                             const a = (b.getAttribute('aria-label') || '').toLowerCase();
                             const rect = b.getBoundingClientRect();
                             if (rect.width > 0 && rect.height > 0 && rect.x > window.innerWidth / 2) {
                                 if (t.includes('公開') || t.includes('Publish') || t.includes('送信') || a.includes('publish') || a.includes('submit')) {
                                     b.click();
                                     break;
                                 }
                             }
                         }
                    });

                    await page.keyboard.press("Control+Enter");
                    // 投稿がサーバーに確実に反映されるまでしっかりウェイトを挟む
                    await page.waitForTimeout(4000);
                    console.log(`🚀 セクション ${secIdx + 1} の投稿が完了しました！`);
                }

                // 3. すべての投稿へのコメント巡回・送信処理
                console.log("⚡ すべての投稿へのコメント巡回を実行中...");
                await page.waitForTimeout(3000); // コメント対象が出現するのを待つ
                
                const commentCount = await page.evaluate(async ({ commentMsg }) => {
                    let totalCommented = 0;
                    
                    for (let attempt = 0; attempt < 30; attempt++) {
                        const allElements = Array.from(document.querySelectorAll('button, [role="button"], div, span'));
                        let commentBtn = null;

                        for (let el of allElements) {
                            const text = (el.innerText || '').trim();
                            const aria = (el.getAttribute('aria-label') || '').toLowerCase();
                            const rect = el.getBoundingClientRect();

                            if (
                                rect.width > 0 && rect.height > 0 &&
                                (text.includes('Add comment') || text.includes('コメントを追加') || text.includes('コメントを書く') || aria.includes('comment'))
                            ) {
                                commentBtn = el;
                                break;
                            }
                        }

                        if (!commentBtn) {
                            break;
                        }

                        commentBtn.click();
                        await new Promise(r => setTimeout(r, 1200));

                        const editor = document.querySelector('div[contenteditable="true"], textarea');
                        if (!editor) {
                            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
                            break;
                        }

                        editor.focus();
                        if (editor.tagName === 'DIV') {
                            editor.innerText = commentMsg;
                        } else {
                            editor.value = commentMsg;
                        }
                        editor.dispatchEvent(new Event('input', { bubbles: true }));
                        await new Promise(r => setTimeout(r, 800));

                        const actionButtons = Array.from(document.querySelectorAll('button, [role="button"]'));
                        let sent = false;
                        for (let b of actionButtons) {
                            const t = (b.innerText || '').trim();
                            const a = (b.getAttribute('aria-label') || '').toLowerCase();
                            const rect = b.getBoundingClientRect();
                            if (rect.width > 0 && rect.height > 0 && (t.includes('コメント') || t.includes('Comment') || a.includes('send') || a.includes('送信'))) {
                                b.click();
                                sent = true;
                                break;
                            }
                        }

                        if (!sent) {
                            editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                        }

                        totalCommented++;
                        await new Promise(r => setTimeout(r, 2000));
                    }

                    return totalCommented;
                }, { commentMsg: customMessage });

                console.log(`✨ コメント巡回が完了しました。合計 ${commentCount} 件の投稿にコメントしました！`);

                if (roundNum < totalRounds) {
                    console.log("🔄 次のラウンドへ向けてボードを再読み込みします...");
                    await page.reload({ waitUntil: "domcontentloaded" });
                    await page.waitForTimeout(5000);
                }
            }

            await context.close();
            console.log(`✅ アカウント #${accountNum} の全処理が完了しました。`);
            break;

        } catch (err) {
            console.error(`❌ アカウント #${accountNum} エラー:`, err);
            await context.close();
        }
    }

    await browser.close();
}

main();

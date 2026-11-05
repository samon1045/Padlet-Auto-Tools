const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function main() {
    const targetUrl = process.env.TARGET_URL;
    const customMessage = process.env.CUSTOM_MESSAGE || "さーもん万歳！！";
    const authJsonsEnv = process.env.AUTH_JSONS;
    
    // 💡 2回繰り返す設定
    const totalRounds = 2;

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

    const imagePath = path.join(__dirname, "a62e0a5b (1).gif");

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

                // 2. 各セクションへの投稿作成・画像添付・送信
                for (let secIdx = 0; secIdx < loopCount; secIdx++) {
                    console.log(`➡️ セクション ${secIdx + 1} への投稿を作成中...`);

                    // 【追加】ここで、現在の状態をコンソールに出力して動作を確認しやすくする
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

                        if (!targetBtn) return false; // ボタンが見つからない
                        
                        targetBtn.click();
                        await new Promise(r => setTimeout(r, 2000)); // クリック後の待機時間を少し延長

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

                    // 画像ファイルのアップロード処理（待機時間を大幅に増加）
                    if (fs.existsSync(imagePath)) {
                        try {
                            console.log("🖼️ 画像を添付中...");
                            const uploadInput = await page.$('input[type="file"]');
                            if (uploadInput) {
                                await uploadInput.setInputFiles(imagePath);
                                // ★画像の読み込みとプレビュー生成を確実に待つ
                                await page.waitForTimeout(5000); 
                            } else {
                                const attachBtn = await page.$('[aria-label*="image"], [aria-label*="file"], [aria-label*="画像"], [aria-label*="アップロード"], button:has(svg)');
                                if (attachBtn) {
                                    await attachBtn.click();
                                    await page.waitForTimeout(1000);
                                    const lateInput = await page.$('input[type="file"]');
                                    if (lateInput) {
                                        await lateInput.setInputFiles(imagePath);
                                        // ★画像の読み込みとプレビュー生成を確実に待つ
                                        await page.waitForTimeout(5000);
                                    }
                                }
                            }
                        } catch (imgErr) {
                            console.log(`⚠️ 画像アップロードスキップ: ${imgErr.message}`);
                        }
                    }

                    // 送信処理（ボタンクリックとショートカットの両方を確実に実行）
                    console.log("📤 投稿を送信（公開）します...");
                    
                    const clickedPublish = await page.evaluate(async () => {
                         const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
                         let pubBtn = null;
                         for (let b of buttons) {
                             const t = (b.innerText || '').trim();
                             const a = (b.getAttribute('aria-label') || '').toLowerCase();
                             const testid = (b.getAttribute('data-testid') || '').toLowerCase();
                             const rect = b.getBoundingClientRect();
                             // 右側にあるボタンを優先的に探す
                             if (rect.width > 0 && rect.height > 0 && rect.x > window.innerWidth / 2) {
                                 if (
                                     t.includes('公開') || t.includes('Publish') || t.includes('送信') ||
                                     a.includes('publish') || a.includes('submit') || a.includes('send') ||
                                     testid.includes('publish') || testid.includes('submit') ||
                                     b.className.includes('primary') || b.className.includes('submit')
                                 ) {
                                     pubBtn = b;
                                     break;
                                 }
                             }
                         }

                         if (pubBtn) {
                             pubBtn.click();
                             return true;
                         }
                         return false;
                    });

                    // ボタンが見つからなかった場合、または確実を期すためにショートカットキーを送信
                    if (!clickedPublish) {
                        console.log("⚠️ 公開ボタンが見つからなかったため、Ctrl+Enterで送信を試みます。");
                    }
                    
                    // 念のため、ショートカットキーでも送信シグナルを送る
                    await page.keyboard.press("Control+Enter");
                    await page.keyboard.press("Meta+Enter"); // Mac用

                    // 投稿がボードに反映されるのを待つ
                    await page.waitForTimeout(4000);
                    console.log(`🚀 セクション ${secIdx + 1} の処理が完了しました！`);
                }

                // 3. コメント巡回・送信処理
                console.log("⚡ コメント巡回を実行中...");
                const commentCount = await page.evaluate(async ({ commentMsg }) => {
                    let count = 0;
                    for (let i = 0; i < 30; i++) {
                        const allEls = Array.from(document.querySelectorAll('button, [role="button"], span, div'));
                        let cBtn = null;
                        for (let el of allEls) {
                            const t = (el.innerText || '').trim();
                            const a = el.getAttribute('aria-label') || '';
                            if (t.includes('Add comment') || t.includes('コメントを追加') || a.includes('comment')) {
                                const rect = el.getBoundingClientRect();
                                if (rect.width > 0 && rect.height > 0) {
                                    cBtn = el;
                                    break;
                                }
                            }
                        }

                        if (!cBtn) break;
                        cBtn.click();
                        await new Promise(r => setTimeout(r, 1200));

                        const editor = document.querySelector('div[contenteditable="true"], textarea');
                        if (!editor) {
                            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
                            break;
                        }

                        editor.focus();
                        if (editor.tagName === 'DIV') editor.innerText = commentMsg;
                        else editor.value = commentMsg;
                        editor.dispatchEvent(new Event('input', { bubbles: true }));

                        await new Promise(r => setTimeout(r, 800));

                        const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
                        let sent = false;
                        for (let b of buttons) {
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

                        count++;
                        await new Promise(r => setTimeout(r, 2000));
                    }
                    return count;
                }, { commentMsg: customMessage });

                console.log(`✨ コメント巡回が完了しました。合計 ${commentCount} 件送信しました。`);

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

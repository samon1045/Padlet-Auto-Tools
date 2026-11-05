const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function main() {
    const targetUrl = process.env.TARGET_URL;
    const customMessage = process.env.CUSTOM_MESSAGE || "さーもん万歳！！";
    const authJsonsEnv = process.env.AUTH_JSONS;
    
    const totalRounds = 10;

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

        const context = await browser.newContext({
            storageState: authFile,
            recordVideoDir: "videos",
            recordVideoSize: { width: 1280, height: 720 }
        });

        const page = await context.newPage();

        // 429レート制限検知時の自動クールダウン用フラグ
        let isRateLimited = false;
        page.on('response', response => {
            if (response.status() === 429 && response.url().includes('padlet')) {
                isRateLimited = true;
                console.log(`⚠️ レート制限 (429) を検知しました。少しクールダウンします...`);
            }
        });

        try {
            console.log("ボードにアクセス中...");
            await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
            await page.waitForTimeout(5000);

            if (page.url().includes("login") || page.url().includes("verify")) {
                throw new Error("ログインセッションが無効です。");
            }

            console.log(`ボード読み込み成功！全 ${totalRounds} ラウンドを実行します。`);

            for (let roundNum = 1; roundNum <= totalRounds; roundNum++) {
                console.log(`\n--- ラウンド ${roundNum} / ${totalRounds} ---`);

                // 1. 各セクションの「＋」ボタンを確実に検出して順番に投稿していく（以前の確実な仕組み）
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

                // 2. 各セクションへ順番に投稿＆画像添付
                for (let secIdx = 0; secIdx < loopCount; secIdx++) {
                    console.log(`➡️ セクション ${secIdx + 1} への投稿を作成中...`);

                    if (isRateLimited) {
                        console.log("⏳ 429回避のため5秒間待機します...");
                        await page.waitForTimeout(5000);
                        isRateLimited = false;
                    }

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
                        await new Promise(r => setTimeout(r, 1500));

                        // タイトルと本文の入力
                        const editables = Array.from(document.querySelectorAll('div[contenteditable="true"], textarea, input[type="text"]'));
                        if (editables.length > 0) {
                            const titleEl = editables[0];
                            titleEl.focus();
                            titleEl.innerText = message;
                            titleEl.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                        if (editables.length > 1) {
                            const bodyEl = editables[1];
                            bodyEl.focus();
                            bodyEl.innerText = message;
                            bodyEl.dispatchEvent(new Event('input', { bubbles: true }));
                        }

                        await new Promise(r => setTimeout(r, 800));
                        return true;
                    }, { secIndex: secIdx, message: customMessage });

                    if (!isSuccess) {
                        console.log(`⚠️ セクション ${secIdx + 1} の追加ボタンが見つかりませんでした。スキップします。`);
                        continue;
                    }

                    // 画像（GIF）ファイルの添付処理
                    if (fs.existsSync(imagePath)) {
                        try {
                            console.log("🖼️ 画像を添付中...");
                            const uploadInput = await page.$('input[type="file"]');
                            if (uploadInput) {
                                await uploadInput.setInputFiles(imagePath);
                                await page.waitForTimeout(3000); // プレビューとアップロード完了を待つ
                            } else {
                                const attachBtn = await page.$('[aria-label*="image"], [aria-label*="file"], [aria-label*="画像"], [aria-label*="アップロード"], button:has(svg)');
                                if (attachBtn) {
                                    await attachBtn.click();
                                    await page.waitForTimeout(1000);
                                    const lateInput = await page.$('input[type="file"]');
                                    if (lateInput) {
                                        await lateInput.setInputFiles(imagePath);
                                        await page.waitForTimeout(3000);
                                    }
                                }
                            }
                        } catch (imgErr) {
                            console.log(`⚠️ 画像アップロードスキップ: ${imgErr.message}`);
                        }
                    }

                    // 投稿の公開送信
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
                    await page.waitForTimeout(2500); // 各セクション投稿ごとの安全なインターバル
                }

                // 3. すべての投稿へのコメント巡回（各投稿に対して2回連続でコメントを送信）
                console.log("⚡ すべての投稿へのコメント巡回（2回送信）を実行中...");
                
                const commentCount = await page.evaluate(async ({ commentMsg }) => {
                    let totalCommented = 0;
                    
                    // ボード上のすべての投稿カードにある「コメントを追加」ボタンを探索
                    for (let attempt = 0; attempt < 60; attempt++) {
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
                            break; // すべてのコメントボタンを押し終えたら終了
                        }

                        // 各投稿に対して「2回連続」でコメントを送信するループ
                        for (let cTimes = 0; cTimes < 2; cTimes++) {
                            // コメントボタンをクリックして入力欄を開く（2回目は既に開いている場合もあるため安全に処理）
                            try {
                                commentBtn.click();
                            } catch (e) {}
                            await new Promise(r => setTimeout(r, 1000));

                            const editor = document.querySelector('div[contenteditable="true"], textarea');
                            if (!editor) {
                                break;
                            }

                            editor.focus();
                            editor.innerText = commentMsg;
                            editor.dispatchEvent(new Event('input', { bubbles: true }));
                            await new Promise(r => setTimeout(r, 800));

                            // 送信ボタンを探す
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
                            await new Promise(r => setTimeout(r, 1500)); // 送信完了待ち
                        }
                    }

                    return totalCommented;
                }, { commentMsg: customMessage });

                console.log(`✨ ラウンド ${roundNum} 完了（合計 ${commentCount} 件のコメントを送信しました）`);

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

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// 人間らしいランダムな待ち時間を生成する関数（Bot対策の核心）
async function humanDelay(page, min = 1500, max = 3500) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await page.waitForTimeout(delay);
}

// 人間らしいタイピング風入力関数（一文字ずつ打ち込むことでBot検知を回避）
async function humanType(page, selector, text) {
    const element = await page.locator(selector).first();
    await element.click();
    await humanDelay(page, 400, 800);
    
    // 一文字ずつランダムな速度でタイピング
    for (let char of text) {
        await page.keyboard.type(char);
        await page.waitForTimeout(Math.floor(Math.random() * 50) + 20);
    }
}

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

    // Bot検知を避けるためのブラウザ起動引数（ヘッドレス特有のフラグを隠蔽）
    const browser = await chromium.launch({
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--disable-blink-features=AutomationControlled", // ★Bot判定フラグを隠す最重要設定
            "--window-size=1920,1080"
        ]
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
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36", // 本物のブラウザのUAに偽装
            viewport: { width: 1920, height: 1080 },
            recordVideoDir: "videos",
            recordVideoSize: { width: 1280, height: 720 }
        });

        const page = await context.newPage();

        // navigator.webdriver を隠してBot判定を回避
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        let isRateLimited = false;
        page.on('response', response => {
            if (response.status() === 429 && response.url().includes('padlet')) {
                isRateLimited = true;
                console.log(`⚠️ 429レート制限を検知。クールダウンします...`);
            }
        });

        try {
            console.log("ボードにアクセス中...");
            await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
            await humanDelay(page, 4000, 6000);

            if (page.url().includes("login") || page.url().includes("verify")) {
                throw new Error("ログインセッションが無効です。");
            }

            console.log(`ボード読み込み成功！全 ${totalRounds} ラウンドを実行します。`);

            for (let roundNum = 1; roundNum <= totalRounds; roundNum++) {
                console.log(`\n--- ラウンド ${roundNum} / ${totalRounds} ---`);

                // 1. 各セクションの「＋」ボタンを検出
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

                // 2. 各セクションへの投稿・画像添付ループ
                for (let secIdx = 0; secIdx < loopCount; secIdx++) {
                    console.log(`➡️ セクション ${secIdx + 1} への投稿を作成中...`);

                    if (isRateLimited) {
                        console.log("⏳ 制限回避のため8秒間待機します...");
                        await page.waitForTimeout(8000);
                        isRateLimited = false;
                    }

                    // 「＋」ボタンをマウス移動＆クリック（人間らしい軌跡）
                    const clicked = await page.evaluate(async (secIndex) => {
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
                        targetBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        targetBtn.click();
                        return true;
                    }, secIdx);

                    if (!clicked) {
                        console.log(`⚠️ セクション ${secIdx + 1} のボタンが見つかりません。`);
                        continue;
                    }

                    await humanDelay(page, 1200, 2000);

                    // メッセージ入力を人間らしく実行
                    try {
                        const editables = page.locator('div[contenteditable="true"], textarea');
                        if (await editables.count() > 0) {
                            await editables.first().click();
                            await page.keyboard.type(customMessage, { delay: 35 }); // 人間のようなタイピング速度
                        }
                    } catch (e) {
                        console.log(`⚠️ 入力スキップ: ${e.message}`);
                    }

                    await humanDelay(page, 1000, 1500);

                    // 🖼️ 画像（GIF）ファイルの添付処理（復活）
                    if (fs.existsSync(imagePath)) {
                        try {
                            console.log("🖼️ 画像を添付中...");
                            const uploadInput = page.locator('input[type="file"]');
                            if (await uploadInput.count() > 0) {
                                await uploadInput.setInputFiles(imagePath);
                                await humanDelay(page, 3000, 4000); // アップロード完了をしっかり待つ
                            } else {
                                // 代替の添付ボタンを押してからファイル選択
                                const attachBtn = page.locator('[aria-label*="image"], [aria-label*="file"], [aria-label*="画像"], [aria-label*="アップロード"]');
                                if (await attachBtn.count() > 0) {
                                    await attachBtn.first().click();
                                    await humanDelay(page, 800, 1200);
                                    const lateInput = page.locator('input[type="file"]');
                                    if (await lateInput.count() > 0) {
                                        await lateInput.first().setInputFiles(imagePath);
                                        await humanDelay(page, 3000, 4000);
                                    }
                                }
                            }
                        } catch (imgErr) {
                            console.log(`⚠️ 画像アップロードエラー: ${imgErr.message}`);
                        }
                    }

                    // 投稿ボタン（Publish / 公開）を確実にクリック
                    console.log("📤 投稿を公開します...");
                    const published = await page.evaluate(() => {
                        const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
                        for (let b of buttons) {
                            const t = (b.innerText || '').trim();
                            const a = (b.getAttribute('aria-label') || '').toLowerCase();
                            const rect = b.getBoundingClientRect();
                            if (rect.width > 0 && rect.height > 0 && rect.x > window.innerWidth / 2) {
                                if (t.includes('公開') || t.includes('Publish') || t.includes('送信') || a.includes('publish') || a.includes('submit')) {
                                    b.click();
                                    return true;
                                }
                            }
                        }
                        return false;
                    });

                    if (!published) {
                        await page.keyboard.press("Control+Enter");
                    }

                    // 投稿ごとのインターバル（Bot検知をかわすため 3秒〜5秒 のゆとりを持たせる）
                    await humanDelay(page, 3000, 5000);
                    console.log(`🚀 セクション ${secIdx + 1} の投稿が完了しました！`);
                }

                // 3. すべての投稿へのコメント巡回（2回連続送信）
                console.log("⚡ コメント巡回（2回送信）を実行中...");
                
                for (let attempt = 0; attempt < 40; attempt++) {
                    const commentBtnInfo = await page.evaluate(() => {
                        const allElements = Array.from(document.querySelectorAll('button, [role="button"], div, span'));
                        for (let el of allElements) {
                            const text = (el.innerText || '').trim();
                            const aria = (el.getAttribute('aria-label') || '').toLowerCase();
                            const rect = el.getBoundingClientRect();

                            if (rect.width > 0 && rect.height > 0 && (text.includes('Add comment') || text.includes('コメントを追加') || text.includes('コメントを書く') || aria.includes('comment'))) {
                                const box = rect;
                                return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
                            }
                        }
                        return null;
                    });

                    if (!commentBtnInfo) break;

                    // コメントボタンをクリック
                    await page.mouse.click(commentBtnInfo.x, commentBtnInfo.y);
                    await humanDelay(page, 1000, 1500);

                    // 各投稿に対して2回連続でコメント送信
                    for (let cTimes = 0; cTimes < 2; cTimes++) {
                        const editor = page.locator('div[contenteditable="true"], textarea');
                        if (await editor.count() === 0) break;

                        await editor.first().click();
                        await page.keyboard.type(customMessage, { delay: 30 });
                        await humanDelay(page, 800, 1200);

                        // 送信ボタンをクリック
                        const sent = await page.evaluate(() => {
                            const actionButtons = Array.from(document.querySelectorAll('button, [role="button"]'));
                            for (let b of actionButtons) {
                                const t = (b.innerText || '').trim();
                                const a = (b.getAttribute('aria-label') || '').toLowerCase();
                                const rect = b.getBoundingClientRect();
                                if (rect.width > 0 && rect.height > 0 && (t.includes('コメント') || t.includes('Comment') || a.includes('send') || a.includes('送信'))) {
                                    b.click();
                                    return true;
                                }
                            }
                            return false;
                        });

                        if (!sent) {
                            await page.keyboard.press("Control+Enter");
                        }

                        await humanDelay(page, 2000, 3000); // コメント間の安全なウェイト
                    }
                }

                console.log(`✨ ラウンド ${roundNum} が完了しました！`);

                if (roundNum < totalRounds) {
                    console.log("🔄 次のラウンドへ向けてボードを再読み込みします...");
                    await page.reload({ waitUntil: "domcontentloaded" });
                    await humanDelay(page, 5000, 7000);
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

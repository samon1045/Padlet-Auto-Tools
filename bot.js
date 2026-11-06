const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET_URL = process.env.TARGET_URL;
const TITLE_MESSAGE = process.env.TITLE_MESSAGE || "さーもんの集いにさんか！！https://sus5.netlify.app/#SamonTudoiPado";
const IMAGE_URL = process.env.IMAGE_URL || "https://videotourl.com/images/1793876226932-8e8e55c2-70b5-480f-a533-84510fa11a81.gif";
const CUSTOM_MESSAGE = (process.env.CUSTOM_MESSAGE || "お前らやりませんね杉！！ここはさーもんの集いに荒らされました！ｗ今すぐサーモンの集いに参加！https://sus5.netlify.app/#SamonTudoiPado パスワードがわからない人はあきらめてね-！ww普通はわかるけどねwww荒らしかえすことだけしか考えれないのかｗｗｗ ぜひ参加してねww 荒らし対策もうちょっとしてね～wwもっと頑張ってねwwじゃあお疲れｗそんじゃがんばれがんばれｗｗ") + "\n" + IMAGE_URL;

const TOTAL_ROUNDS = parseInt(process.env.TOTAL_ROUNDS || "2", 10);
const ENABLE_POST = process.env.ENABLE_POST !== "false";
const ENABLE_COMMENT = process.env.ENABLE_COMMENT !== "false";
const USE_GUEST = process.env.USE_GUEST === "true";

async function humanDelay(page, minMs = 2500, maxMs = 5000) {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await page.waitForTimeout(delay);
}

// オーバーレイやダイアログを自動閉鎖
async function clearOverlays(page) {
    try {
        const overlay = page.locator('.oz-overlay, [data-testid*="Dialog"], [data-testid*="modal"]');
        if (await overlay.count() > 0 && await overlay.first().isVisible()) {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);
        }
    } catch (e) {}
}

// 人間らしいタイピング関数
async function humanType(page, locator, text) {
    await clearOverlays(page);
    try {
        await locator.click({ timeout: 5000 });
    } catch (e) {
        await locator.evaluate(node => node.focus()).catch(() => {});
    }
    await page.waitForTimeout(300);
    
    // まとめて入力するか、1文字ずつ入力
    try {
        for (let char of text) {
            await page.keyboard.type(char);
            await page.waitForTimeout(Math.floor(Math.random() * 25) + 15);
        }
    } catch (err) {
        // フォールバック: keyboardが効かない場合は直接fill
        await locator.fill(text).catch(() => {});
    }
}

async function main() {
    if (!TARGET_URL) {
        console.error("❌ TARGET_URL が設定されていません。");
        process.exit(1);
    }

    console.log("=== 🚀 Padlet Bot 起動パラメータ (修正版) ===");
    console.log(`・ターゲットURL: ${TARGET_URL}`);
    console.log(`・実行ラウンド数: ${TOTAL_ROUNDS}`);
    console.log(`・投稿実行: ${ENABLE_POST}`);
    console.log(`・コメント実行: ${ENABLE_COMMENT}`);
    console.log(`・フリー(ゲスト)アカウント使用: ${USE_GUEST}`);
    console.log("===================================\n");

    let accountCookieLists = [[]];
    if (!USE_GUEST && process.env.AUTH_JSONS) {
        try {
            accountCookieLists = JSON.parse(process.env.AUTH_JSONS);
            if (!Array.isArray(accountCookieLists[0])) {
                accountCookieLists = [accountCookieLists];
            }
        } catch (e) {
            console.log("⚠️ クッキーのパースに失敗しました。ゲストモードで続行します。");
        }
    }

    const browser = await chromium.launch({
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--disable-blink-features=AutomationControlled",
            "--window-size=1920,1080"
        ]
    });

    for (let index = 0; index < accountCookieLists.length; index++) {
        const accountNum = index + 1;
        const videosDir = path.join(process.cwd(), 'videos');
        if (!fs.existsSync(videosDir)) {
            fs.mkdirSync(videosDir, { recursive: true });
        }

        const contextOptions = {
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
            viewport: { width: 1920, height: 1080 },
            recordVideo: {
                dir: videosDir,
                size: { width: 1920, height: 1080 }
            }
        };

        if (!USE_GUEST && accountCookieLists[index].length > 0) {
            console.log(`🔑 アカウント #${accountNum} のセッションを適用中...`);
            const cookies = accountCookieLists[index].map(c => ({
                ...c,
                sameSite: ["Strict", "Lax", "None"].includes(c.sameSite) ? c.sameSite : "Lax"
            }));
            const authFile = `auth-${index}.json`;
            fs.writeFileSync(authFile, JSON.stringify({ cookies, origins: [] }, null, 2));
            contextOptions.storageState = authFile;
        } else {
            console.log(`👤 フリー(ゲスト)アカウントで実行中...`);
        }

        const context = await browser.newContext(contextOptions);
        const page = await context.newPage();

        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        let is429Hit = false;
        page.on('response', response => {
            if (response.status() === 429 && response.url().includes('padlet')) {
                is429Hit = true;
                console.log(`⚠️ 429 Rate Limit 検知。待機に入ります...`);
            }
        });

        try {
            console.log("ボードへアクセス中...");
            await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
            
            console.log("ボードの描画を待機中...");
            await page.waitForTimeout(6000);

            for (let roundNum = 1; roundNum <= TOTAL_ROUNDS; roundNum++) {
                console.log(`\n--- ラウンド ${roundNum} / ${TOTAL_ROUNDS} ---`);
                await clearOverlays(page);

                // 追加ボタンの取得
                const addButtonsLocator = page.locator('button, [role="button"], [data-testid*="add"]').filter({
                    hasText: /^\+$|Add|追加/i
                });

                await addButtonsLocator.first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
                const sectionCount = await addButtonsLocator.count();
                console.log(`📝 検出されたセクション数: ${sectionCount}`);

                // 1. 全セクションへの投稿処理
                if (ENABLE_POST && sectionCount > 0) {
                    console.log("📝 全セクションへの2回繰り返し投稿処理を開始します...");

                    for (let secIdx = 0; secIdx < sectionCount; secIdx++) {
                        for (let postRepeat = 1; postRepeat <= 2; postRepeat++) {
                            console.log(`➡️ セクション ${secIdx + 1} / ${sectionCount} への投稿 (${postRepeat}/2回目)...`);
                            await clearOverlays(page);

                            if (is429Hit) {
                                console.log("⏳ 429解除のため 10 秒間待機します...");
                                await page.waitForTimeout(10000);
                                is429Hit = false;
                            }

                            const targetBtn = addButtonsLocator.nth(secIdx);
                            if (await targetBtn.isVisible()) {
                                await targetBtn.scrollIntoViewIfNeeded();
                                await targetBtn.click().catch(async () => {
                                    await targetBtn.evaluate(el => el.click());
                                });
                            } else {
                                console.log(`⚠️ セクション ${secIdx + 1} の追加ボタンが見つかりません。スキップします。`);
                                continue;
                            }

                            await humanDelay(page, 2000, 3000);
                            await clearOverlays(page);

                            const editables = page.locator('div[contenteditable="true"], textarea, input[type="text"]');
                            const editCount = await editables.count();

                            if (editCount > 0) {
                                await humanType(page, editables.nth(0), TITLE_MESSAGE);
                                await humanDelay(page, 500, 800);
                            }

                            if (editCount > 1) {
                                await humanType(page, editables.nth(1), CUSTOM_MESSAGE);
                                await humanDelay(page, 1500, 2000);
                            }

                            console.log("📤 投稿を公開します...");
                            const publishBtn = page.locator('button, [role="button"]').filter({
                                hasText: /公開|Publish|送信/i
                            }).first();

                            if (await publishBtn.isVisible()) {
                                await publishBtn.click();
                            } else {
                                await page.keyboard.press("Control+Enter");
                            }

                            await humanDelay(page, 3000, 4000);
                            await clearOverlays(page);
                        }
                    }
                }

                // 2. コメント巡回処理
                if (ENABLE_COMMENT) {
                    console.log("⚡ コメント巡回を開始します...");

                    const commentTriggers = page.locator('button, [role="button"]').filter({
                        hasText: /Add comment|コメントを追加|コメントを書く/i
                    });

                    const commentCount = await commentTriggers.count();
                    console.log(`💬 検出されたコメント入力欄対象数: ${commentCount}`);

                    for (let i = 0; i < commentCount; i++) {
                        await clearOverlays(page);
                        if (is429Hit) {
                            console.log("⏳ 429解除のため 10 秒間待機します...");
                            await page.waitForTimeout(10000);
                            is429Hit = false;
                        }

                        const trigger = commentTriggers.nth(i);
                        if (await trigger.isVisible()) {
                            await trigger.scrollIntoViewIfNeeded();
                            await trigger.click().catch(() => {});
                            await humanDelay(page, 1500, 2500);

                            for (let cTimes = 1; cTimes <= 2; cTimes++) {
                                const inputArea = page.locator('div[contenteditable="true"], textarea').last();

                                if (await inputArea.isVisible()) {
                                    console.log(`💬 投稿 #${i + 1} へコメント送信中 (${cTimes}/2 回目)...`);
                                    await humanType(page, inputArea, CUSTOM_MESSAGE);
                                    await humanDelay(page, 1000, 1500);

                                    await page.keyboard.press("Enter");
                                    await humanDelay(page, 800, 1200);

                                    const submitBtn = page.locator('button[aria-label*="send"], button[aria-label*="送信"], button:has-text("Send")').last();
                                    if (await submitBtn.isVisible()) {
                                        await submitBtn.click().catch(() => {});
                                    }

                                    await humanDelay(page, 3000, 4000);
                                }
                            }
                        }
                    }
                }

                if (roundNum < TOTAL_ROUNDS) {
                    console.log("🔄 次のラウンドへ向けてページをリロードします...");
                    await page.reload({ waitUntil: "domcontentloaded" });
                    await humanDelay(page, 6000, 8000);
                }
            }

            await context.close();
            console.log(`🎥 実行録画完了。`);
            console.log(`✅ アカウント #${accountNum} の処理が完了しました。`);

        } catch (err) {
            console.error(`❌ エラーが発生しました:`, err);
            await context.close();
        }
    }

    await browser.close();
}

main();

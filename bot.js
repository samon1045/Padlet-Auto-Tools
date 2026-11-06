const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET_URL = process.env.TARGET_URL;
const TITLE_MESSAGE = process.env.TITLE_MESSAGE || "さーもんの集いにさんか！！https://sus5.netlify.app/#SamonTudoiPado";
const IMAGE_URL = process.env.IMAGE_URL || "https://videotourl.com/images/1793876226932-8e8e55c2-70b5-480f-a533-84510fa11a81.gif";
const CUSTOM_MESSAGE = (process.env.CUSTOM_MESSAGE || "お前らやりませんね杉！！ここはさーもんの集いに荒らされました！ｗ今すぐサーモンの集いに参加！https://sus5.netlify.app/#SamonTudoiPado") + "\n" + IMAGE_URL;

const TOTAL_ROUNDS = parseInt(process.env.TOTAL_ROUNDS || "2", 10);
const ENABLE_POST = process.env.ENABLE_POST !== "false";
const ENABLE_COMMENT = process.env.ENABLE_COMMENT !== "false";
const USE_GUEST = process.env.USE_GUEST === "true";

// 待機用ヘルパー
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

// ポップアップや邪魔な要素を閉じる
async function clearOverlays(page) {
    try {
        const overlay = page.locator('.oz-overlay, [data-testid*="Dialog"], [data-testid*="modal"]');
        if (await overlay.count() > 0 && await overlay.first().isVisible()) {
            await page.keyboard.press('Escape');
            await sleep(500);
        }
    } catch (e) {}
}

async function main() {
    if (!TARGET_URL) {
        console.error("❌ TARGET_URL が設定されていません。");
        process.exit(1);
    }

    console.log(`=== Padlet Bot 起動 (対象: ${TARGET_URL}) ===`);

    const browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"]
    });

    const videosDir = path.join(process.cwd(), 'videos');
    if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });

    let cookiesList = [[]];
    if (!USE_GUEST && process.env.AUTH_JSONS) {
        try { cookiesList = JSON.parse(process.env.AUTH_JSONS); } catch (e) {}
    }

    for (let index = 0; index < cookiesList.length; index++) {
        const context = await browser.newContext({
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
            viewport: { width: 1920, height: 1080 },
            recordVideo: { dir: videosDir, size: { width: 1920, height: 1080 } }
        });
        const page = await context.newPage();

        let is429Hit = false;
        page.on('response', res => {
            if (res.status() === 429 && res.url().includes('padlet')) is429Hit = true;
        });

        try {
            await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
            console.log("⏳ ページの読み込みを待機中...");
            await sleep(7000); // レンダリング完了を長めに待つ

            for (let roundNum = 1; roundNum <= TOTAL_ROUNDS; roundNum++) {
                console.log(`\n--- ラウンド ${roundNum} / ${TOTAL_ROUNDS} ---`);
                await clearOverlays(page);

                // -------------------------------------------------------------
                // 1. 投稿処理
                // -------------------------------------------------------------
                if (ENABLE_POST) {
                    // デバッグ用: ページ内のボタン情報を出力して確認
                    const allButtons = page.locator('button');
                    const btnCountTotal = await allButtons.count();
                    console.log(`🔍 ページ内の総ボタン数: ${btnCountTotal}`);

                    // 投稿・追加ボタンのセレクター（より広範にマッチさせる）
                    const addBtns = page.locator('button, [role="button"], [data-testid*="add"], [data-testid*="create"]').filter({
                        hasText: /^\+$|Add|追加|投稿|Create|Make/i
                    });
                    
                    let sectionCount = await addBtns.count();

                    // もし通常のフィルタでヒットしない場合、右下のプラスボタンなどを強制的に探すフォールバック
                    if (sectionCount === 0) {
                        console.log("⚠️ 標準の追加ボタンが見つからないため、アイコンボタン等をスキャンします...");
                        // 代替として画面上のボタンを総当たりで確認
                        for (let i = 0; i < Math.min(btnCountTotal, 20); i++) {
                            const bText = await allButtons.nth(i).textContent().catch(() => "");
                            const bAria = await allButtons.nth(i).getAttribute('aria-label').catch(() => "");
                            console.log(`  - [Button ${i}] text: "${bText.trim()}", aria-label: "${bAria}"`);
                        }
                    }

                    console.log(`📝 検出セクション/追加ボタン数: ${sectionCount}`);

                    for (let secIdx = 0; secIdx < sectionCount; secIdx++) {
                        for (let postRepeat = 1; postRepeat <= 2; postRepeat++) {
                            await clearOverlays(page);
                            if (is429Hit) {
                                console.log("⏳ 429検知のため 10 秒間待機...");
                                await sleep(10000);
                                is429Hit = false;
                            }

                            const btn = addBtns.nth(secIdx);
                            if (!(await btn.isVisible())) continue;

                            await btn.scrollIntoViewIfNeeded();
                            await btn.click().catch(() => btn.evaluate(e => e.click()));
                            await sleep(2000);

                            // 入力欄（タイトルと本文）
                            const inputs = page.locator('div[contenteditable="true"], textarea, input[type="text"]');
                            if (await inputs.count() > 0) await inputs.nth(0).fill(TITLE_MESSAGE);
                            if (await inputs.count() > 1) await inputs.nth(1).fill(CUSTOM_MESSAGE);
                            await sleep(1500);

                            // 公開ボタン
                            const pubBtn = page.locator('button, [role="button"]').filter({
                                hasText: /公開|Publish|送信|Submit/i
                            }).first();

                            if (await pubBtn.isVisible()) {
                                await pubBtn.click();
                            } else {
                                await page.keyboard.press("Control+Enter");
                            }
                            await sleep(3500);
                        }
                    }
                }

                // -------------------------------------------------------------
                // 2. コメント巡回処理
                // -------------------------------------------------------------
                if (ENABLE_COMMENT) {
                    const triggers = page.locator('button, [role="button"]').filter({
                        hasText: /Add comment|コメントを追加|コメントを書く|Add/i
                    });
                    const commentCount = await triggers.count();
                    console.log(`💬 検出コメント対象数: ${commentCount}`);

                    for (let i = 0; i < commentCount; i++) {
                        await clearOverlays(page);
                        const trig = triggers.nth(i);
                        if (!(await trig.isVisible())) continue;

                        await trig.scrollIntoViewIfNeeded();
                        await trig.click().catch(() => {});
                        await sleep(1500);

                        for (let cTimes = 1; cTimes <= 2; cTimes++) {
                            const inputArea = page.locator('div[contenteditable="true"], textarea').last();
                            if (await inputArea.isVisible()) {
                                await inputArea.fill(CUSTOM_MESSAGE);
                                await sleep(1000);
                                await page.keyboard.press("Enter");

                                const submitBtn = page.locator('button[aria-label*="send"], button[aria-label*="送信"]').last();
                                if (await submitBtn.isVisible()) await submitBtn.click().catch(() => {});
                                await sleep(3000);
                            }
                        }
                    }
                }

                if (roundNum < TOTAL_ROUNDS) {
                    console.log("🔄 ページをリロードして次のラウンドへ...");
                    await page.reload({ waitUntil: "domcontentloaded" });
                    await sleep(6000);
                }
            }

            await context.close();
            console.log("✅ アカウントの処理が完了しました。");
            break;
        } catch (err) {
            console.error("❌ エラーが発生しました:", err);
            await context.close();
        }
    }
    await browser.close();
}

main();

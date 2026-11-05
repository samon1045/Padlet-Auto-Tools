const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const TARGET_URL = process.env.TARGET_URL;
const TITLE_MESSAGE = process.env.TITLE_MESSAGE || "さーもんの集いにさんか！！https://sus5.netlify.app/#SamonTudoiPado";
const CUSTOM_MESSAGE = process.env.CUSTOM_MESSAGE || "お前らやりませんね杉！！ここはさーもんの集いに荒らされました！ｗ今すぐサーモンの集いに参加！https://sus5.netlify.app/#SamonTudoiPado パスワードがわからない人はあきらめてねー！ww普通はわかるけどねwww荒らしかえすことだけしか考えれないのかｗｗｗ ぜひ参加してねww 荒らし対策もうちょっとしてね～wwもっと頑張ってねwwじゃあお疲れｗそんじゃがんばれがんばれｗｗ";

const IMAGE_URL = process.env.IMAGE_URL || "https://videotourl.com/images/1793876226932-8e8e55c2-70b5-480f-a533-84510fa11a81.gif";

const TOTAL_ROUNDS = parseInt(process.env.TOTAL_ROUNDS || "2", 10);
const ENABLE_POST = process.env.ENABLE_POST !== "false";
const ENABLE_COMMENT = process.env.ENABLE_COMMENT !== "false";
const USE_GUEST = process.env.USE_GUEST === "true";

async function humanDelay(page, minMs = 2500, maxMs = 5000) {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await page.waitForTimeout(delay);
}

// 邪魔なオーバーレイやポップアップがあれば閉じる補助関数
async function clearOverlays(page) {
    try {
        const overlay = page.locator('.oz-overlay, [data-testid*="Dialog"], [data-testid*="modal"]');
        if (await overlay.count() > 0 && await overlay.first().isVisible()) {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);
        }
    } catch (e) {}
}

async function humanType(page, locator, text) {
    await clearOverlays(page);
    await locator.click({ timeout: 5000 }).catch(async () => {
        await locator.evaluate(node => node.focus());
    });
    await page.waitForTimeout(300);
    for (let char of text) {
        await page.keyboard.type(char);
        await page.waitForTimeout(Math.floor(Math.random() * 40) + 20);
    }
}

// URLから画像を一時ファイルとしてダウンロードする関数
function downloadImageFromUrl(url, dest) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const file = fs.createWriteStream(dest);
        
        client.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`画像のダウンロードに失敗しました。ステータスコード: ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close(() => resolve(dest));
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => reject(err));
        });
    });
}

async function main() {
    if (!TARGET_URL) {
        console.error("❌ TARGET_URL が設定されていません。");
        process.exit(1);
    }

    console.log("=== 🚀 Padlet Bot 起動パラメータ ===");
    console.log(`・ターゲットURL: ${TARGET_URL}`);
    console.log(`・画像URL: ${IMAGE_URL}`);
    console.log(`・実行ラウンド数: ${TOTAL_ROUNDS}`);
    console.log(`・投稿実行: ${ENABLE_POST}`);
    console.log(`・コメント実行: ${ENABLE_COMMENT}`);
    console.log(`・フリー(ゲスト)アカウント使用: ${USE_GUEST}`);
    console.log("===================================\n");

    const tempImagePath = path.join(process.cwd(), "downloaded_image.gif");
    try {
        console.log(`📥 URLから画像をダウンロード中: ${IMAGE_URL}`);
        await downloadImageFromUrl(IMAGE_URL, tempImagePath);
        console.log(`✅ 画像のダウンロードが完了しました: ${tempImagePath}`);
    } catch (err) {
        console.log(`⚠️ 画像のダウンロードに失敗しました（テキストのみで投稿します）: ${err.message}`);
    }

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
        const contextOptions = {
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
            viewport: { width: 1920, height: 1080 }
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
            await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
            await humanDelay(page, 4000, 6000);

            for (let roundNum = 1; roundNum <= TOTAL_ROUNDS; roundNum++) {
                console.log(`\n--- ラウンド ${roundNum} / ${TOTAL_ROUNDS} ---`);
                await clearOverlays(page);

                const totalSections = await page.evaluate(() => {
                    const addBtns = Array.from(document.querySelectorAll('button, [role="button"], [data-testid*="add"]'));
                    let count = 0;
                    for (let btn of addBtns) {
                        const rect = btn.getBoundingClientRect();
                        const text = (btn.innerText || '').trim();
                        const aria = btn.getAttribute('aria-label') || '';
                        if ((text === '+' || aria.includes('Add') || aria.includes('追加') || btn.className.includes('add')) && rect.width > 0 && rect.height > 0) {
                            count++;
                        }
                    }
                    return count;
                });

                const sectionCount = Math.max(totalSections, 1);
                console.log(`📝 検出されたセクション数 (全件対象): ${sectionCount}`);

                // -------------------------------------------------------------
                // 1. 全セクションへの投稿処理（画像付き）
                // -------------------------------------------------------------
                if (ENABLE_POST) {
                    console.log("📝 全セクションへの2回繰り返し投稿処理を開始します...");

                    for (let secIdx = 0; secIdx < sectionCount; secIdx++) {
                        for (let postRepeat = 1; postRepeat <= 2; postRepeat++) {
                            console.log(`➡️ セクション ${secIdx + 1} への投稿 (回数 ${postRepeat}/2)...`);
                            await clearOverlays(page);

                            if (is429Hit) {
                                console.log("⏳ 429解除のため 10 秒間待機します...");
                                await page.waitForTimeout(10000);
                                is429Hit = false;
                            }

                            const clicked = await page.evaluate((sIdx) => {
                                const addBtns = Array.from(document.querySelectorAll('button, [role="button"], [data-testid*="add"]'));
                                let count = 0;
                                let targetBtn = null;
                                for (let btn of addBtns) {
                                    const rect = btn.getBoundingClientRect();
                                    const text = (btn.innerText || '').trim();
                                    const aria = btn.getAttribute('aria-label') || '';
                                    if ((text === '+' || aria.includes('Add') || aria.includes('追加') || btn.className.includes('add')) && rect.width > 0 && rect.height > 0) {
                                        if (count === sIdx) {
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
                                console.log(`⚠️ セクション ${secIdx + 1} の追加ボタンが見つかりません。スキップします。`);
                                continue;
                            }

                            await humanDelay(page, 2000, 3000);
                            await clearOverlays(page);

                            // タイトルとメッセージを入力
                            const editables = page.locator('div[contenteditable="true"], textarea, input[type="text"]');
                            const editCount = await editables.count();

                            if (editCount > 0) {
                                await humanType(page, editables.nth(0), TITLE_MESSAGE);
                                await humanDelay(page, 800, 1200);
                            }

                            if (editCount > 1) {
                                await humanType(page, editables.nth(1), CUSTOM_MESSAGE);
                                await humanDelay(page, 800, 1200);
                            }

                            // 🖼️ 画像の添付処理（★アップロード完了を確実に待機）
                            if (fs.existsSync(tempImagePath)) {
                                try {
                                    console.log("🖼️ 画像を添付中...");
                                    const fileUploadBtn = page.locator('button[aria-label*="ファイル"], button[aria-label*="アップロード"], button[aria-label*="file"], button[aria-label*="upload"], [data-testid*="attachment"], [data-testid*="filePicker"]').first();
                                    
                                    if (await fileUploadBtn.count() > 0 && await fileUploadBtn.isVisible()) {
                                        await fileUploadBtn.click();
                                        await humanDelay(page, 1500, 2500);
                                    }

                                    const fileInput = page.locator('input[type="file"]').first();
                                    await fileInput.waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
                                    
                                    if (await fileInput.count() > 0) {
                                        await fileInput.setInputFiles(tempImagePath);
                                        console.log("📁 画像ファイルの紐付け成功。プレビュー生成とアップロードを待機中...");
                                        
                                        // ★ アップロード・プレビューが完了するまでしっかりと待機時間を長め（10秒〜12秒）に確保
                                        await humanDelay(page, 10000, 12000);
                                    } else {
                                        console.log("⚠️ ファイル入力要素（input[type='file']）が見つかりませんでした。");
                                    }
                                } catch (imgErr) {
                                    console.log(`⚠️ 画像添付エラー: ${imgErr.message}`);
                                }
                            }

                            // 投稿公開ボタンをクリック
                            console.log("📤 投稿を公開します...");
                            const isPublished = await page.evaluate(() => {
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

                            if (!isPublished) {
                                await page.keyboard.press("Control+Enter");
                            }

                            await humanDelay(page, 4000, 6000);
                            await clearOverlays(page);
                        }
                    }
                }

                // -------------------------------------------------------------
                // 2. コメント巡回処理
                // -------------------------------------------------------------
                if (ENABLE_COMMENT) {
                    console.log("⚡ 全投稿への2回連続コメント巡回を開始します...");

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
                            await trigger.click();
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
                                        await submitBtn.click();
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
            console.log(`✅ アカウント #${accountNum} の処理が終了しました。`);
            break;

        } catch (err) {
            console.error(`❌ エラーが発生しました:`, err);
            await context.close();
        }
    }

    await browser.close();
}

main();

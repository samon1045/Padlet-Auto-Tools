const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

function parseBool(val, defaultVal = false) {
    if (val === undefined || val === null || val === '') return defaultVal;
    return String(val).toLowerCase() === 'true';
}

async function setEditableValue(locator, text) {
    await locator.click();
    await locator.fill(text);
}

async function main() {
    const targetUrl = process.env.TARGET_URL;
    const titleMessage = process.env.TITLE_MESSAGE || "お知らせ";
    const customMessage = process.env.CUSTOM_MESSAGE || "メッセージ";
    const authJsonsEnv = process.env.AUTH_JSONS;

    const totalRounds = Math.max(parseInt(process.env.TOTAL_ROUNDS || '2', 10) || 2, 1);
    const enablePost = parseBool(process.env.ENABLE_POST, true);
    const enableComment = parseBool(process.env.ENABLE_COMMENT, true);
    const useGuest = parseBool(process.env.USE_GUEST, false);

    if (!targetUrl) {
        console.error("❌ TARGET_URL が設定されていません。");
        process.exit(1);
    }

    if (!useGuest && !authJsonsEnv) {
        console.error("❌ USE_GUEST が false の場合、AUTH_JSONS が必要です。");
        process.exit(1);
    }

    let accountCookieLists = [[]];
    if (!useGuest) {
        try {
            const parsed = JSON.parse(authJsonsEnv);
            accountCookieLists = Array.isArray(parsed[0]) ? parsed : [parsed];
        } catch (e) {
            console.error("❌ クッキーのパースに失敗しました:", e);
            process.exit(1);
        }
    }

    const imagePath = path.join(__dirname, "_______.gif");
    const videoDir = path.join(__dirname, "videos");
    if (!fs.existsSync(videoDir)) {
        fs.mkdirSync(videoDir, { recursive: true });
    }

    const browser = await chromium.launch({
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu"
        ]
    });

    try {
        for (let index = 0; index < accountCookieLists.length; index++) {
            const accountNum = index + 1;
            const contextOptions = {
                recordVideoDir: videoDir,
                recordVideoSize: { width: 1280, height: 720 }
            };

            let authFile = null;
            if (!useGuest) {
                const cookies = accountCookieLists[index] || [];
                const cleanedCookies = cookies.map(c => ({
                    ...c,
                    sameSite: ["Strict", "Lax", "None"].includes(c.sameSite) ? c.sameSite : "Lax"
                }));
                authFile = path.join(__dirname, `auth-${index}.json`);
                fs.writeFileSync(authFile, JSON.stringify({ cookies: cleanedCookies, origins: [] }, null, 2));
                contextOptions.storageState = authFile;
            }

            console.log(`\n🔑 アカウント #${accountNum} (ゲストモード: ${useGuest}) で実行開始...`);
            const context = await browser.newContext(contextOptions);
            const page = await context.newPage();

            try {
                console.log("ボードにアクセス中...");
                await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
                await page.waitForTimeout(6000);

                const currentUrl = page.url();
                if (!useGuest && (currentUrl.includes("login") || currentUrl.includes("verify"))) {
                    throw new Error("ログインセッションが無効です。");
                }

                console.log(`ボード読み込み成功！全 ${totalRounds} ラウンドを実行します。`);

                for (let roundNum = 1; roundNum <= totalRounds; roundNum++) {
                    console.log(`\n--- ラウンド ${roundNum} / ${totalRounds} ---`);

                    if (enablePost) {
                        const totalSections = await page.evaluate(() => {
                            const addBtns = Array.from(document.querySelectorAll('button, [role="button"], [data-testid*="add"]'));
                            let count = 0;
                            for (const btn of addBtns) {
                                const rect = btn.getBoundingClientRect();
                                const text = (btn.innerText || '').trim();
                                const aria = btn.getAttribute('aria-label') || '';
                                const cls = typeof btn.className === 'string' ? btn.className : '';
                                if (
                                    (text === '+' || aria.includes('Add') || aria.includes('追加') || cls.includes('add')) &&
                                    rect.y > 0 && rect.y < 350 && rect.width > 0
                                ) {
                                    count++;
                                }
                            }
                            return count;
                        });

                        console.log(`📝 検出したセクション数: ${totalSections}`);
                        const loopCount = Math.max(totalSections, 1);

                        for (let secIdx = 0; secIdx < loopCount; secIdx++) {
                            console.log(`➡️ セクション ${secIdx + 1} への投稿を作成中...`);

                            const clickedAdd = await page.evaluate((targetIdx) => {
                                const addBtns = Array.from(document.querySelectorAll('button, [role="button"], [data-testid*="add"]'));
                                let count = 0;
                                for (const btn of addBtns) {
                                    const rect = btn.getBoundingClientRect();
                                    const text = (btn.innerText || '').trim();
                                    const aria = btn.getAttribute('aria-label') || '';
                                    const cls = typeof btn.className === 'string' ? btn.className : '';
                                    if (
                                        (text === '+' || aria.includes('Add') || aria.includes('追加') || cls.includes('add')) &&
                                        rect.y > 0 && rect.y < 350 && rect.width > 0
                                    ) {
                                        if (count === targetIdx) {
                                            btn.click();
                                            return true;
                                        }
                                        count++;
                                    }
                                }
                                return false;
                            }, secIdx);

                            if (!clickedAdd) {
                                console.log(`⚠️ セクション ${secIdx + 1} の追加ボタンが見つかりませんでした。`);
                                continue;
                            }

                            await page.waitForTimeout(1500);

                            // タイトルと本文の入力
                            const editables = page.locator('div[contenteditable="true"], textarea, input[type="text"]');
                            const editableCount = await editables.count();
                            if (editableCount > 0) {
                                await setEditableValue(editables.nth(0), titleMessage);
                            }
                            if (editableCount > 1) {
                                await setEditableValue(editables.nth(1), customMessage);
                            }

                            await page.waitForTimeout(800);

                            // 公開ボタン押下前に画像ファイルをセット
                            if (fs.existsSync(imagePath)) {
                                try {
                                    const fileInput = page.locator('input[type="file"]').first();
                                    if (await fileInput.count() > 0) {
                                        await fileInput.setInputFiles(imagePath);
                                        await page.waitForTimeout(2000);
                                    }
                                } catch (imgErr) {
                                    console.log(`⚠️ 画像アップロードスキップ: ${imgErr.message}`);
                                }
                            }

                            // 公開ボタンのクリック
                            const pubClicked = await page.evaluate(() => {
                                const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
                                for (const b of buttons) {
                                    const t = (b.innerText || '').trim();
                                    const a = (b.getAttribute('aria-label') || '').toLowerCase();
                                    const testid = (b.getAttribute('data-testid') || '').toLowerCase();
                                    const cls = typeof b.className === 'string' ? b.className : '';
                                    const rect = b.getBoundingClientRect();
                                    if (rect.width > 0 && rect.height > 0 && rect.x > window.innerWidth / 2) {
                                        if (
                                            t.includes('公開') || t.includes('Publish') || t.includes('送信') ||
                                            a.includes('publish') || a.includes('submit') || a.includes('send') ||
                                            testid.includes('publish') || testid.includes('submit') ||
                                            cls.includes('primary') || cls.includes('submit')
                                        ) {
                                            b.click();
                                            return true;
                                        }
                                    }
                                }
                                return false;
                            });

                            if (pubClicked) {
                                console.log(`🚀 セクション ${secIdx + 1} の投稿を送信しました。`);
                            } else {
                                console.log(`⚠️ 公開ボタン未検出のためショートカットを試行します。`);
                                await page.keyboard.press("Control+Enter");
                            }

                            await page.waitForTimeout(3500);
                        }
                    } else {
                        console.log("⏭️ ENABLE_POST が false のため投稿処理をスキップします。");
                    }

                    if (enableComment) {
                        console.log("⚡ コメント処理を実行中...");
                        let sentComments = 0;

                        for (let i = 0; i < 30; i++) {
                            const opened = await page.evaluate(() => {
                                const allEls = Array.from(document.querySelectorAll('button, [role="button"], span, div'));
                                for (const el of allEls) {
                                    const t = (el.innerText || '').trim();
                                    const a = el.getAttribute('aria-label') || '';
                                    if (t.includes('Add comment') || t.includes('コメントを追加') || a.toLowerCase().includes('comment')) {
                                        const rect = el.getBoundingClientRect();
                                        if (rect.width > 0 && rect.height > 0) {
                                            el.click();
                                            return true;
                                        }
                                    }
                                }
                                return false;
                            });

                            if (!opened) break;
                            await page.waitForTimeout(1200);

                            const editor = page.locator('div[contenteditable="true"], textarea').last();
                            if (await editor.count() === 0) {
                                await page.keyboard.press('Escape');
                                break;
                            }

                            await setEditableValue(editor, customMessage);
                            await page.waitForTimeout(800);

                            const sentByButton = await page.evaluate(() => {
                                const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
                                for (const b of buttons) {
                                    const t = (b.innerText || '').trim();
                                    const a = (b.getAttribute('aria-label') || '').toLowerCase();
                                    const rect = b.getBoundingClientRect();
                                    if (
                                        rect.width > 0 && rect.height > 0 &&
                                        (t.includes('コメント') || t.includes('Comment') || a.includes('send') || a.includes('送信'))
                                    ) {
                                        b.click();
                                        return true;
                                    }
                                }
                                return false;
                            });

                            if (!sentByButton) {
                                await page.keyboard.press('Enter');
                            }

                            sentComments++;
                            await page.waitForTimeout(2000);
                        }

                        console.log(`✨ コメント処理が完了しました。合計 ${sentComments} 件送信しました。`);
                    } else {
                        console.log("⏭️ ENABLE_COMMENT が false のためコメント処理をスキップします。");
                    }

                    if (roundNum < totalRounds) {
                        console.log("🔄 次のラウンドへ向けてボードを再読み込みします...");
                        await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
                        await page.waitForTimeout(5000);
                    }
                }

                await context.close();
                if (authFile && fs.existsSync(authFile)) {
                    fs.unlinkSync(authFile);
                }
                console.log(`✅ アカウント #${accountNum} の全処理が完了しました。`);
                break;
            } catch (err) {
                console.error(`❌ アカウント #${accountNum} エラー:`, err);
                await context.close();
                if (authFile && fs.existsSync(authFile)) {
                    fs.unlinkSync(authFile);
                }
            }
        }
    } finally {
        await browser.close();
    }
}

main();

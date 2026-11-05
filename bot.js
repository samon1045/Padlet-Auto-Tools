const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// --- ⚙️ GitHub Actions等の環境変数から設定を取得 ---
const TARGET_URL = process.env.TARGET_URL;
const TITLE_MESSAGE = process.env.TITLE_MESSAGE || "さーもんの集いにさんか！！https://sus5.netlify.app/#SamonTudoiPado";
const CUSTOM_MESSAGE = process.env.CUSTOM_MESSAGE || "お前らやりませんね杉！！ここはさーもんの集いに荒らされました！ｗ今すぐサーモンの集いに参加！https://sus5.netlify.app/#SamonTudoiPado パスワードがわからない人はあきらめてねー！ww普通はわかるけどねwww荒らしかえすことだけしか考えれないのかｗｗｗ ぜひ参加してねww 荒らし対策もうちょっとしてね～wwもっと頑張ってねwwじゃあお疲れｗそんじゃがんばれがんばれｗｗ";

const TOTAL_ROUNDS = parseInt(process.env.TOTAL_ROUNDS || "1", 10);
const ENABLE_POST = process.env.ENABLE_POST !== "false";      // デフォルト: true
const ENABLE_COMMENT = process.env.ENABLE_COMMENT !== "false"; // デフォルト: true
const USE_GUEST = process.env.USE_GUEST === "true";            // デフォルト: false

// 人間らしいランダム待機（Bot対策）
async function humanDelay(page, minMs = 2500, maxMs = 5000) {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await page.waitForTimeout(delay);
}

// 人間らしいタイピング（1文字ずつランダム遅延）
async function humanType(page, locator, text) {
    await locator.click();
    await page.waitForTimeout(300);
    for (let char of text) {
        await page.keyboard.type(char);
        await page.waitForTimeout(Math.floor(Math.random() * 60) + 30);
    }
}

async function main() {
    if (!TARGET_URL) {
        console.error("❌ TARGET_URL が設定されていません。");
        process.exit(1);
    }

    console.log("=== 🚀 Padlet Bot 起動パラメータ ===");
    console.log(`・ターゲットURL: ${TARGET_URL}`);
    console.log(`・実行ラウンド数: ${TOTAL_ROUNDS}`);
    console.log(`・投稿実行: ${ENABLE_POST}`);
    console.log(`・コメント実行: ${ENABLE_COMMENT}`);
    console.log(`・フリー(ゲスト)アカウント使用: ${USE_GUEST}`);
    console.log(`・タイトル: ${TITLE_MESSAGE}`);
    console.log("===================================\n");

    const imagePath = path.join(__dirname, "_______.gif");

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

        // Bot判定回避スクリプト
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        let is429Hit = false;
        page.on('response', response => {
            if (response.status() === 429 && response.url().includes('padlet')) {
                is429Hit = true;
                console.log(`⚠️ 429 Rate Limit 検知。安全のため長めの待機に入ります...`);
            }
        });

        try {
            console.log("ボードへアクセス中...");
            await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
            await humanDelay(page, 4000, 6000);

            for (let roundNum = 1; roundNum <= TOTAL_ROUNDS; roundNum++) {
                console.log(`\n--- ラウンド ${roundNum} / ${TOTAL_ROUNDS} ---`);

                // 検出されたセクション数を取得
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

                const sectionCount = Math.max(totalSections, 1);
                console.log(`📝 検出されたセクション数: ${sectionCount}`);

                // -------------------------------------------------------------
                // 1. 各セクションへ 2回ずつ 投稿を作成する処理
                // -------------------------------------------------------------
                if (ENABLE_POST) {
                    console.log("📝 全セクションへの2回繰り返し投稿処理を開始します...");

                    for (let secIdx = 0; secIdx < sectionCount; secIdx++) {
                        for (let postRepeat = 1; postRepeat <= 2; postRepeat++) {
                            console.log(`➡️ セクション ${secIdx + 1} への投稿 (回数 ${postRepeat}/2)...`);

                            if (is429Hit) {
                                console.log("⏳ 429解除のため 12 秒間完全停止します...");
                                await page.waitForTimeout(12000);
                                is429Hit = false;
                            }

                            // セクションの「＋」ボタンをクリック
                            const clicked = await page.evaluate((sIdx) => {
                                const addBtns = Array.from(document.querySelectorAll('button, [role="button"], [data-testid*="add"]'));
                                let count = 0;
                                let targetBtn = null;
                                for (let btn of addBtns) {
                                    const rect = btn.getBoundingClientRect();
                                    const text = (btn.innerText || '').trim();
                                    const aria = btn.getAttribute('aria-label') || '';
                                    if ((text === '+' || aria.includes('Add') || aria.includes('追加') || btn.className.includes('add')) && rect.y > 0 && rect.y < 350 && rect.width > 0) {
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

                            await humanDelay(page, 2000, 3500);

                            // タイトルとメッセージ（本文）を入力
                            const editables = page.locator('div[contenteditable="true"], textarea, input[type="text"]');
                            const editCount = await editables.count();

                            if (editCount > 0) {
                                // 1つ目のフィールド（タイトル）
                                await humanType(page, editables.nth(0), TITLE_MESSAGE);
                                await humanDelay(page, 1000, 1500);
                            }

                            if (editCount > 1) {
                                // 2つ目のフィールド（本文メッセージ）
                                await humanType(page, editables.nth(1), CUSTOM_MESSAGE);
                                await humanDelay(page, 1000, 1500);
                            }

                            // 画像（GIF）の添付
                            if (fs.existsSync(imagePath)) {
                                try {
                                    console.log("🖼️ 画像を添付中...");
                                    const fileInput = page.locator('input[type="file"]').first();
                                    if (await fileInput.count() > 0) {
                                        await fileInput.setInputFiles(imagePath);
                                        await humanDelay(page, 4000, 6000); // アップロード処理を十分に待機
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

                            // レート制限回避のゆったりインターバル
                            await humanDelay(page, 4000, 6000);
                        }
                    }
                }

                // -------------------------------------------------------------
                // 2. 全投稿への 2回連続 コメント送信処理
                // -------------------------------------------------------------
                if (ENABLE_COMMENT) {
                    console.log("⚡ 全投稿への2回連続コメント巡回を開始します...");

                    for (let attempt = 0; attempt < 30; attempt++) {
                        if (is429Hit) {
                            console.log("⏳ 429解除のため 12 秒間完全停止します...");
                            await page.waitForTimeout(12000);
                            is429Hit = false;
                        }

                        // コメント入力欄を開くボタンの位置を特定
                        const commentBtnPos = await page.evaluate(() => {
                            const allElements = Array.from(document.querySelectorAll('button, [role="button"], div, span'));
                            for (let el of allElements) {
                                const text = (el.innerText || '').trim();
                                const aria = (el.getAttribute('aria-label') || '').toLowerCase();
                                const rect = el.getBoundingClientRect();

                                if (rect.width > 0 && rect.height > 0 && (text.includes('Add comment') || text.includes('コメントを追加') || text.includes('コメントを書く') || aria.includes('comment'))) {
                                    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
                                }
                            }
                            return null;
                        });

                        if (!commentBtnPos) {
                            console.log("✨ 対象となるコメント欄がなくなったか全件巡回が終了しました。");
                            break;
                        }

                        await page.mouse.click(commentBtnPos.x, commentBtnPos.y);
                        await humanDelay(page, 1500, 2500);

                        // 該当投稿に 2回 連続コメント
                        for (let cTimes = 1; cTimes <= 2; cTimes++) {
                            const editor = page.locator('div[contenteditable="true"], textarea').first();
                            if (await editor.count() === 0) break;

                            console.log(`💬 コメント送信中 (${cTimes}/2 回目)...`);
                            await humanType(page, editor, CUSTOM_MESSAGE);
                            await humanDelay(page, 1000, 2000);

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

                            await humanDelay(page, 3000, 5000);
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

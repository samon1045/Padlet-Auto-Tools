import os
import json
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

TARGET_URL = os.environ.get("TARGET_URL")
TITLE_MESSAGE = os.environ.get("TITLE_MESSAGE", "さーもんの集いにさんか！！https://sus5.netlify.app/#SamonTudoiPado")
IMAGE_URL = os.environ.get("IMAGE_URL", "https://videotourl.com/images/1793876226932-8e8e55c2-70b5-480f-a533-84510fa11a81.gif")
CUSTOM_MESSAGE = os.environ.get(
    "CUSTOM_MESSAGE",
    "お前らやりませんね杉！！ここはさーもんの集いに荒らされました！ｗ今すぐサーモンの集いに参加！https://sus5.netlify.app/#SamonTudoiPado"
) + "\n" + IMAGE_URL

TOTAL_ROUNDS = int(os.environ.get("TOTAL_ROUNDS", "2"))
ENABLE_POST = os.environ.get("ENABLE_POST", "true").lower() != "false"
ENABLE_COMMENT = os.environ.get("ENABLE_COMMENT", "true").lower() != "false"
USE_GUEST = os.environ.get("USE_GUEST", "false").lower() == "true"

async def sleep(ms):
    await asyncio.sleep(ms / 1000.0)

async def clear_overlays(page):
    try:
        overlay = page.locator('.oz-overlay, [data-testid*="Dialog"], [data-testid*="modal"]')
        if await overlay.count() > 0 and await overlay.first().is_visible():
            await page.keyboard.press('Escape')
            await sleep(500)
    except Exception:
        pass

async def main():
    if not TARGET_URL:
        print("❌ TARGET_URL が設定されていません。")
        exit(1)

    print(f"=== Padlet Bot 起動 (対象: {TARGET_URL}) ===")

    videos_dir = Path.cwd() / "videos"
    videos_dir.mkdir(parents=True, exist_ok=True)

    cookies_list = [[]]
    if not USE_GUEST and os.environ.get("AUTH_JSONS"):
        try:
            cookies_list = json.loads(os.environ.get("AUTH_JSONS"))
        except Exception as e:
            print("❌ AUTH_JSONS のパースに失敗しました:", e)

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"]
        )

        for index, cookie_group in enumerate(cookies_list):
            print(f"\n🔑 アカウント [{index + 1} / {len(cookies_list)}] の処理を開始します...")

            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
                viewport={"width": 1920, height: 1080},
                record_video_dir=str(videos_dir),
                record_video_size={"width": 1920, height: 1080}
            )

            if cookie_group and len(cookie_group) > 0:
                try:
                    formatted_cookies = []
                    for c in cookie_group:
                        cookie = dict(c)
                        if "expirationDate" in cookie:
                            cookie["expires"] = cookie["expirationDate"]
                            del cookie["expirationDate"]
                        
                        s_site = cookie.get("sameSite")
                        if s_site == "no_restriction":
                            cookie["sameSite"] = "None"
                        elif s_site == "lax":
                            cookie["sameSite"] = "Lax"
                        elif s_site == "strict":
                            cookie["sameSite"] = "Strict"
                        else:
                            cookie.pop("sameSite", None)

                        formatted_cookies.append(cookie)

                    await context.add_cookies(formatted_cookies)
                    print(f"✅ {len(formatted_cookies)} 件のCookieを適用しました。")
                except Exception as cookie_err:
                    print("⚠️ Cookieの適用中に警告が発生しました:", cookie_err)

            page = await context.new_page()

            is_429_hit = {"value": False}
            def handle_response(res):
                if res.status == 429 and "padlet" in res.url:
                    is_429_hit["value"] = True

            page.on("response", handle_response)

            try:
                await page.goto(TARGET_URL, wait_until="domcontentloaded")
                print("⏳ ページの読み込みを待機中...")
                await sleep(7000)

                for round_num in range(1, TOTAL_ROUNDS + 1):
                    print(f"\n--- ラウンド {round_num} / {TOTAL_ROUNDS} ---")
                    await clear_overlays(page)

                    # -------------------------------------------------------------
                    # 1. 投稿処理
                    # -------------------------------------------------------------
                    if ENABLE_POST:
                        all_buttons = page.locator('button')
                        btn_count_total = await all_buttons.count()
                        print(f"🔍 ページ内の総ボタン数: {btn_count_total}")

                        add_btns = page.locator('button, [role="button"], [data-testid*="add"], [data-testid*="create"]').filter(
                            has_text=r"^\+$|Add|追加|投稿|Create|Make"
                        )
                        
                        section_count = await add_btns.count()

                        if section_count == 0:
                            print("⚠️ 標準の追加ボタンが見つからないため、アイコンボタン等をスキャンします...")
                            for i in range(min(btn_count_total, 20)):
                                b_text = await all_buttons.nth(i).text_content() or ""
                                b_aria = await all_buttons.nth(i).get_attribute("aria-label") or ""
                                print(f"  - [Button {i}] text: \"{b_text.strip()}\", aria-label: \"{b_aria}\"")

                        print(f"📝 検出セクション/追加ボタン数: {section_count}")

                        for sec_idx in range(section_count):
                            for post_repeat in range(1, 3):
                                await clear_overlays(page)
                                if is_429_hit["value"]:
                                    print("⏳ 429検知のため 10 秒間待機...")
                                    await sleep(10000)
                                    is_429_hit["value"] = False

                                btn = add_btns.nth(sec_idx)
                                if not await btn.is_visible():
                                    continue

                                await btn.scroll_into_view_if_needed()
                                try:
                                    await btn.click()
                                except Exception:
                                    await btn.evaluate("e => e.click()")
                                await sleep(2000)

                                inputs = page.locator('div[contenteditable="true"], textarea, input[type="text"]')
                                if await inputs.count() > 0:
                                    await inputs.nth(0).fill(TITLE_MESSAGE)
                                if await inputs.count() > 1:
                                    await inputs.nth(1).fill(CUSTOM_MESSAGE)
                                await sleep(1500)

                                pub_btn = page.locator('button, [role="button"]').filter(
                                    has_text=r"公開|Publish|送信|Submit"
                                ).first()

                                if await pub_btn.is_visible():
                                    await pub_btn.click()
                                else:
                                    await page.keyboard.press("Control+Enter")
                                await sleep(3500)

                    # -------------------------------------------------------------
                    # 2. コメント巡回処理
                    # -------------------------------------------------------------
                    if ENABLE_COMMENT:
                        triggers = page.locator('button, [role="button"]').filter(
                            has_text=r"Add comment|コメントを追加|コメントを書く|Add"
                        )
                        comment_count = await triggers.count()
                        print(f"💬 検出コメント対象数: {comment_count}")

                        for i in range(comment_count):
                            await clear_overlays(page)
                            trig = triggers.nth(i)
                            if not await trig.is_visible():
                                continue

                            await trig.scroll_into_view_if_needed()
                            try:
                                await trig.click()
                            except Exception:
                                pass
                            await sleep(1500)

                            for c_times in range(1, 3):
                                input_area = page.locator('div[contenteditable="true"], textarea').last
                                if await input_area.is_visible():
                                    await input_area.fill(CUSTOM_MESSAGE)
                                    await sleep(1000)
                                    await page.keyboard.press("Enter")

                                    submit_btn = page.locator('button[aria-label*="send"], button[aria-label*="送信"]').last
                                    if await submit_btn.is_visible():
                                        try:
                                            await submit_btn.click()
                                        except Exception:
                                            pass
                                    await sleep(3000)

                    if round_num < TOTAL_ROUNDS:
                        print("🔄 ページをリロードして次のラウンドへ...")
                        await page.reload(wait_until="domcontentloaded")
                        await sleep(6000)

                await context.close()
                print("✅ アカウントの処理が完了しました。")
                break
            except Exception as err:
                print("❌ エラーが発生しました:", err)
                await context.close()

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())

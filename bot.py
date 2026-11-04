import os
import json
import time
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(line_buffering=True)

TOPIC_TITLE = os.getenv("TOPIC_TITLE", os.getenv("CUSTOM_MESSAGE", "さーもん万歳"))
TOPIC_MESSAGE = os.getenv("TOPIC_MESSAGE", os.getenv("CUSTOM_MESSAGE", "さーもん万歳！！"))
COMMENT_MESSAGE = os.getenv("COMMENT_MESSAGE", os.getenv("CUSTOM_MESSAGE", "さーもん万歳！！"))

try:
    TOTAL_ROUNDS = int(os.getenv("ROUNDS", os.getenv("REPEAT_COUNT", "10")))
except ValueError:
    TOTAL_ROUNDS = 2

IMAGE_PATH = os.path.join(os.path.dirname(__file__), "a62e0a5b (1).gif")
TARGET_BOARD_URL = os.getenv("TARGET_URL")
DISCORD_WEBHOOK_URL = os.getenv("DISCORD_WEBHOOK_URL")

def send_discord_notification(board_url, account_index):
    if not DISCORD_WEBHOOK_URL:
        return
    try:
        import urllib.request
        payload = {
            "content": f"🛡️ **Padlet軽量オートボット通知**\nアカウント #{account_index} の処理が完了しました！\n🔗 {board_url}"
        }
        req = urllib.request.Request(
            DISCORD_WEBHOOK_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
        )
        with urllib.request.urlopen(req) as res:
            pass
    except Exception as err:
        print(f"⚠️ Discord通知スキップ/エラー: {err}")

def main():
    if not TARGET_BOARD_URL:
        print("❌ TARGET_URLが指定されていません。")
        exit(1)

    raw_auths_env = os.getenv("AUTH_JSONS", os.getenv("AUTH_JSON", ""))
    account_cookie_lists = []

    if raw_auths_env:
        try:
            parsed_env = json.loads(raw_auths_env)
            if isinstance(parsed_env, list):
                if len(parsed_env) > 0 and isinstance(parsed_env[0], list):
                    account_cookie_lists = parsed_env
                else:
                    account_cookie_lists = [parsed_env]
        except Exception:
            import re
            matches = re.findall(r'\[\s*\{.*?\}\s*\]', raw_auths_env, re.DOTALL)
            for m in matches:
                try:
                    item = json.loads(m)
                    if isinstance(item, list) and len(item) > 0:
                        account_cookie_lists.append(item)
                except Exception:
                    pass

    if not account_cookie_lists:
        print("⚠️ 有効なクッキーデータが見つかりません。")
        exit(1)

    success = False

    with sync_playwright() as p:
        for index, cookie_list in enumerate(account_cookie_lists):
            auth_file = f"auth-{index}.json"
            account_num = index + 1

            print(f"\n🔑 アカウント #{account_num} でログイン処理中...")

            try:
                cleaned_cookies = []
                for cookie in cookie_list:
                    if isinstance(cookie, dict):
                        if "sameSite" not in cookie or cookie["sameSite"] not in ["Strict", "Lax", "None"]:
                            cookie["sameSite"] = "Lax"
                        cleaned_cookies.append(cookie)
                
                with open(auth_file, "w", encoding="utf-8") as f:
                    json.dump({"cookies": cleaned_cookies, "origins": []}, f, indent=2)
            except Exception as err:
                print(f"❌ クッキー設定エラー: {err}")
                continue

            browser = p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
            )
            context = browser.new_context(storage_state=auth_file)
            page = context.new_page()

            try:
                print("ボードにアクセス中...")
                page.goto(TARGET_BOARD_URL, wait_until="domcontentloaded")
                time.sleep(6)

                if "login" in page.url or "verify" in page.url:
                    raise Exception("ログインセッションが無効です。")

                print(f"ボード読み込み成功！全 {TOTAL_ROUNDS} ラウンドを実行します。")

                for round_num in range(1, TOTAL_ROUNDS + 1):
                    print(f"\n--- ラウンド {round_num} / {TOTAL_ROUNDS} ---")

                    total_sections = page.evaluate("""() => {
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
                    }""")
                    print(f"📝 検出したセクション数: {total_sections}")

                    for sec_idx in range(max(total_sections, 1)):
                        print(f"➡️ セクション {sec_idx + 1} への投稿を作成中...")
                        try:
                            clicked = page.evaluate("""(targetIndex) => {
                                const addBtns = Array.from(document.querySelectorAll('button, [role="button"], [data-testid*="add"]'));
                                let count = 0;
                                for (let btn of addBtns) {
                                    const rect = btn.getBoundingClientRect();
                                    const text = (btn.innerText || '').trim();
                                    const aria = btn.getAttribute('aria-label') || '';
                                    if ((text === '+' || aria.includes('Add') || aria.includes('追加') || btn.className.includes('add')) && rect.y > 0 && rect.y < 350 && rect.width > 0) {
                                        if (count === targetIndex) {
                                            btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                            btn.click();
                                            return true;
                                        }
                                        count++;
                                    }
                                }
                                return false;
                            }""", sec_idx)

                            if not clicked:
                                print(f"⚠️ セクション {sec_idx + 1} のプラスボタンが見つかりませんでした。")
                                continue

                            time.sleep(1.5)

                            input_filled = False
                            for sel in ['input[placeholder*="件名"]', 'input[placeholder*="Title"]', 'input[placeholder*="タイトル"]', 'input[type="text"]', 'div[contenteditable="true"]', 'textarea']:
                                try:
                                    el = page.query_selector(sel)
                                    if el and el.is_visible():
                                        el.click()
                                        el.fill(TOPIC_TITLE)
                                        input_filled = True
                                        break
                                except Exception:
                                    pass

                            if not input_filled:
                                page.keyboard.insert_text(TOPIC_TITLE)

                            time.sleep(0.5)
                            page.keyboard.press("Tab")
                            time.sleep(0.3)
                            page.keyboard.insert_text(TOPIC_MESSAGE)
                            time.sleep(0.5)

                            if os.path.exists(IMAGE_PATH):
                                file_inputs = page.query_selector_all('input[type="file"]')
                                if file_inputs:
                                    file_inputs[-1].set_input_files(IMAGE_PATH)
                                    time.sleep(2.0)

                            published = False
                            for _ in range(3):
                                pub_btn = page.query_selector('button:has-text("公開"), button:has-text("Publish"), button[data-testid*="submit"], button[data-testid*="publish"]')
                                if pub_btn and pub_btn.is_visible():
                                    try:
                                        pub_btn.click(force=True)
                                        published = True
                                        break
                                    except Exception:
                                        pass
                                time.sleep(0.5)

                            if not published:
                                page.keyboard.press("Control+Enter")
                                time.sleep(0.5)
                                page.keyboard.press("Enter")

                            print(f"🚀 セクション {sec_idx + 1} の投稿を送信しました！")
                            time.sleep(3.0)
                        except Exception as e:
                            print(f"⚠️ セクション {sec_idx + 1} の投稿入力エラー: {e}")
                            page.keyboard.press("Escape")
                            time.sleep(1.0)

                    print("⚡ コメント巡回を実行中...")
                    for comment_idx in range(30):
                        clicked_comment = page.evaluate("""() => {
                            const cBtns = Array.from(document.querySelectorAll('button, [role="button"], span, div'));
                            for (let btn of cBtns) {
                                const t = (btn.innerText || '').trim();
                                const a = btn.getAttribute('aria-label') || '';
                                if (t.includes('Add comment') || t.includes('コメントを追加') || a.includes('comment')) {
                                    btn.click();
                                    return true;
                                }
                            }
                            return false;
                        }""")
                        
                        if not clicked_comment:
                            print("✨ すべてのコメント対象を巡回し終えました。")
                            break
                        
                        time.sleep(1.5)
                        try:
                            editor = page.query_selector('div[contenteditable="true"], textarea')
                            if editor:
                                editor.click()
                                editor.fill(COMMENT_MESSAGE)
                                time.sleep(0.6)
                                
                                comment_submitted = False
                                for c_btn_sel in ['button:has-text("コメント")', 'button:has-text("Comment")', 'button[type="submit"]', 'button[aria-label*="Send"]', 'button[aria-label*="送信"]']:
                                    c_btn = page.query_selector(c_btn_sel)
                                    if c_btn and c_btn.is_visible():
                                        try:
                                            c_btn.click(force=True)
                                            comment_submitted = True
                                            break
                                        except Exception:
                                            pass
                                
                                if not comment_submitted:
                                    page.keyboard.press("Control+Enter")
                                    time.sleep(0.3)
                                    page.keyboard.press("Enter")

                                time.sleep(2.5)
                                print(f"✅ コメント送信完了 ({comment_idx + 1}件目)")
                            else:
                                page.keyboard.press("Escape")
                        except Exception as ce:
                            print(f"⚠️ コメント入力エラー: {ce}")
                            page.keyboard.press("Escape")

                    if round_num < TOTAL_ROUNDS:
                        print("🔄 次のラウンドへ向けてボードを再読み込みします...")
                        page.reload(wait_until="domcontentloaded")
                        time.sleep(5)

                success = True
                browser.close()
                send_discord_notification(TARGET_BOARD_URL, account_num)
                break

            except Exception as error:
                print(f"❌ アカウント #{account_num} エラー: {error}")
                browser.close()

    if not success:
        print("❌ すべてのアカウントでの実行に失敗しました。")
        exit(1)

if __name__ == "__main__":
    main()

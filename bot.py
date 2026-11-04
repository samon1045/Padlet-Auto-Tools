import os
import json
import time
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

# ログのバッファリングを即時出力に設定
sys.stdout.reconfigure(line_buffering=True)

TOPIC_TITLE = os.getenv("TOPIC_TITLE", os.getenv("CUSTOM_MESSAGE", "さーもん万歳"))
TOPIC_MESSAGE = os.getenv("TOPIC_MESSAGE", os.getenv("CUSTOM_MESSAGE", "さーもん万歳！！"))
COMMENT_MESSAGE = os.getenv("COMMENT_MESSAGE", os.getenv("CUSTOM_MESSAGE", "さーもん万歳！！"))

try:
    TOTAL_ROUNDS = int(os.getenv("ROUNDS", os.getenv("REPEAT_COUNT", "2")))
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
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req) as res:
            pass
    except Exception as err:
        print(f"❌ Discord通知エラー: {err}")

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

            # 完全なヘッドレスモード（画面なし・高速動作）
            browser = p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
            )
            context = browser.new_context(storage_state=auth_file)
            page = context.new_page()

            try:
                print("ボードにアクセス中...")
                page.goto(TARGET_BOARD_URL, wait_until="domcontentloaded")
                time.sleep(5)

                if "login" in page.url or "verify" in page.url:
                    raise Exception("ログインセッションが無効です。")

                print(f"ボード読み込み成功！全 {TOTAL_ROUNDS} ラウンドを実行します。")

                for round_num in range(1, TOTAL_ROUNDS + 1):
                    print(f"\n--- ラウンド {round_num} / {TOTAL_ROUNDS} ---")

                    # 1. 各セクションの「＋」ボタンをJavaScriptで直接一網打尽にして順次クリック
                    clicked_count = page.evaluate("""() => {
                        // Padletのセクション追加ボタンやカラム内プラスボタンを幅広くセレクタで取得
                        const buttons = Array.from(document.querySelectorAll('button, [role="button"], div'));
                        let count = 0;
                        buttons.forEach(el => {
                            const text = (el.innerText || '').trim();
                            const aria = el.getAttribute('aria-label') || '';
                            if ((text === '+' || aria.includes('Add') || aria.includes('追加') || el.className.includes('add')) && count < 6) {
                                const rect = el.getBoundingClientRect();
                                if (rect.y > 0 && rect.y < 300 && rect.width > 0) {
                                    el.click();
                                    count++;
                                }
                            }
                        });
                        return count;
                    """)
                    print(f"📝 検出・クリックしたセクションボタン数: {clicked_count}")
                    time.sleep(2.0)

                    # フォームが開いている前提でタイトルとメッセージを入力して送信
                    try:
                        title_input = page.query_selector('input[placeholder*="件名"], input[placeholder*="Title"], input[placeholder*="タイトル"], input[type="text"]')
                        if title_input:
                            title_input.fill(TOPIC_TITLE)
                            time.sleep(0.5)
                            
                            body_editor = page.query_selector('div[contenteditable="true"], textarea')
                            if body_editor:
                                body_editor.fill(TOPIC_MESSAGE)
                                time.sleep(0.5)

                            # 画像がある場合はファイルインプットに直接流し込む
                            if os.path.exists(IMAGE_PATH):
                                file_inputs = page.query_selector_all('input[type="file"]')
                                if file_inputs:
                                    file_inputs[-1].set_input_files(IMAGE_PATH)
                                    time.sleep(2.0)

                            # 送信（公開ボタン、またはCtrl+Enter）
                            pub_btn = page.query_selector('button:has-text("公開"), button:has-text("Publish")')
                            if pub_btn:
                                pub_btn.click()
                            else:
                                page.keyboard.press("Control+Enter")
                            print("🚀 投稿を送信しました！")
                    except Exception as e:
                        print(f"⚠️ 投稿入力スキップ: {e}")

                    time.sleep(3.0)

                    # 2. コメント巡回（画面を描画せずDOMから直接コメントボタンを叩く）
                    print("⚡ コメント巡回を実行中...")
                    for _ in range(20):
                        success_comment = page.evaluate("""() => {
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
                        })""")
                        if not success_comment:
                            break
                        
                        time.sleep(1.0)
                        # コメント入力
                        page.keyboard.insert_text(COMMENT_MESSAGE)
                        time.sleep(0.5)
                        page.keyboard.press("Enter")
                        time.sleep(2.0)
                        print("✅ コメント1件送信完了")

                    if round_num < TOTAL_ROUNDS:
                        page.reload(wait_until="domcontentloaded")
                        time.sleep(4)

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

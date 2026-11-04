import os
import json
import time
import glob
from pathlib import Path
from playwright.sync_api import sync_playwright
from google import genai

# 📝 設定値
TOPIC_TITLE = os.getenv("TOPIC_TITLE", os.getenv("CUSTOM_MESSAGE", "さーもん万歳"))
TOPIC_MESSAGE = os.getenv("TOPIC_MESSAGE", os.getenv("CUSTOM_MESSAGE", "さーもん万歳！！"))
COMMENT_MESSAGE = os.getenv("COMMENT_MESSAGE", os.getenv("CUSTOM_MESSAGE", "さーもん万歳！！"))

IMAGE_PATH = os.path.join(os.path.dirname(__file__), "a62e0a5b (1).gif")
TARGET_BOARD_URL = os.getenv("TARGET_URL")
DISCORD_WEBHOOK_URL = os.getenv("DISCORD_WEBHOOK_URL")

raw_keys_env = os.getenv("GEMINI_API_KEY", os.getenv("GEMINI_APIKEY", ""))
GEMINI_API_KEY = raw_keys_env.split(",")[0].strip() if raw_keys_env else ""

# 🤖 Geminiクライアントの初期化
ai_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

def send_discord_notification(board_url, account_index):
    if not DISCORD_WEBHOOK_URL:
        print("⚠️ DISCORD_WEBHOOK_URL が設定されていないため、Discord通知をスキップします。")
        return

    try:
        import urllib.request
        payload = {
            "content": f"🛡️ **Padletモデレーションボット（Python版）通知**\nアカウント #{account_index} を使用して以下のボードで処理が完了しました！\n🔗 {board_url}"
        }
        req = urllib.request.Request(
            DISCORD_WEBHOOK_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req) as response:
            if response.status == 200 or response.status == 204:
                print("✅ Discordへの通知送信に成功しました！")
            else:
                print(f"❌ Discordへの通知送信に失敗しました: {response.status}")
    except Exception as err:
        print(f"❌ Discord通知エラー: {err}")

def take_step_screenshot(page, step_name, account_index):
    try:
        timestamp = int(time.time() * 1000)
        safe_step = "".join(c if c.isalnum() else "_" for c in step_name)
        file_name = f"screenshot-acc{account_index}-{timestamp}-{safe_step}.png"
        page.screenshot(path=file_name, full_page=True)
        print(f"📸 スクリーンショット保存: {file_name}")
        return file_name
    except Exception:
        return None

def close_all_modals_and_popups(page):
    for _ in range(2):
        try:
            close_btn = page.query_selector('button[aria-label*="閉じる"], button[aria-label*="Close"], button.close-btn, div[role="dialog"] button:has-text("×")')
            if close_btn and close_btn.is_visible():
                close_btn.click(force=True)
                time.sleep(0.3)
        except Exception:
            pass
        
        page.keyboard.press("Escape")
        time.sleep(0.2)

    try:
        page.evaluate("""() => {
            const modals = document.querySelectorAll('[data-testid*="surfaceActivityPanel"], [data-testid*="modal"], div[role="dialog"], .oz-overlay');
            modals.forEach(el => el.remove());
        }""")
    except Exception:
        pass
    time.sleep(0.4)

def attach_image_for_topic(page):
    if not os.path.exists(IMAGE_PATH):
        print("⚠️ アップロード用の画像ファイルが見つからないため、画像添付をスキップします:", IMAGE_PATH)
        return

    try:
        attach_trigger = page.query_selector('button[aria-label*="Attach"], button[aria-label*="file"], button[aria-label*="追加"], button[data-testid*="Upload"], button:has-text("Upload"), button:has-text("ファイル")')
        if attach_trigger:
            attach_trigger.click(force=True)
            time.sleep(0.8)

        upload_option = page.query_selector('button:has-text("Upload"), [data-testid*="Upload"], button:has-text("ファイル"), div:has-text("アップロード")')
        if upload_option:
            with page.expect_file_chooser(timeout=3000) as fc_info:
                upload_option.click(force=True)
            file_chooser = fc_info.value
            if file_chooser:
                file_chooser.set_files(IMAGE_PATH)
                time.sleep(3.0)
                return

        file_inputs = page.query_selector_all('input[type="file"]')
        if file_inputs:
            file_inputs[-1].set_input_files(IMAGE_PATH)
            time.sleep(3.0)
    except Exception as err:
        print(f"⚠️ 画像の添付中に軽微なエラーが発生しました: {err}")

def ask_gemini_for_section_buttons(page, account_num):
    buttons_info = page.evaluate("""() => {
        const allEls = Array.from(document.querySelectorAll('button, [role="button"], div[class*="add"], span[class*="add"]'));
        return allEls.map((el, index) => {
            const rect = el.getBoundingClientRect();
            return {
                domIndex: index,
                text: (el.innerText || '').trim().substring(0, 30),
                ariaLabel: el.getAttribute('aria-label') || '',
                testId: el.getAttribute('data-testid') || '',
                className: el.className || '',
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
            };
        }).filter(b => b.y > 30 && b.y < 350 && b.x < 1200 && b.width > 10 && b.height > 10);
    }""")

    if not ai_client:
        print("⚠️ GEMINI_API_KEY が設定されていないため、デフォルトの座標ソートにフォールバックします。")
        return [b["domIndex"] for b in sorted(buttons_info, key=lambda k: k["x"]) if "+" in b["text"] or "Add" in b["ariaLabel"] or "追加" in b["ariaLabel"]]

    try:
        screenshot_path = take_step_screenshot(page, "ai-analysis", account_num)
        image_part = None
        if screenshot_path and os.path.exists(screenshot_path):
            with open(screenshot_path, "rb") as f:
                image_bytes = f.read()
            from google.genai import types
            image_part = types.Part.from_bytes(data=image_bytes, mime_type="image/png")

        prompt = (
            "あなたはPadlet自動化のエキスパートAIです。提供されたスクリーンショットと以下のボタン要素のJSONリストを分析し、"
            "各セクション（カラム）の列にある新規投稿用のプラスボタンに該当する要素の domIndex を、"
            "左から右の列順（X座標の昇順）に配列としてJSON形式でのみ返してください。"
            "余計な解説は一切不要で、例: [12, 45, 67, 89] のようなJSON配列のみ出力してください。\n\nボタンリスト:\n"
            + json.dumps(buttons_info, ensure_ascii=False, indent=2)
        )

        contents = [prompt, image_part] if image_part else [prompt]
        response = ai_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=contents,
        )

        text_response = response.text.strip()
        import re
        match = re.search(r"\[[\d,\s]*\]", text_response)
        if match:
            indices = json.loads(match.group(0))
            print(f"🤖 Gemini AI が特定したセクションボタンのDOMインデックス: {indices}")
            return indices
    except Exception as err:
        print(f"⚠️ Gemini APIによる解析中にエラーが発生しました。フォールバックします: {err}")

    return [b["domIndex"] for b in sorted(buttons_info, key=lambda k: k["x"]) if "+" in b["text"] or "Add" in b["ariaLabel"] or "追加" in b["ariaLabel"]]

def main():
    if not TARGET_BOARD_URL:
        print("❌ TARGET_URLが指定されていません。")
        exit(1)

    raw_keys_env = os.getenv("AUTH_JSONS", os.getenv("AUTH_JSON", ""))
    auth_list = []
    current_block = ""
    bracket_count = 0

    for char in raw_keys_env:
        if char == "[":
            bracket_count += 1
        if bracket_count > 0:
            current_block += char
        if char == "]":
            bracket_count -= 1
            if bracket_count == 0 and len(current_block.strip()) > 0:
                auth_list.append(current_block.strip())
                current_block = ""

    if not auth_list:
        print("⚠️ 有効なクッキーデータが見つかりません。AUTH_JSONS環境変数を確認してください。")
        exit(1)

    success = False

    with sync_playwright() as p:
        for index, auth_data in enumerate(auth_list):
            auth_file = f"auth-{index}.json"
            account_num = index + 1

            print(f"\n🔑 アカウント #{account_num} のクッキーデータでログインを試行します...")

            try:
                parsed_cookies = json.loads(auth_data)
                cleaned_cookies = []
                for cookie in parsed_cookies:
                    if "sameSite" not in cookie or cookie["sameSite"] not in ["Strict", "Lax", "None"]:
                        cookie["sameSite"] = "Lax"
                    cleaned_cookies.append(cookie)
                
                with open(auth_file, "w", encoding="utf-8") as f:
                    json.dump({"cookies": cleaned_cookies, "origins": []}, f, indent=2)
            except Exception as e:
                print(f"❌ アカウント #{account_num} のクッキー処理に失敗しました: {e}")
                continue

            browser = p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
            )
            context = browser.new_context(storage_state=auth_file)
            page = context.new_page()

            try:
                print("Padletボードにアクセス中...")
                page.goto(TARGET_BOARD_URL, wait_until="domcontentloaded")
                time.sleep(6)

                take_step_screenshot(page, "after-goto", account_num)

                current_url = page.url()
                if "login" in current_url or "verify" in current_url or page.query_selector("text=registered users only"):
                    raise Exception("クッキーの有効期限が切れているか、ログインしていません。")

                print("ボードの読み込み完了！処理を開始します...")

                for round_num in range(1, 3):
                    print(f"\n========================================")
                    print(f"🔄 【 処理ラウンド {round_num} / 2 回目 】")
                    print(f"========================================")

                    print(f"\n📂 【全セクションへの新規投稿開始】")
                    close_all_modals_and_popups(page)

                    target_dom_indices = ask_gemini_for_section_buttons(page, account_num)
                    print(f"🔍 AIが選定した有効なセクション列数: {len(target_dom_indices)}個")

                    max_sections = min(len(target_dom_indices), 6)

                    for i in range(max_sections):
                        try:
                            close_all_modals_and_popups(page)
                            print(f"\n➡️ セクション {i + 1} に投稿を作成中...")

                            dom_index_to_click = target_dom_indices[i]

                            clicked = page.evaluate("""(targetIdx) => {
                                const allEls = Array.from(document.querySelectorAll('button, [role="button"], div[class*="add"], span[class*="add"]'));
                                const target = allEls[targetIdx];
                                if (target) {
                                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    ['mousedown', 'mouseup', 'click'].forEach(eventType => {
                                        const event = new MouseEvent(eventType, {
                                            view: window,
                                            bubbles: true,
                                            cancelable: true,
                                            buttons: 1
                                        });
                                        target.dispatchEvent(event);
                                    });
                                    return true;
                                }
                                return false;
                            }""", dom_index_to_click)

                            if not clicked:
                                print(f"⚠️ セクション {i + 1} のボタン要素（Index: {dom_index_to_click}）が見つからないためスキップします。")
                                continue

                            time.sleep(2.0)

                            title_input = page.query_selector('input[placeholder*="件名"], input[placeholder*="Title"], input[placeholder*="タイトル"], input[type="text"]')
                            if not title_input:
                                try:
                                    title_input = page.wait_for_selector('input[placeholder*="件名"], input[placeholder*="Title"], input[placeholder*="タイトル"], input[type="text"]', timeout=4000)
                                except Exception:
                                    title_input = None

                            if not title_input:
                                print(f"⚠️ [セクション {i + 1}] 投稿フォームが開かなかったためスキップします。")
                                continue

                            title_input.click()
                            title_input.fill(TOPIC_TITLE)
                            time.sleep(0.6)

                            body_editor = page.query_selector('div[contenteditable="true"], p.is-editor-empty, [data-placeholder*="素晴らしい"], [data-placeholder*="fabulous"], textarea')
                            if body_editor:
                                body_editor.click()
                                page.keyboard.insert_text(TOPIC_MESSAGE)
                                time.sleep(0.8)

                            attach_image_for_topic(page)

                            published = False
                            for _ in range(5):
                                publish_btn = page.query_selector('button:has-text("公開"), button:has-text("Publish"), button[data-testid*="submit"], button[data-testid*="publish"]')
                                if publish_btn:
                                    try:
                                        is_visible = publish_btn.is_visible()
                                        is_disabled = publish_btn.evaluate("el => el.disabled || el.getAttribute('aria-disabled') === 'true'")
                                        if is_visible and not is_disabled:
                                            publish_btn.click(force=True)
                                            published = True
                                            print("🚀 「公開」ボタンをクリックしました")
                                            break
                                    except Exception:
                                        pass
                                time.sleep(0.5)

                            if not published:
                                print("⚠️ 「公開」ボタンが見つからないため、Ctrl+Enterで送信します。")
                                page.keyboard.press("Control+Enter")

                            time.sleep(3.0)
                            close_all_modals_and_popups(page)
                            time.sleep(1.0)

                            print(f"✅ [セクション {i + 1}] 投稿処理が完了しました！")
                            take_step_screenshot(page, f"round{round_num}-section-{i + 1}", account_num)

                        except Exception as err:
                            print(f"⚠️ 投稿処理中エラー (セクション {i + 1}): {err}")
                            close_all_modals_and_popups(page)
                        finally:
                            close_all_modals_and_popups(page)

                    # コメント巡回
                    print(f"\n⚡ 【全投稿へのコメント巡回開始 (ラウンド {round_num})】")
                    safety_limit = 0
                    while safety_limit < 150:
                        close_all_modals_and_popups(page)

                        rate_limit_alert = page.query_selector("text=コメントの回数が多すぎます")
                        if rate_limit_alert and rate_limit_alert.is_visible():
                            print("⚠️ レートリミット（連投制限）を検知したため、コメント巡回を中断します。")
                            break

                        comment_selectors = [
                            'button:has-text("Add comment")',
                            'button:has-text("コメントを追加")',
                            'div:has-text("+ Add comment")',
                            'span:has-text("+ Add comment")',
                            'button[aria-label*="comment"]',
                            'button:has-text("コメントを追加する")'
                        ]
                        found_btns = page.query_selector_all(", ".join(comment_selectors))

                        if not found_btns:
                            print("✨ すべてのコメント対象を巡回し終えました。")
                            break

                        target_btn = found_btns[0]
                        try:
                            target_btn.scroll_into_view_if_needed()
                            time.sleep(0.3)
                            target_btn.click(force=True)
                            time.sleep(1.2)

                            editor = page.query_selector('div[contenteditable="true"], textarea')
                            if not editor:
                                try:
                                    editor = page.wait_for_selector('div[contenteditable="true"], textarea', timeout=2000)
                                except Exception:
                                    editor = None

                            if editor:
                                editor.click()
                                page.keyboard.insert_text(COMMENT_MESSAGE)
                                time.sleep(0.6)
                                page.keyboard.press("Enter")
                                time.sleep(4.0)

                            print(f"✅ コメント投稿完了 ({safety_limit + 1}件目)")
                        except Exception as err:
                            print(f"⚠️ コメント処理スキップ/エラー: {err}")
                            close_all_modals_and_popups(page)
                        finally:
                            close_all_modals_and_popups(page)

                        safety_limit += 1

                    print(f"\n🎉 ラウンド {round_num} の処理が完了しました！")

                    if round_num < 2:
                        print("🔄 次のラウンドへ向けてボードを再読み込みします...")
                        page.reload(wait_until="domcontentloaded")
                        time.sleep(5)

                take_step_screenshot(page, "success-final", account_num)
                success = True
                browser.close()
                send_discord_notification(TARGET_BOARD_URL, account_num)
                break

            except Exception as error:
                print(f"❌ アカウント #{account_num} でエラーが発生しました: {error}")
                take_step_screenshot(page, "error-occurred", account_num)
                browser.close()
            finally:
                if os.path.exists(auth_file):
                    try:
                        os.remove(auth_file)
                    except Exception:
                        pass

    if not success:
        print("❌ すべてのアカウントでの実行に失敗しました。")
        exit(1)

if __name__ == "__main__":
    main()

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
            
            video_dir = "videos"
            os.makedirs(video_dir, exist_ok=True)
            context = browser.new_context(
                storage_state=auth_file,
                record_video_dir=video_dir,
                record_video_size={"width": 1280, "height": 720}
            )
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

                    # セクション数を取得
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

                    # 💡 【コンソールスクリプト】各セクションへの投稿作成・入力・送信をJSコンソール内で一括完結
                    for sec_idx in range(max(total_sections, 1)):
                        print(f"➡️ セクション {sec_idx + 1} への投稿を作成中 (JSコンソール実行)...")
                        
                        result = page.evaluate("""async ({ secIndex, title, message }) => {
                            // 1. プラスボタンを探してクリック
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

                            if (!targetBtn) return { success: false, reason: 'Add button not found' };
                            targetBtn.click();
                            
                            // フォームが開くまで少し待つ
                            await new Promise(r => setTimeout(r, 1500));

                            // 2. 入力欄（タイトル/件名および本文）を探して値をセット
                            const inputs = Array.from(document.querySelectorAll('input, textarea, div[contenteditable="true"]'));
                            let titleInput = null;
                            let bodyInput = null;

                            for (let el of inputs) {
                                const ph = (el.getAttribute('placeholder') || '').toLowerCase();
                                if (ph.includes('件名') || ph.includes('title') || ph.includes('タイトル')) {
                                    titleInput = el;
                                    break;
                                }
                            }
                            if (!titleInput && inputs.length > 0) titleInput = inputs[0];

                            if (titleInput) {
                                titleInput.focus();
                                if (titleInput.tagName === 'DIV') {
                                    titleInput.innerText = title;
                                } else {
                                    titleInput.value = title;
                                }
                                titleInput.dispatchEvent(new Event('input', { bubbles: true }));
                                titleInput.dispatchEvent(new Event('change', { bubbles: true }));
                            }

                            // 本文エディタを探す
                            const editables = Array.from(document.querySelectorAll('div[contenteditable="true"], textarea'));
                            if (editables.length > 1) {
                                bodyInput = editables[1];
                            } else if (editables.length === 1 && editables[0] !== titleInput) {
                                bodyInput = editables[0];
                            }

                            if (bodyInput) {
                                bodyInput.focus();
                                if (bodyInput.tagName === 'DIV') {
                                    bodyInput.innerText = message;
                                } else {
                                    bodyInput.value = message;
                                }
                                bodyInput.dispatchEvent(new Event('input', { bubbles: true }));
                                bodyInput.dispatchEvent(new Event('change', { bubbles: true }));
                            }

                            await new Promise(r => setTimeout(r, 800));

                            // 3. 「公開 / Publish / 送信」ボタンを探してクリック
                            const allBtns = Array.from(document.querySelectorAll('button, [role="button"]'));
                            let pubBtn = null;
                            for (let b of allBtns) {
                                const t = (b.innerText || '').trim();
                                const a = (b.getAttribute('aria-label') || '').toLowerCase();
                                if (t.includes('公開') || t.includes('Publish') || a.includes('publish') || a.includes('submit')) {
                                    const rect = b.getBoundingClientRect();
                                    if (rect.width > 0 && rect.height > 0) {
                                        pubBtn = b;
                                        break;
                                    }
                                }
                            }

                            if (pubBtn) {
                                pubBtn.click();
                                return { success: true };
                            }

                            return { success: false, reason: 'Publish button not found' };
                        }""", {"secIndex": sec_idx, "title": TOPIC_TITLE, "message": TOPIC_MESSAGE})

                        if result.get("success"):
                            print(f"🚀 セクション {sec_idx + 1} の投稿をコンソール経由で送信しました！")
                        else:
                            # フォールバックとしてキーボード操作を試す
                            print(f"⚠️ JSコンソールでの公開ボタン直接押下ができなかったためショートカットを試します ({result.get('reason')})")
                            page.keyboard.press("Control+Enter")

                        time.sleep(3.0)

                    # 💡 【コンソールスクリプト】コメント巡回もJSコンソール内で一括処理
                    print("⚡ コメント巡回をコンソール経由で実行中...")
                    
                    comment_count = page.evaluate("""async ({ commentMsg }) => {
                        let count = 0;
                        for (let i = 0; i < 30; i++) {
                            // コメント追加ボタンを探す
                            const allEls = Array.from(document.querySelectorAll('button, [role="button"], span, div'));
                            let cBtn = null;
                            for (let el of allEls) {
                                const t = (el.innerText || '').trim();
                                const a = (el.getAttribute('aria-label') || '').toLowerCase();
                                if (t.includes('Add comment') || t.includes('コメントを追加') || a.includes('comment')) {
                                    const rect = el.getBoundingClientRect();
                                    if (rect.width > 0 && rect.height > 0) {
                                        cBtn = el;
                                        break;
                                    }
                                }
                            }

                            if (!cBtn) break;
                            cBtn.click();
                            await new Promise(r => setTimeout(r, 1200));

                            // コメント入力欄を探す
                            const editor = document.querySelector('div[contenteditable="true"], textarea');
                            if (!editor) {
                                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
                                break;
                            }

                            editor.focus();
                            if (editor.tagName === 'DIV') {
                                editor.innerText = commentMsg;
                            } else {
                                editor.value = commentMsg;
                            }
                            editor.dispatchEvent(new Event('input', { bubbles: true }));
                            editor.dispatchEvent(new Event('change', { bubbles: true }));

                            await new Promise(r => setTimeout(r, 600));

                            // 送信ボタンを探してクリック
                            const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
                            let sent = false;
                            for (let b of buttons) {
                                const t = (b.innerText || '').trim();
                                const a = (b.getAttribute('aria-label') || '').toLowerCase();
                                if (t.includes('コメント') || t.includes('Comment') || a.includes('send') || a.includes('送信')) {
                                    const rect = b.getBoundingClientRect();
                                    if (rect.width > 0 && rect.height > 0) {
                                        b.click();
                                        sent = true;
                                        break;
                                    }
                                }
                            }

                            if (!sent) {
                                // 見つからない場合はEnterイベントを発火
                                editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                            }

                            count++;
                            await new Promise(r => setTimeout(r, 2000));
                        }
                        return count;
                    }""", {"commentMsg": COMMENT_MESSAGE})

                    print(f"✨ コメント巡回が完了しました。合計 {comment_count} 件送信しました。")

                    if round_num < TOTAL_ROUNDS:
                        print("🔄 次のラウンドへ向けてボードを再読み込みします...")
                        page.reload(wait_until="domcontentloaded")
                        time.sleep(5)

                success = True
                context.close()
                browser.close()
                send_discord_notification(TARGET_BOARD_URL, account_num)
                break

            except Exception as error:
                print(f"❌ アカウント #{account_num} エラー: {error}")
                try:
                    context.close()
                    browser.close()
                except Exception:
                    pass

    if not success:
        print("❌ すべてのアカウントでの実行に失敗しました。")
        exit(1)

if __name__ == "__main__":
    main()

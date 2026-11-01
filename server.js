const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="ja">
        <head>
            <meta charset="UTF-8">
            <title>Padlet 自動投稿ツール</title>
            <style>
                body {
                    background-color: #121212;
                    color: #e0e0e0;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                }
                .card {
                    background: #1e1e1e;
                    padding: 30px;
                    border-radius: 8px;
                    width: 400px;
                    border: 1px solid #333;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.7);
                }
                h2 {
                    margin-top: 0;
                    color: #ffffff;
                    font-size: 18px;
                    border-bottom: 1px solid #333;
                    padding-bottom: 12px;
                    letter-spacing: 0.5px;
                }
                label {
                    display: block;
                    margin-top: 15px;
                    font-size: 13px;
                    color: #aaaaaa;
                }
                input, textarea {
                    width: 100%;
                    padding: 10px;
                    margin-top: 6px;
                    background: #282828;
                    border: 1px solid #444;
                    color: #fff;
                    border-radius: 4px;
                    box-sizing: border-box;
                    font-size: 14px;
                }
                input:focus, textarea:focus {
                    outline: none;
                    border-color: #777;
                }
                button {
                    width: 100%;
                    margin-top: 24px;
                    padding: 11px;
                    background: #ffffff;
                    color: #121212;
                    border: none;
                    border-radius: 4px;
                    font-weight: bold;
                    font-size: 14px;
                    cursor: pointer;
                    transition: background 0.2s;
                }
                button:hover {
                    background: #d0d0d0;
                }
                #result {
                    margin-top: 15px;
                    font-size: 13px;
                    text-align: center;
                }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>Padlet Post Tool</h2>
                <form id="postForm">
                    <label>APIトークン (Bearer Token)</label>
                    <input type="password" id="token" required placeholder="パドレットのトークンを入力">
                    
                    <label>ボード ID</label>
                    <input type="text" id="boardId" required placeholder="例: abc123xyz">
                    
                    <label>メッセージ</label>
                    <textarea id="message" rows="4" required placeholder="おはよう！"></textarea>
                    
                    <button type="submit">投稿する</button>
                </form>
                <div id="result"></div>
            </div>

            <script>
                document.getElementById('postForm').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const token = document.getElementById('token').value;
                    const boardId = document.getElementById('boardId').value;
                    const message = document.getElementById('message').value;
                    const resultDiv = document.getElementById('result');

                    resultDiv.style.color = '#e0e0e0';
                    resultDiv.innerText = '送信中...';

                    try {
                        const response = await fetch('/api/post', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ token, boardId, message })
                        });
                        const data = await response.json();
                        
                        if (response.ok) {
                            resultDiv.style.color = '#81c784';
                            resultDiv.innerText = '✅ 投稿に成功しました！';
                        } else {
                            resultDiv.style.color = '#e57373';
                            resultDiv.innerText = '❌ エラー: ' + (data.error || '失敗しました');
                        }
                    } catch (err) {
                        resultDiv.style.color = '#e57373';
                        resultDiv.innerText = '❌ 通信エラーが発生しました';
                    }
                });
            </script>
        </body>
        </html>
    `);
});

app.post('/api/post', async (req, res) => {
    const { token, boardId, message } = req.body;

    try {
        const response = await axios.post(`https://api.padlet.com/v1/boards/${boardId}/posts`, {
            data: {
                attributes: {
                    body: message
                }
            }
        }, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        res.json({ success: true, data: response.data });
    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(500).json({ 
            success: false, 
            error: error.response?.data?.errors?.[0]?.detail || error.message 
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`サーバーが起動しました: http://localhost:${PORT}`);
});

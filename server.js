const express = require('express');
const path = require('path');
const { runBot } = require('./bot-runner');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/run', async (req, res) => {
    const { targetUrl, message } = req.body;

    if (!targetUrl) {
        return res.status(400).json({ success: false, error: 'URLを入力してください。' });
    }

    console.log(`\n[リクエスト受信] ターゲットURL: ${targetUrl}`);
    console.log(`メッセージ: ${message || 'デフォルトメッセージを使用'}`);

    res.json({ success: true, message: 'ボットの実行を開始しました！ターミナルやログを確認してください。' });

    try {
        await runBot(targetUrl, message);
    } catch (err) {
        console.error('ボット実行エラー:', err);
    }
});

app.listen(PORT, () => {
    console.log(`=================================`);
    console.log(` Web入力ページが起動しました！`);
    console.log(` ブラウザで以下を開いてね: http://localhost:${PORT}`);
    console.log(`=================================`);
});

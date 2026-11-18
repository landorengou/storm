<?php
// 簡易Webプロキシスクリプト (proxy.php)

$url = isset($_GET['url']) ? trim($_GET['url']) : '';

if ($url) {
    // URLの形式チェック
    if (!filter_var($url, FILTER_VALIDATE_URL)) {
        die("無効なURLです。");
    }

    // cURLセッションの初期化
    $ch = curl_init();
    
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true); // リダイレクトを追跡
    curl_setopt($ch, CURLOPT_HEADER, true); // ヘッダーも含めて取得
    curl_setopt($ch, CURLOPT_USERAGENT, $_SERVER['HTTP_USER_AGENT']);

    $response = curl_exec($ch);
    
    if (curl_errno($ch)) {
        die("エラーが発生しました: " . curl_html_escape(curl_error($ch)));
    }
    
    $header_size = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    $header = substr($response, 0, $header_size);
    $body = substr($response, $header_size);
    
    $content_type = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    curl_close($ch);

    // コンテンツタイプに応じて出力
    header("Content-Type: " . $content_type);
    echo $body;
    exit;
}
?>
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>簡易Webプロキシ</title>
</head>
<body>
    <h2>Webプロキシ</h2>
    <form method="GET" action="">
        <input type="text" name="url" placeholder="https://example.com" style="width: 400px;" required>
        <button type="submit">アクセス</button>
    </form>
</body>
</html>
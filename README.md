# opencode-flixa

[Flixa](https://flixa.engineer) 用の OpenCode プラグインです。OpenCode で Flixa の AI モデルを利用できるようにします。

## セットアップ

### 1. Flixa CLI のインストールとログイン

```bash
npm i -g @deniai/flixa
flixa login
```

### 2. OpenCode の設定

```bash
flixa opencode
```

このコマンドを実行すると、以下の設定が自動的に行われます：

- `~/.config/opencode/opencode.json` への本プラグインの登録
- `~/.local/share/opencode/auth.json` への API キーの保存

> **注意:** モデルの定義（プロバイダー設定）は、本プラグインが起動時にバックグラウンドで自動的に行います。

### 3. OpenCode の起動

```bash
opencode
```

モデル選択メニューに Flixa のモデルが表示されるようになります。

## 利用可能なモデル

本プラグインは OpenCode 起動時に Flixa API から利用可能なモデルを取得し、自動的に `opencode.json` のプロバイダー定義を更新します。

利用可能な主要モデル例：
- `openai/gpt-5.4`
- `anthropic/claude-sonnet-4.6`
- `anthropic/claude-opus-4.6`
- `google/gemini-3.1-pro`
- `google/gemini-3-flash`

> **注意:** API から新しいモデルが追加された場合、OpenCode を再起動（または再読み込み）するとメニューに反映されます。

## モデルの確認 (CLI)

Flixa API から利用可能な最新のモデル一覧を CLI で確認する場合：

```bash
flixa opencode-models
```

（※ 現在、モデルの OpenCode への反映はプラグインが自動的に行うため、CLI からの手動更新は不要になりました）

## 手動設定

手動で設定したい場合は、`~/.config/opencode/opencode.json` にプラグインを登録してください：

```json
{
  "plugin": ["opencode-flixa"]
}
```

また、`~/.local/share/opencode/auth.json` に API キーを追加してください：

```json
{
  "flixa": {
    "type": "api",
    "key": "YOUR_FLIXA_API_KEY"
  }
}
```

## トラブルシューティング / 企業プロキシ環境

企業プロキシやセキュリティ製品により SSL/TLS 証明書のエラーが発生する場合、以下の環境変数を設定することで TLS 検証を一時的に無効化できます：

- `DISABLE_TLS_VERIFY=true`
- または `ENABLE_PROXY_INSECURE=true`

これらの変数が設定されている場合、プラグインは証明書の検証をスキップして通信を続行します。

> [!WARNING]
> **セキュリティ警告:**
> TLS 検証を無効にすることは、中間者攻撃（MITM）に対して脆弱になる重大なリスクを伴います。本設定は**信頼できる社内ネットワーク内のみでの利用に限定し、本番環境での使用は避けてください。**
> 
> **推奨されるセキュアな代替策:**
> セキュリティを維持するため、組織の CA 証明書をインストールして使用することを強く推奨します。Node.js では `NODE_EXTRA_CA_CERTS` 環境変数に証明書ファイル（PEM形式）のパスを指定することで、検証を有効にしたまま安全にエラーを回避できます。

## ライセンス

MIT

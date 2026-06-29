# LIFF アプリ仕様 - 家計ぼっと

## 概要

既存の LINE 家計簿 bot を、LINE LIFF アプリとしてフォーム操作できるようにする。

LIFF 側は支出・予定・設定の正本を既存 bot と同じ Firestore / Google Calendar に置く。手動操作は既存 docs に定義済みの bot コマンドを `liff.sendMessages()` で LINE トークへ送信し、画像追加とデータ表示は Next.js API Route を経由してサーバー側で実行する。

## 技術スタック

| 項目 | 採用 |
| --- | --- |
| フレームワーク | Next.js App Router |
| UI | Shadcn UI / Radix UI / Tailwind CSS |
| パッケージ管理 | pnpm |
| LIFF SDK | `@line/liff` |
| Firestore 表示 | `@google-cloud/firestore` を Next.js API Route で使用 |
| Calendar 表示 | `googleapis` を Next.js API Route で使用 |

## 画面機能

| 機能 | LIFF 画面 | 既存 bot コマンド / データ |
| --- | --- | --- |
| 画像で追加 | レシート画像選択、画像解析、登録 | `POST /api/expenses/from-image` / Gemini / Firestore / Google Calendar |
| 手動追加 | 支払い者、カテゴリー、金額、日付、店舗・内容 | `@追加` / `@旅行` |
| 更新 | 既存支出の編集フォーム | `@削除` + `@追加` を順に送信 |
| 削除 | 支出行の削除ボタン | `@削除` |
| 履歴 | 対象年月指定、支出一覧 | Firestore `expenses` / `@履歴` |
| 集計 | 対象年月指定 | `@集計` |
| 残高 | ユーザー別外食残高 | Firestore `users.diningBalance` / `@残高` |
| 予定追加 | 参加者、内容、日付、開始/終了時刻 | `@予定` |
| 予定表示 | Google Calendar 月間イベント | Google Calendar API |
| 予算変更 | 月額予算フォーム | `@予算` |
| 担当者設定 | 初期設定・設定変更ボタン | `@初期設定` / `@設定変更` |
| サブスク | 一覧表示、追加・変更・削除導線 | Firestore `subscriptions` / `@サブスク*` |
| 家賃 | 家賃表示、追加・変更導線 | Firestore `rents` / `@家賃*` |
| キャンセル | 対話キャンセル | `@キャンセル` |

## Firestore / Google Calendar 表示

`GET /api/dashboard?month=YYYY-MM` が以下をまとめて返す。

- Firestore `users`
- Firestore `expenses`
- Firestore `settings`
- Firestore `subscriptions`
- Firestore `rents`
- Google Calendar の指定月イベント

LIFF クライアントは LINE ID token を `Authorization: Bearer <idToken>` として送る。API Route は LINE の token verify API で検証し、Firestore `users/{LINE_USER_ID}` に存在する有効ユーザーだけに表示する。

ローカル確認時だけ `LIFF_DASHBOARD_AUTH_DISABLED=true` で認証をスキップできる。本番では使用しない。

## 画像追加 API

`POST /api/expenses/from-image` に `multipart/form-data` で `image` を送る。

処理内容:

1. LINE ID token を検証する
2. Gemini API で画像から日付・金額・カテゴリー・店舗名を抽出する
3. Google Calendar に支出イベントを作成する
4. Firestore `expenses` に保存する
5. 外食費用かつ当月分の場合は `users.diningBalance` を更新する

## 必要な環境変数

`liff-app/.env.local` に設定する。

```bash
NEXT_PUBLIC_LIFF_ID=2000000000-xxxxxxxx
LINE_CHANNEL_ID=2000000000
GOOGLE_CALENDAR_ID=your-calendar-id@group.calendar.google.com
GEMINI_API_KEY=your-gemini-api-key
LIFF_DASHBOARD_AUTH_DISABLED=false
```

Firestore / Google Calendar 取得には、Next.js 実行環境から Google Application Default Credentials またはサービスアカウント認証を利用できる必要がある。

## 環境変数の取得方法

| 環境変数 | 用途 | 取得方法 |
| --- | --- | --- |
| `NEXT_PUBLIC_LIFF_ID` | LIFF SDK の初期化 | LINE Developers コンソールで LINEログインチャネルを開き、`LIFF` タブで LIFF アプリを追加後に表示される `LIFF ID` を使う |
| `LINE_CHANNEL_ID` | LIFF ID token のサーバー検証 | 同じ LINEログインチャネルの `チャネルID` を使う |
| `GOOGLE_CALENDAR_ID` | Calendar イベントの取得・登録 | Google Calendar の対象カレンダーの「設定と共有」からカレンダーIDを確認する。既存 `settings.calendarId` に保存済みなら省略可能 |
| `GEMINI_API_KEY` | 画像解析 | Google AI Studio で Gemini API キーを作成する |
| `LIFF_DASHBOARD_AUTH_DISABLED` | ローカル確認用の認証スキップ | ローカルでのみ `true` にできる。本番は必ず `false` または未設定 |
| `GOOGLE_APPLICATION_CREDENTIALS` | ローカルで Firestore / Calendar にアクセスするための ADC | サービスアカウントキー JSON を使う場合に、そのファイルパスを指定する。Google Cloud 上では接続済みサービスアカウントを推奨 |

## LINE Developers 側の設定

1. LINE Developers コンソールで LINEログインチャネルを作成または選択する。
2. `LIFF` タブで LIFF アプリを追加する。
3. エンドポイントURLにデプロイ後の LIFF アプリ URL を設定する。
4. Scope は少なくとも `openid`、`profile`、`chat_message.write` を選択する。
   - `openid`: `liff.getIDToken()` で API 認証するために必要
   - `profile`: `liff.getProfile()` で表示名を出すために必要
   - `chat_message.write`: `liff.sendMessages()` で既存 bot コマンドを LINE トークへ送るために必要

## Google Cloud 側の設定

1. Firestore を使っている Google Cloud プロジェクトで、Calendar API と Gemini API を有効化する。
2. LIFF アプリを動かす実行環境のサービスアカウントに、Firestore 読み書き権限を付与する。
3. Google Calendar の対象カレンダーを、サービスアカウントのメールアドレスに共有する。
   - 画像追加・予定登録まで行うため、予定の変更権限が必要
   - 表示だけなら閲覧権限でもよい
4. ローカル開発では、次のどちらかで ADC を用意する。

```bash
# 推奨: 自分の Google アカウントで ADC を作成
gcloud auth application-default login

# サービスアカウントキーを使う場合
export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account-key.json
```

## ローカル設定方法

```bash
cd liff-app
cp .env.example .env.local
```

`.env.local` を編集する。

```bash
NEXT_PUBLIC_LIFF_ID=1234567890-AbcdEfgh
LINE_CHANNEL_ID=1234567890
GOOGLE_CALENDAR_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx@group.calendar.google.com
GEMINI_API_KEY=AIza...
LIFF_DASHBOARD_AUTH_DISABLED=false
```

ローカルで LIFF 認証なしに画面だけ確認する場合:

```bash
LIFF_DASHBOARD_AUTH_DISABLED=true
```

この値は本番環境では設定しない。

## デプロイ先での設定

デプロイ先の環境変数管理画面または CLI で、`.env.local` と同じ値を設定する。`NEXT_PUBLIC_LIFF_ID` はクライアントに公開される値で、その他の `LINE_CHANNEL_ID`、`GOOGLE_CALENDAR_ID`、`GEMINI_API_KEY`、Google 認証情報はサーバー側だけで扱う。

サービスアカウントキー JSON を環境変数として置く運用は避け、Cloud Run / App Hosting / Vercel などの実行環境で Workload Identity または安全な Secret 管理を使う。

## デザイン方針

デジタル庁デザインシステムを参照し、以下を重視する。

- フォームラベル、入力、ボタンの対応関係を明確にする
- フォーカス表示を常に見える状態にする
- 余白は `gap` 中心に揃え、カード内の情報密度を保つ
- 色だけに依存せず、アイコン・テキスト・バッジで状態を表す

テーマカラーは家計簿を連想する台帳グリーン、小口現金の金色、紙の背景色を中心にする。

## 表示速度方針

`my-portfolio` の Next.js 設定を参照し、LIFF アプリにも以下を適用する。

- `compress: true`
- `optimizePackageImports`
- 静的アセットの immutable cache
- AVIF / WebP 優先の画像設定

LIFF 固有の初期表示最適化として、Firestore / Calendar 読み込みは初回描画後に遅延実行する。非表示タブの中身は mount せず、表示中のタブだけ描画する。

## 開発コマンド

```bash
cd liff-app
pnpm install
pnpm typecheck
pnpm build
```

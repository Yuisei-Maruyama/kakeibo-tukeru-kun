import { GoogleGenAI } from "@google/genai";
import { GeminiAnalysisResult } from "../types/index.js";

/**
 * Gemini APIクライアント
 */
let genAIClient: GoogleGenAI | null = null;

/**
 * Gemini APIの初期化
 */
function initializeGemini(apiKey: string): GoogleGenAI {
  if (!genAIClient) {
    genAIClient = new GoogleGenAI({ apiKey });
  }
  return genAIClient;
}

/**
 * レシート画像を解析する
 */
export async function analyzeReceiptImage(
  imageBuffer: Buffer,
  apiKey: string
): Promise<GeminiAnalysisResult> {
  try {
    const ai = initializeGemini(apiKey);

    // 今日の日付を取得してプロンプトに含める
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const todayJP = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;

    const prompt = `あなたはレシートや支払い画面を解析する専門家です。
以下の画像から支出情報を抽出し、必ずJSON形式で出力してください。

【重要：今日の日付】
今日は ${todayJP}（${todayStr}）です。
画像に「今日」「昨日」「一昨日」などの相対的な日付表記がある場合は、今日の日付を基準に計算してください。
- 「今日」= ${todayStr}
- 「昨日」= 今日の1日前
- 「一昨日」= 今日の2日前
- 時刻（例：「昨日 22:22」）は時刻情報として扱い、日付は相対表記から計算してください。

【対応する画像】
- 紙のレシート
- PayPay、LINE Pay、楽天ペイ、d払い、au PAY、メルペイ等の電子決済アプリの支払い完了画面・履歴画面
- クレジットカード決済画面・明細画面
- Uber Eats、出前館等のフードデリバリーアプリの注文完了画面・履歴画面
- ECサイト（Amazon、楽天等）の注文確認画面
- その他の支払い証明画面やスクリーンショット

【出力形式】
必ず以下のJSON形式で出力してください:
{
  "date": "YYYY-MM-DD",
  "amount": 金額(数値),
  "category": "外食費用" or "買い物費用" or "旅行費用",
  "storeName": "店舗名",
  "items": ["商品1", "商品2"]
}

【カテゴリーの判定ルール】
店舗名・サービス名から以下の3つのカテゴリーに分類してください:

■ 外食費用
  - レストラン、飲食店、ファストフード等で「店内飲食」する場合
  - 例: イタリアンレストラン、ラーメン屋、居酒屋、マクドナルド（店内）、吉野家（店内）、寿司屋、和食屋

■ 買い物費用
  - スーパー、コンビニ、ドラッグストア、ECサイト、カフェ等での購入
  - テイクアウト専門店・持ち帰り弁当・ドーナツ店での購入
  - 例: イオン、セブンイレブン、ローソン、ファミリーマート、マツモトキヨシ、Amazon、スターバックス、ドトール、タリーズ
  - テイクアウト系の例: 魚丼、丼丸、ほっともっと、オリジン弁当、ミスタードーナツ、クリスピークリームドーナツ、銀だこ、築地銀だこ、からやま、から好し、かつや（テイクアウト）、天丼てんや（テイクアウト）

■ 旅行費用
  - 交通機関（新幹線、飛行機、バス、タクシー等）の運賃
  - 宿泊施設（ホテル、旅館、民宿等）の宿泊費
  - 観光施設の入場料、レジャー施設の利用料
  - お土産店での購入
  - レンタカーなど旅行関連サービス
  - 例: JR東日本、JR東海、ANA、JAL、楽天トラベル、じゃらん、Airbnb、Booking.com、
        エクスペディア、観光施設チケット、レンタカー、モバイルSuica（新幹線購入）、
        えきねっと、スマートEX、高速バス、旅行会社

【判定のポイント】
- ファミリーマート、セブンイレブン、ローソン等は買い物費用
- カフェ（スターバックス、ドトール、タリーズ等）は買い物費用
- テイクアウト専門店（魚丼、丼丸、ほっともっと、ミスタードーナツ等）は買い物費用
- レストラン名、飲食店名で店内飲食の場合は外食費用
- JR、航空会社、ホテル予約サイト、観光施設等は旅行費用
- 迷った場合は店舗の主な業態で判断（テイクアウト主体なら買い物費用、交通・宿泊関連なら旅行費用）

【重要】
- 金額は数値のみ
- 日付は必ずYYYY-MM-DD形式
- itemsが不明な場合は空配列
- 必ずJSONのみを出力

【解析できない場合】
{
  "error": "解析できませんでした",
  "reason": "具体的な理由"
}`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: imageBuffer.toString("base64"),
                mimeType: "image/jpeg",
              },
            },
          ],
        },
      ],
    });

    const text = response.text ?? "";

    // JSONを抽出（```jsonブロックがある場合も対応）
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("JSON形式のレスポンスが取得できませんでした");
    }

    const analysisResult: GeminiAnalysisResult = JSON.parse(jsonMatch[0]);

    // エラーチェック
    if (analysisResult.error) {
      console.error(
        "Gemini analysis error:",
        analysisResult.error,
        analysisResult.reason
      );
      return analysisResult;
    }

    // 必須フィールドの検証
    if (
      !analysisResult.date ||
      !analysisResult.amount ||
      !analysisResult.category ||
      !analysisResult.storeName
    ) {
      throw new Error("必須フィールドが不足しています");
    }

    return analysisResult;
  } catch (error) {
    console.error("Failed to analyze receipt image:", error);
    const errorMsg = error instanceof Error ? error.message : "不明なエラー";
    const errorStack = error instanceof Error ? error.stack : "";
    console.error("Gemini API error details:", {
      message: errorMsg,
      stack: errorStack,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });
    return {
      date: "",
      amount: 0,
      category: "外食費用",
      storeName: "",
      error: "画像を解析できませんでした",
      reason: errorMsg,
    };
  }
}

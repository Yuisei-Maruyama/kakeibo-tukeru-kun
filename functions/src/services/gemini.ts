import { GoogleGenerativeAI } from '@google/generative-ai';
import { GeminiAnalysisResult } from '../types/index.js';

/**
 * Gemini APIクライアント
 */
let genAI: GoogleGenerativeAI | null = null;

/**
 * Gemini APIの初期化
 */
function initializeGemini(apiKey: string): GoogleGenerativeAI {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

/**
 * レシート画像を解析する
 */
export async function analyzeReceiptImage(
  imageBuffer: Buffer,
  apiKey: string
): Promise<GeminiAnalysisResult> {
  try {
    const genAI = initializeGemini(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });

    const prompt = `あなたはレシートや支払い画面を解析する専門家です。
以下の画像から支出情報を抽出し、必ずJSON形式で出力してください。

【対応する画像】
- 紙のレシート
- PayPay、LINE Pay等の電子決済の支払い完了画面
- クレジットカード決済画面
- その他の支払い証明画面

【出力形式】
必ず以下のJSON形式で出力してください:
{
  "date": "YYYY-MM-DD",
  "amount": 金額(数値),
  "category": "外食費用" or "買い物費用",
  "storeName": "店舗名",
  "items": ["商品1", "商品2"]
}

【カテゴリーの判定ルール】
店舗名から以下の2つのカテゴリーに分類してください:

■ 外食費用
  - レストラン、飲食店、カフェ、ファストフード等での食事
  - 例: イタリアンレストラン、ラーメン屋、居酒屋、スターバックス、マクドナルド、吉野家

■ 買い物費用
  - スーパー、コンビニ、ドラッグストア、ECサイト等での購入
  - 例: イオン、セブンイレブン、ローソン、ファミリーマート、マツモトキヨシ、Amazon

【判定のポイント】
- ファミリーマート、セブンイレブン、ローソン等は買い物費用
- レストラン名、カフェ名、飲食店名は外食費用
- 迷った場合は店舗の主な業態で判断

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

    const imagePart = {
      inlineData: {
        data: imageBuffer.toString('base64'),
        mimeType: 'image/jpeg',
      },
    };

    const result = await model.generateContent([prompt, imagePart]);
    const response = result.response;
    const text = response.text();

    // JSONを抽出（```jsonブロックがある場合も対応）
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('JSON形式のレスポンスが取得できませんでした');
    }

    const analysisResult: GeminiAnalysisResult = JSON.parse(jsonMatch[0]);

    // エラーチェック
    if (analysisResult.error) {
      console.error('Gemini analysis error:', analysisResult.error, analysisResult.reason);
      return analysisResult;
    }

    // 必須フィールドの検証
    if (!analysisResult.date || !analysisResult.amount || !analysisResult.category || !analysisResult.storeName) {
      throw new Error('必須フィールドが不足しています');
    }

    return analysisResult;
  } catch (error) {
    console.error('Failed to analyze receipt image:', error);
    return {
      date: '',
      amount: 0,
      category: '外食費用',
      storeName: '',
      error: '画像を解析できませんでした',
      reason: error instanceof Error ? error.message : '不明なエラー',
    };
  }
}

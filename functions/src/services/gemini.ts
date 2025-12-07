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
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `以下のレシート/支払い画面の画像を解析し、JSON形式で情報を抽出してください。

出力形式:
{
  "date": "YYYY-MM-DD",
  "amount": 金額（数値）,
  "category": "カテゴリー名",
  "storeName": "店舗名",
  "items": ["商品1", "商品2"]
}

【カテゴリーの判定ルール】
店舗名から以下の2つのカテゴリーに分類してください:

■ 外食費用
  - レストラン、飲食店、個人店での食事
  - 例: イタリアンレストラン、ラーメン屋、居酒屋、カフェ、ファミレス、牛丼チェーン

■ 買い物費用
  - スーパー、コンビニ、ドラッグストア等での購入
  - 例: イオン、セブンイレブン、ローソン、ファミリーマート、マツモトキヨシ、業務スーパー

判定のポイント:
- 店舗名に「レストラン」「食堂」「屋」「亭」「庵」などが含まれる → 外食費用
- 店舗名に「スーパー」「マート」「ストア」「コンビニ」などが含まれる → 買い物費用
- 迷った場合は店舗の主な業態で判断

画像が不鮮明または解析できない場合は:
{
  "error": "解析できませんでした",
  "reason": "理由"
}

JSONのみを出力し、説明文は含めないでください。`;

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

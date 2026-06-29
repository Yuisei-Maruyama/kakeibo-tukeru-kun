import { Firestore, Timestamp } from "@google-cloud/firestore";
import { GoogleGenAI } from "@google/genai";
import { google, type calendar_v3 } from "googleapis";
import { NextRequest, NextResponse } from "next/server";
import { createFirestoreClient, createGoogleAuth } from "@/lib/google-server";
import type { DashboardExpenseCategory } from "@/types/dashboard";

export const runtime = "nodejs";

type FirestoreUser = {
  id: string;
  displayName: string;
  groupId: string;
  isActive: boolean;
  diningBalance: number;
};

type AnalysisResult = {
  date: string;
  amount: number;
  category: Exclude<DashboardExpenseCategory, "家賃費用">;
  storeName: string;
  items?: string[];
  error?: string;
  reason?: string;
};

let firestore: Firestore | null = null;
let calendarClient: calendar_v3.Calendar | null = null;
let genAIClient: GoogleGenAI | null = null;

function getFirestore() {
  if (!firestore) {
    firestore = createFirestoreClient();
  }

  return firestore;
}

function getCalendarClient() {
  if (!calendarClient) {
    const auth = createGoogleAuth(["https://www.googleapis.com/auth/calendar"]);
    calendarClient = google.calendar({ version: "v3", auth });
  }

  return calendarClient;
}

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY が未設定です");
  }

  if (!genAIClient) {
    genAIClient = new GoogleGenAI({ apiKey });
  }

  return genAIClient;
}

function addDaysToDateString(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

function getCurrentJSTDateLabel() {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function isCurrentJSTMonth(date: string) {
  return date.slice(0, 7) === getCurrentJSTDateLabel().slice(0, 7);
}

function getColorId(category: AnalysisResult["category"]) {
  if (category === "外食費用") {
    return "4";
  }

  if (category === "買い物費用") {
    return "5";
  }

  return "1";
}

async function verifyLineUser(request: NextRequest): Promise<FirestoreUser> {
  const db = getFirestore();

  if (process.env.LIFF_DASHBOARD_AUTH_DISABLED === "true") {
    const snapshot = await db.collection("users").where("isActive", "==", true).limit(1).get();
    if (!snapshot.empty) {
      return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as FirestoreUser;
    }

    return {
      id: "local-preview",
      displayName: "LIFFプレビュー",
      groupId: "",
      isActive: true,
      diningBalance: 0,
    };
  }

  const channelId = process.env.LINE_CHANNEL_ID;
  if (!channelId) {
    throw new Error("LINE_CHANNEL_ID が未設定です");
  }

  const authorization = request.headers.get("authorization") ?? "";
  const idToken = authorization.replace(/^Bearer\s+/i, "");
  if (!idToken) {
    throw new Error("LIFF ID token がありません");
  }

  const response = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      id_token: idToken,
      client_id: channelId,
    }),
  });

  if (!response.ok) {
    throw new Error("LINE ID token の検証に失敗しました");
  }

  const verified = (await response.json()) as { sub: string };
  const userDoc = await db.collection("users").doc(verified.sub).get();
  if (!userDoc.exists) {
    throw new Error(
      "家計ぼっとに登録済みの LINE ユーザーではありません。同じプロバイダーの LINEログインチャネルを使ってください",
    );
  }

  const user = { id: userDoc.id, ...userDoc.data() } as FirestoreUser;
  if (!user.isActive) {
    throw new Error("このユーザーは無効です");
  }

  return user;
}

async function getCalendarId() {
  const settingsDoc = await getFirestore().collection("settings").doc("global").get();
  const settingsCalendarId = settingsDoc.exists
    ? (settingsDoc.data()?.calendarId as string | undefined)
    : undefined;

  return settingsCalendarId || process.env.GOOGLE_CALENDAR_ID || "";
}

async function analyzeReceiptImage(file: File): Promise<AnalysisResult> {
  const today = getCurrentJSTDateLabel();
  const imageBuffer = Buffer.from(await file.arrayBuffer());

  const prompt = `あなたはレシートや支払い画面を解析する専門家です。
今日は ${today} です。画像から支出情報を抽出し、必ずJSONのみで返してください。

出力形式:
{
  "date": "YYYY-MM-DD",
  "amount": 金額(数値),
  "category": "外食費用" or "買い物費用" or "旅行費用",
  "storeName": "店舗名",
  "items": ["商品1", "商品2"]
}

カテゴリー:
- 外食費用: レストラン、飲食店、居酒屋、店内飲食
- 買い物費用: スーパー、コンビニ、ドラッグストア、EC、テイクアウト
- 旅行費用: 交通、宿泊、観光、旅行予約、お土産

解析できない場合:
{
  "error": "解析できませんでした",
  "reason": "具体的な理由"
}`;

  const response = await getGeminiClient().models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          {
            inlineData: {
              data: imageBuffer.toString("base64"),
              mimeType: file.type || "image/jpeg",
            },
          },
        ],
      },
    ],
  });

  const jsonMatch = (response.text ?? "").match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("画像解析結果をJSONとして取得できませんでした");
  }

  const result = JSON.parse(jsonMatch[0]) as AnalysisResult;
  if (result.error) {
    throw new Error(result.reason || result.error);
  }

  if (!result.date || !result.amount || !result.category || !result.storeName) {
    throw new Error("画像解析結果に必須項目がありません");
  }

  return result;
}

async function createCalendarEvent(
  calendarId: string,
  user: FirestoreUser,
  result: AnalysisResult,
) {
  if (!calendarId) {
    throw new Error("Google Calendar ID が未設定です");
  }

  const response = await getCalendarClient().events.insert({
    calendarId,
    requestBody: {
      summary: `[${result.category}]  ${user.displayName}　￥${result.amount.toLocaleString()}`,
      description: [
        `店舗: ${result.storeName}`,
        result.items?.length ? `商品: ${result.items.join(", ")}` : "",
        "登録元: LIFF家計ぼっと",
      ]
        .filter(Boolean)
        .join("\n"),
      start: {
        date: result.date,
      },
      end: {
        date: addDaysToDateString(result.date, 1),
      },
      colorId: getColorId(result.category),
    },
  });

  if (!response.data.id) {
    throw new Error("Google Calendar のイベントIDを取得できませんでした");
  }

  return response.data.id;
}

async function saveExpense(user: FirestoreUser, result: AnalysisResult, calendarEventId: string) {
  const db = getFirestore();
  const expenseRef = db.collection("expenses").doc();
  const expense = {
    id: expenseRef.id,
    userId: user.id,
    userName: user.displayName,
    amount: result.amount,
    category: result.category,
    storeName: result.storeName,
    date: Timestamp.fromDate(new Date(`${result.date}T00:00:00.000Z`)),
    calendarEventId,
    createdAt: Timestamp.now(),
  };

  await expenseRef.set(expense);

  let diningBalance: number | undefined;
  if (result.category === "外食費用" && isCurrentJSTMonth(result.date)) {
    const userRef = db.collection("users").doc(user.id);
    diningBalance = await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) {
        return undefined;
      }

      const currentBalance = Number(userDoc.data()?.diningBalance ?? 0);
      const nextBalance = currentBalance - result.amount;
      transaction.update(userRef, {
        diningBalance: nextBalance,
        updatedAt: Timestamp.now(),
      });
      return nextBalance;
    });
  }

  return {
    expense,
    diningBalance,
  };
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyLineUser(request);
    const formData = await request.formData();
    const file = formData.get("image");

    if (!(file instanceof File) || !file.type.startsWith("image/")) {
      throw new Error("画像ファイルを選択してください");
    }

    const result = await analyzeReceiptImage(file);
    const calendarEventId = await createCalendarEvent(await getCalendarId(), user, result);
    const { expense, diningBalance } = await saveExpense(user, result, calendarEventId);

    return NextResponse.json({
      status: "ok",
      message: "画像から支出を登録しました",
      diningBalance,
      expense: {
        id: expense.id,
        date: result.date,
        category: result.category,
        payer: user.displayName,
        amount: result.amount,
        storeName: result.storeName,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "画像登録に失敗しました";
    return NextResponse.json({ status: "error", message }, { status: 400 });
  }
}

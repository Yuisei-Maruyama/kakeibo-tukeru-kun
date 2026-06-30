import { Timestamp } from "@google-cloud/firestore";
import { NextRequest, NextResponse } from "next/server";
import {
  applyDiningBalanceForCreate,
  assertDateString,
  assertPositiveAmount,
  createExpenseCalendarEvent,
  dateStringToTimestamp,
  deleteCalendarEvent,
  getAuthorizedContext,
  getCalendarId,
  getErrorMessage,
  getFirestore,
  isExpenseCategory,
  mapExpenseForClient,
  resolveUserByName,
  type ExpenseCategory,
  type StoredExpense,
} from "@/lib/liff-server";

export const runtime = "nodejs";

type ExpenseRequestBody = {
  payer?: string;
  category?: string;
  amount?: number;
  date?: string;
  storeName?: string;
  memo?: string;
};

function parseExpenseBody(body: ExpenseRequestBody) {
  if (!isExpenseCategory(body.category)) {
    throw new Error("カテゴリーは外食費用・買い物費用・旅行費用から選択してください");
  }

  const storeName = body.storeName?.trim() || "手動入力";

  return {
    payer: body.payer?.trim() || "@自分",
    category: body.category as ExpenseCategory,
    amount: assertPositiveAmount(body.amount),
    date: assertDateString(body.date),
    storeName,
    memo: body.memo?.trim() || undefined,
  };
}

export async function POST(request: NextRequest) {
  try {
    const context = await getAuthorizedContext(request);
    const body = parseExpenseBody((await request.json()) as ExpenseRequestBody);
    const payer = resolveUserByName(body.payer, context);
    const db = getFirestore();
    const expenseRef = db.collection("expenses").doc();
    const calendarId = getCalendarId(context.settings);
    const calendarEventId = await createExpenseCalendarEvent(
      calendarId,
      {
        userName: payer.displayName,
        amount: body.amount,
        category: body.category,
        storeName: body.storeName,
        date: body.date,
        memo: body.memo,
      },
    );

    const expense: StoredExpense = {
      id: expenseRef.id,
      userId: payer.id,
      userName: payer.displayName,
      amount: body.amount,
      category: body.category,
      storeName: body.storeName,
      memo: body.memo,
      date: dateStringToTimestamp(body.date),
      calendarEventId,
      createdAt: Timestamp.now(),
    };

    try {
      await expenseRef.set(expense);
    } catch (error) {
      await deleteCalendarEvent(calendarId, calendarEventId).catch(() => undefined);
      throw error;
    }
    const diningBalance = await applyDiningBalanceForCreate(expense);

    return NextResponse.json({
      status: "ok",
      message: "Firestore / Google Calendar に支出を保存しました",
      diningBalance,
      expense: mapExpenseForClient(expense),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: getErrorMessage(error, "支出の保存に失敗しました"),
      },
      { status: 400 },
    );
  }
}

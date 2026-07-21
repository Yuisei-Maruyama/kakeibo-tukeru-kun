import { NextRequest, NextResponse } from "next/server";
import {
  applyDiningBalanceForDelete,
  assertDateString,
  assertPositiveAmount,
  createExpenseCalendarEvent,
  dateStringToTimestamp,
  deleteCalendarEvent,
  ensureGroupExpenseAccess,
  getAuthorizedContext,
  getCalendarId,
  getDashboardUsers,
  getErrorMessage,
  getFirestore,
  isExpenseCategory,
  mapExpenseForClient,
  resolveUserByName,
  updateExpenseCalendarEvent,
  updateExpenseWithBalance,
  type ExpenseCategory,
  type StoredExpense,
} from "@/lib/liff-server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

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

  return {
    payer: body.payer?.trim() || "@自分",
    category: body.category as ExpenseCategory,
    amount: assertPositiveAmount(body.amount),
    date: assertDateString(body.date),
    storeName: body.storeName?.trim() || "手動入力",
    memo: body.memo?.trim() || undefined,
  };
}

async function getExpense(id: string) {
  const doc = await getFirestore().collection("expenses").doc(id).get();
  if (!doc.exists) {
    throw new Error("対象の支出が見つかりませんでした");
  }

  return { id: doc.id, ...doc.data() } as StoredExpense;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const [{ id }, authorizedContext] = await Promise.all([
      context.params,
      getAuthorizedContext(request),
    ]);
    const before = await getExpense(id);
    ensureGroupExpenseAccess(before, authorizedContext);

    const body = parseExpenseBody((await request.json()) as ExpenseRequestBody);
    const payer = resolveUserByName(body.payer, authorizedContext);
    const calendarId = getCalendarId(authorizedContext.settings);
    let calendarEventId = before.calendarEventId;

    const calendarPayload = {
      userName: payer.displayName,
      amount: body.amount,
      category: body.category,
      storeName: body.storeName,
      date: body.date,
      memo: body.memo,
    };

    if (calendarEventId) {
      await updateExpenseCalendarEvent(calendarId, calendarEventId, calendarPayload);
    } else {
      calendarEventId = await createExpenseCalendarEvent(calendarId, calendarPayload);
    }

    const after: StoredExpense = {
      ...before,
      userId: payer.id,
      userName: payer.displayName,
      amount: body.amount,
      category: body.category,
      storeName: body.storeName,
      memo: body.memo,
      date: dateStringToTimestamp(body.date),
      calendarEventId,
    };

    const diningBalance = await updateExpenseWithBalance(id, before, after);
    const users = await getDashboardUsers(authorizedContext.groupId);

    return NextResponse.json({
      status: "ok",
      message: "Firestore / Google Calendar の支出を更新しました",
      diningBalance,
      users,
      expense: mapExpenseForClient(after),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: getErrorMessage(error, "支出の更新に失敗しました"),
      },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const [{ id }, authorizedContext] = await Promise.all([
      context.params,
      getAuthorizedContext(request),
    ]);
    const expense = await getExpense(id);
    ensureGroupExpenseAccess(expense, authorizedContext);

    if (expense.calendarEventId) {
      await deleteCalendarEvent(getCalendarId(authorizedContext.settings), expense.calendarEventId);
    }

    await getFirestore().collection("expenses").doc(id).delete();
    const diningBalance = await applyDiningBalanceForDelete(expense);
    const users = await getDashboardUsers(authorizedContext.groupId);

    return NextResponse.json({
      status: "ok",
      message: "Firestore / Google Calendar から支出を削除しました",
      diningBalance,
      users,
      expense: mapExpenseForClient(expense),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: getErrorMessage(error, "支出の削除に失敗しました"),
      },
      { status: 400 },
    );
  }
}

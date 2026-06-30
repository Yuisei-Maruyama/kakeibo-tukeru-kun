import { Timestamp } from "@google-cloud/firestore";
import { NextRequest, NextResponse } from "next/server";
import {
  assertPositiveAmount,
  getAuthorizedContext,
  getErrorMessage,
  getFirestore,
  recalculateDiningBalances,
} from "@/lib/liff-server";

export const runtime = "nodejs";

type BudgetRequestBody = {
  monthlyBudget?: number;
};

export async function PUT(request: NextRequest) {
  try {
    const context = await getAuthorizedContext(request);
    const body = (await request.json()) as BudgetRequestBody;
    const monthlyBudget = assertPositiveAmount(body.monthlyBudget, "月額予算");

    await getFirestore().collection("settings").doc("global").set(
      {
        monthlyBudget,
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    );
    const users = await recalculateDiningBalances(monthlyBudget);
    const visibleUsers = context.groupId
      ? users.filter((user) => user.groupId === context.groupId)
      : users;

    return NextResponse.json({
      status: "ok",
      message: "Firestore の予算と外食残高を更新しました",
      monthlyBudget,
      users: visibleUsers,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: getErrorMessage(error, "予算変更に失敗しました"),
      },
      { status: 400 },
    );
  }
}

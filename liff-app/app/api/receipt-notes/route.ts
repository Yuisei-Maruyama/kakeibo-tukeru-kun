import { Timestamp } from "@google-cloud/firestore";
import { NextRequest, NextResponse } from "next/server";
import {
  assertNonNegativeAmount,
  assertPositiveAmount,
  assertReceiptNoteCategory,
  assertYearMonth,
  getAuthorizedContext,
  getErrorMessage,
  getFirestore,
  mapReceiptNoteForClient,
  resolveReceiptNoteUser,
  todayJstDateString,
} from "@/lib/liff-server";

export const runtime = "nodejs";

type ReceiptNoteRequestBody = {
  month?: string;
  category?: string;
  userName?: string;
  amount?: number;
  selfConfirmed?: boolean;
  source?: string;
  isActive?: boolean;
};

function parseReceiptNoteBody(body: ReceiptNoteRequestBody) {
  const source = body.source === "summary" ? "summary" : "manual";

  return {
    month: assertYearMonth(body.month),
    category: assertReceiptNoteCategory(body.category),
    userName: body.userName?.trim() || "@自分",
    // 手動追加は 1 円以上を必須にする（自動集計行は 0 円を許容）
    amount:
      source === "manual"
        ? assertPositiveAmount(body.amount)
        : assertNonNegativeAmount(body.amount),
    selfConfirmed: Boolean(body.selfConfirmed),
    source,
    isActive: body.isActive !== false,
  };
}

export async function POST(request: NextRequest) {
  try {
    const context = await getAuthorizedContext(request);
    const body = parseReceiptNoteBody((await request.json()) as ReceiptNoteRequestBody);
    const user = resolveReceiptNoteUser(body, context);
    const groupUserIds = context.users.map((item) => item.id);
    // selfConfirmed 時は認証ユーザーの確認を当日 JST で記録し、received は導出する
    const confirmations = body.selfConfirmed
      ? { [context.user.id]: todayJstDateString() }
      : {};
    const received = groupUserIds.every((userId) => userId in confirmations);
    const receiptNoteRef = getFirestore().collection("receiptNotes").doc();
    const receiptNote = {
      id: receiptNoteRef.id,
      groupId: context.groupId,
      month: body.month,
      category: body.category,
      userId: user.id,
      userName: user.displayName,
      amount: body.amount,
      confirmations,
      received,
      source: body.source,
      isActive: body.isActive,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await receiptNoteRef.set(receiptNote);

    return NextResponse.json({
      status: "ok",
      message: "Firestore に受領ノートを保存しました",
      receiptNote: mapReceiptNoteForClient(receiptNoteRef.id, receiptNote, groupUserIds),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: getErrorMessage(error, "受領ノートの保存に失敗しました"),
      },
      { status: 400 },
    );
  }
}

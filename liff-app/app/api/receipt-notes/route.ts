import { Timestamp } from "@google-cloud/firestore";
import { NextRequest, NextResponse } from "next/server";
import {
  assertNonNegativeAmount,
  assertReceiptNoteCategory,
  assertYearMonth,
  getAuthorizedContext,
  getErrorMessage,
  getFirestore,
  mapReceiptNoteForClient,
  resolveReceiptNoteUser,
} from "@/lib/liff-server";

export const runtime = "nodejs";

type ReceiptNoteRequestBody = {
  month?: string;
  category?: string;
  userName?: string;
  amount?: number;
  received?: boolean;
  source?: string;
  isActive?: boolean;
};

function parseReceiptNoteBody(body: ReceiptNoteRequestBody) {
  return {
    month: assertYearMonth(body.month),
    category: assertReceiptNoteCategory(body.category),
    userName: body.userName?.trim() || "@自分",
    amount: assertNonNegativeAmount(body.amount),
    received: Boolean(body.received),
    source: body.source === "summary" ? "summary" : "manual",
    isActive: body.isActive !== false,
  };
}

export async function POST(request: NextRequest) {
  try {
    const context = await getAuthorizedContext(request);
    const body = parseReceiptNoteBody((await request.json()) as ReceiptNoteRequestBody);
    const user = resolveReceiptNoteUser(body, context);
    const receiptNoteRef = getFirestore().collection("receiptNotes").doc();
    const receiptNote = {
      id: receiptNoteRef.id,
      groupId: context.groupId,
      month: body.month,
      category: body.category,
      userId: user.id,
      userName: user.displayName,
      amount: body.amount,
      received: body.received,
      source: body.source,
      isActive: body.isActive,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await receiptNoteRef.set(receiptNote);

    return NextResponse.json({
      status: "ok",
      message: "Firestore に受領ノートを保存しました",
      receiptNote: mapReceiptNoteForClient(receiptNoteRef.id, receiptNote),
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

import { Timestamp } from "@google-cloud/firestore";
import { NextRequest, NextResponse } from "next/server";
import {
  assertDateString,
  assertReceiptNoteCategory,
  assertYearMonth,
  dateStringToTimestamp,
  ensureGroupReceiptNoteAccess,
  getAuthorizedContext,
  getErrorMessage,
  getFirestore,
  mapReceiptNoteConfirmationForClient,
  resolveUserByName,
} from "@/lib/liff-server";

export const runtime = "nodejs";

type ReceiptNoteConfirmationRequestBody = {
  month?: string;
  category?: string;
  confirmedBy?: string;
  date?: string;
  checked?: boolean;
};

function createConfirmationId(groupId: string, month: string, category: string) {
  return `${encodeURIComponent(groupId || "global")}_${month}_${category}`;
}

function parseConfirmationBody(body: ReceiptNoteConfirmationRequestBody) {
  return {
    month: assertYearMonth(body.month),
    category: assertReceiptNoteCategory(body.category),
    confirmedBy: body.confirmedBy?.trim() || "@自分",
    date: assertDateString(body.date, "確認日"),
    checked: Boolean(body.checked),
  };
}

export async function PUT(request: NextRequest) {
  try {
    const context = await getAuthorizedContext(request);
    const body = parseConfirmationBody(
      (await request.json()) as ReceiptNoteConfirmationRequestBody,
    );
    const confirmedByUser = resolveUserByName(body.confirmedBy, context);
    const confirmationId = createConfirmationId(
      context.groupId,
      body.month,
      body.category,
    );
    const confirmationRef = getFirestore()
      .collection("receiptNoteConfirmations")
      .doc(confirmationId);
    const confirmationDoc = await confirmationRef.get();
    if (confirmationDoc.exists) {
      ensureGroupReceiptNoteAccess(confirmationDoc.data() ?? {}, context);
    }

    const now = Timestamp.now();
    const confirmation = {
      id: confirmationId,
      groupId: context.groupId,
      month: body.month,
      category: body.category,
      confirmedByUserId: confirmedByUser.id,
      confirmedBy: confirmedByUser.displayName,
      date: dateStringToTimestamp(body.date),
      checked: body.checked,
      createdAt: confirmationDoc.exists ? confirmationDoc.data()?.createdAt ?? now : now,
      updatedAt: now,
    };

    await confirmationRef.set(confirmation, { merge: true });

    return NextResponse.json({
      status: "ok",
      message: "Firestore に受領ノートの全体確認を保存しました",
      confirmation: mapReceiptNoteConfirmationForClient(
        confirmationId,
        confirmation,
      ),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: getErrorMessage(error, "受領ノートの全体確認保存に失敗しました"),
      },
      { status: 400 },
    );
  }
}

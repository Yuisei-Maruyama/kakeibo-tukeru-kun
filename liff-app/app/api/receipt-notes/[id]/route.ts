import { Timestamp } from "@google-cloud/firestore";
import { NextRequest, NextResponse } from "next/server";
import {
  assertNonNegativeAmount,
  assertReceiptNoteCategory,
  ensureGroupReceiptNoteAccess,
  getAuthorizedContext,
  getErrorMessage,
  getFirestore,
  mapReceiptNoteForClient,
  resolveReceiptNoteUser,
} from "@/lib/liff-server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ReceiptNoteRequestBody = {
  category?: string;
  userName?: string;
  amount?: number;
  received?: boolean;
};

function parseReceiptNoteBody(body: ReceiptNoteRequestBody) {
  return {
    category: assertReceiptNoteCategory(body.category),
    userName: body.userName?.trim() || "@自分",
    amount: assertNonNegativeAmount(body.amount),
    received: Boolean(body.received),
  };
}

async function getReceiptNote(id: string) {
  const doc = await getFirestore().collection("receiptNotes").doc(id).get();
  if (!doc.exists) {
    throw new Error("対象の受領ノートが見つかりませんでした");
  }

  return { id: doc.id, ...doc.data() } as Record<string, unknown>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const [{ id }, authorizedContext] = await Promise.all([
      context.params,
      getAuthorizedContext(request),
    ]);
    const before = await getReceiptNote(id);
    ensureGroupReceiptNoteAccess(before, authorizedContext);

    const body = parseReceiptNoteBody((await request.json()) as ReceiptNoteRequestBody);
    const user = resolveReceiptNoteUser(body, authorizedContext);
    const updates = {
      category: body.category,
      userId: user.id,
      userName: user.displayName,
      amount: body.amount,
      received: body.received,
      updatedAt: Timestamp.now(),
    };

    await getFirestore().collection("receiptNotes").doc(id).update(updates);

    return NextResponse.json({
      status: "ok",
      message: "Firestore の受領ノートを更新しました",
      receiptNote: mapReceiptNoteForClient(id, { ...before, ...updates }),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: getErrorMessage(error, "受領ノートの更新に失敗しました"),
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
    const before = await getReceiptNote(id);
    ensureGroupReceiptNoteAccess(before, authorizedContext);

    await getFirestore().collection("receiptNotes").doc(id).update({
      isActive: false,
      updatedAt: Timestamp.now(),
    });

    return NextResponse.json({
      status: "ok",
      message: "Firestore の受領ノートを削除しました",
      receiptNote: mapReceiptNoteForClient(id, {
        ...before,
        isActive: false,
      }),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: getErrorMessage(error, "受領ノートの削除に失敗しました"),
      },
      { status: 400 },
    );
  }
}

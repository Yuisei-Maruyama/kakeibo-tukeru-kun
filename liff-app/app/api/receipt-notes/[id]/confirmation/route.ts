import { FieldValue, Timestamp } from "@google-cloud/firestore";
import { NextRequest, NextResponse } from "next/server";
import {
  ensureGroupReceiptNoteAccess,
  getAuthorizedContext,
  getErrorMessage,
  getFirestore,
  mapReceiptNoteForClient,
  todayJstDateString,
} from "@/lib/liff-server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ConfirmationRequestBody = {
  confirmed?: boolean;
};

async function getReceiptNote(id: string) {
  const doc = await getFirestore().collection("receiptNotes").doc(id).get();
  if (!doc.exists) {
    throw new Error("対象の受領ノートが見つかりませんでした");
  }

  return { id: doc.id, ...doc.data() } as Record<string, unknown>;
}

// received 導出のため、doc に保存済みの confirmations（日付マップ）を読み出す
function readStoredConfirmations(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const result: Record<string, string> = {};
  for (const [userId, date] of Object.entries(value as Record<string, unknown>)) {
    if (typeof date === "string" && date) {
      result[userId] = date;
    }
  }

  return result;
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const [{ id }, authorizedContext] = await Promise.all([
      context.params,
      getAuthorizedContext(request),
    ]);
    const before = await getReceiptNote(id);
    ensureGroupReceiptNoteAccess(before, authorizedContext);

    const body = (await request.json()) as ConfirmationRequestBody;
    const confirmed = Boolean(body.confirmed);
    // 操作対象は認証ユーザー固定（他人の確認は書き換えられない）
    const uid = authorizedContext.user.id;
    const groupUserIds = authorizedContext.users.map((item) => item.id);
    const today = todayJstDateString();

    // 読み取り済み confirmations に今回の変更を適用し received を導出する（軽微なレースは許容）
    const nextConfirmations = readStoredConfirmations(before.confirmations);
    if (confirmed) {
      nextConfirmations[uid] = today;
    } else {
      delete nextConfirmations[uid];
    }
    const received = groupUserIds.every((userId) => userId in nextConfirmations);

    // ドットパス update で同時確認のレースを避ける（read-merge-set は使わない）
    await getFirestore().collection("receiptNotes").doc(id).update({
      [`confirmations.${uid}`]: confirmed ? today : FieldValue.delete(),
      received,
      updatedAt: Timestamp.now(),
    });

    return NextResponse.json({
      status: "ok",
      message: "受領ノートの確認を更新しました",
      receiptNote: mapReceiptNoteForClient(
        id,
        { ...before, confirmations: nextConfirmations, received },
        groupUserIds,
      ),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: getErrorMessage(error, "受領ノートの確認更新に失敗しました"),
      },
      { status: 400 },
    );
  }
}

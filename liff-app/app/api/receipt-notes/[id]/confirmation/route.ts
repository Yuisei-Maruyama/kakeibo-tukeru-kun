import { Timestamp } from "@google-cloud/firestore";
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
  snapshot?: { amount?: number; userId?: string };
};

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
    const body = (await request.json()) as ConfirmationRequestBody;
    const confirmed = Boolean(body.confirmed);
    // 操作対象は認証ユーザー固定（他人の確認は書き換えられない）
    const uid = authorizedContext.user.id;
    const groupUserIds = authorizedContext.users.map((item) => item.id);
    const today = todayJstDateString();

    // 読み取り済み confirmations に今回の変更を適用し received を導出する（軽微なレースは許容）
    const db = getFirestore();
    const ref = db.collection("receiptNotes").doc(id);
    const before = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) {
        throw new Error("対象の受領ノートが見つかりませんでした");
      }
      const note = { id: snapshot.id, ...snapshot.data() } as Record<string, unknown>;
      ensureGroupReceiptNoteAccess(note, authorizedContext);
      // 算出値に追従するのは外食貯金・精算のみ。「その他」は userName がタイトルのため常に固定扱い
      const fixed =
        note.category === "other" || note.amountLocked !== false || note.received === true;
      // スナップショットは金額が整数かつ対象ユーザーがグループ内のときだけ採用する
      const snapshotUserId = body.snapshot?.userId;
      const appliesSnapshot =
        !fixed &&
        confirmed &&
        Number.isInteger(body.snapshot?.amount) &&
        typeof snapshotUserId === "string" &&
        authorizedContext.users.some((user) => user.id === snapshotUserId);
      const nextUserId = appliesSnapshot ? snapshotUserId : String(note.userId ?? "");
      const nextConfirmations = readStoredConfirmations(note.confirmations);
      if (nextUserId !== note.userId) {
        for (const key of Object.keys(nextConfirmations)) {
          delete nextConfirmations[key];
        }
      }
      if (confirmed) {
        nextConfirmations[uid] = today;
      } else {
        delete nextConfirmations[uid];
      }
      const received = groupUserIds.every((userId) => userId in nextConfirmations);
      const updates: Record<string, unknown> = {
        confirmations: nextConfirmations,
        received,
        // 全員確認で値を確定し、後から誰かが確認を外しても算出値への追従に戻さない
        ...(received && note.category !== "other" ? { amountLocked: true } : {}),
        updatedAt: Timestamp.now(),
      };
      if (appliesSnapshot) {
        updates.amount = body.snapshot?.amount;
        updates.userId = nextUserId;
        const user = authorizedContext.users.find((item) => item.id === nextUserId);
        if (user) {
          updates.userName = user.displayName;
        }
      }
      transaction.update(ref, updates);
      return { ...note, ...updates };
    });

    return NextResponse.json({
      status: "ok",
      message: "受領ノートの確認を更新しました",
      receiptNote: mapReceiptNoteForClient(
        id,
        before,
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

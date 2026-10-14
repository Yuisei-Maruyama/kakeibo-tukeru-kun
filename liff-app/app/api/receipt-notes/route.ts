import { Timestamp, type Transaction } from "@google-cloud/firestore";
import { NextRequest, NextResponse } from "next/server";
import {
  assertIntegerAmount,
  assertPositiveAmount,
  assertReceiptNoteCategory,
  assertYearMonth,
  getAuthorizedContext,
  getErrorMessage,
  getFirestore,
  mapReceiptNoteForClient,
  normalizeReceiptNoteConfirmations,
  resolveReceiptNoteUser,
  todayJstDateString,
} from "@/lib/liff-server";
import type { ReceiptNoteCategory } from "@/types/dashboard";

export const runtime = "nodejs";

type ReceiptNoteRequestBody = {
  month?: string;
  category?: string;
  userName?: string;
  payerId?: string;
  amount?: number;
  selfConfirmed?: boolean;
  source?: string;
  isActive?: boolean;
  lockAmount?: boolean;
  originalUserId?: string;
};

function parseReceiptNoteBody(body: ReceiptNoteRequestBody) {
  const source = body.source === "summary" ? "summary" : "manual";

  return {
    month: assertYearMonth(body.month),
    category: assertReceiptNoteCategory(body.category),
    userName: body.userName?.trim() || "@自分",
    payerId: body.payerId,
    // 手動追加は 1 円以上を必須にする（自動集計行は予算超過のマイナスも許容）
    amount:
      source === "manual"
        ? assertPositiveAmount(body.amount)
        : assertIntegerAmount(body.amount),
    selfConfirmed: Boolean(body.selfConfirmed),
    source,
    isActive: body.isActive !== false,
    lockAmount: Boolean(body.lockAmount),
    originalUserId: body.originalUserId,
  };
}

/**
 * 同じ自動行を表す `source: summary` の受領ノートを探す（論理削除済みも含む）。
 * 外食貯金はユーザーごと、精算・その他（家賃代）は月×カテゴリーで 1 件とみなす。
 * 有効なノートを優先し、無ければ論理削除済みを返す。
 * @param transaction 実体化を行うトランザクション
 * @param key 判定キー（groupId・month・category・保存先 userId）
 * @returns 既存ノートのスナップショット。無ければ undefined
 */
async function findSummaryReceiptNote(
  transaction: Transaction,
  key: { groupId: string; month: string; category: ReceiptNoteCategory; userId: string },
) {
  const snapshot = await transaction.get(
    getFirestore()
      .collection("receiptNotes")
      .where("groupId", "==", key.groupId)
      .where("month", "==", key.month)
      .where("category", "==", key.category),
  );
  const candidates = snapshot.docs.filter((doc) => {
    const data = doc.data();
    return (
      data.source === "summary" &&
      (key.category !== "diningSaving" || data.userId === key.userId)
    );
  });

  return candidates.find((doc) => doc.data().isActive !== false) ?? candidates[0];
}

export async function POST(request: NextRequest) {
  try {
    const context = await getAuthorizedContext(request);
    const body = parseReceiptNoteBody((await request.json()) as ReceiptNoteRequestBody);
    const user = resolveReceiptNoteUser(body, context);
    const groupUserIds = context.users.map((item) => item.id);
    const db = getFirestore();

    // 自動行の実体化は複数端末から同時に起こり得るため、トランザクション内で既存ノートへ upsert する
    const saved = await db.runTransaction(async (transaction) => {
      const existing =
        body.source === "summary"
          ? await findSummaryReceiptNote(transaction, {
              groupId: context.groupId,
              month: body.month,
              category: body.category,
              userId: user.id,
            })
          : undefined;
      const existingIsActive = existing !== undefined && existing.data().isActive !== false;
      // 外食貯金の対象ユーザーを変更した行が、変更先ユーザーの有効なノートを上書きしないようにする
      if (
        body.category === "diningSaving" &&
        body.originalUserId &&
        body.originalUserId !== user.id &&
        existingIsActive
      ) {
        throw new Error(`${user.displayName} の外食貯金は既にあります`);
      }
      const now = Timestamp.now();
      // selfConfirmed 時は認証ユーザーの確認を当日 JST で記録し、received は導出する
      // 論理削除済みノートの復活時は、削除前の確認状態を引き継がない
      const confirmations = existingIsActive
        ? normalizeReceiptNoteConfirmations(existing.data(), groupUserIds)
        : {};
      if (body.selfConfirmed) {
        confirmations[context.user.id] = todayJstDateString();
      }
      const received = groupUserIds.every((userId) => userId in confirmations);

      if (!existing) {
        const receiptNoteRef = db.collection("receiptNotes").doc();
        const receiptNote = {
          id: receiptNoteRef.id,
          groupId: context.groupId,
          month: body.month,
          category: body.category,
          userId: user.id,
          userName: user.displayName,
          amount: body.amount,
          amountLocked: body.selfConfirmed ? false : body.lockAmount,
          confirmations,
          received,
          source: body.source,
          isActive: body.isActive,
          createdAt: now,
          updatedAt: now,
        };
        transaction.set(receiptNoteRef, receiptNote);
        return { id: receiptNoteRef.id, receiptNote };
      }

      // 有効な既存ノートへの確認は、先に実体化した側の金額・名前を保持して確認だけ追記する
      const keepsValues = body.selfConfirmed && existingIsActive;
      // ロック指定時、または論理削除済みノートの再実体化時は amountLocked を今回の値で上書きする
      const amountLockPatch =
        body.lockAmount || !existingIsActive ? { amountLocked: body.lockAmount } : {};
      const patch = keepsValues
        ? { confirmations, received, updatedAt: now }
        : {
            userId: user.id,
            userName: user.displayName,
            amount: body.amount,
            ...amountLockPatch,
            isActive: body.isActive,
            confirmations,
            received,
            updatedAt: now,
          };
      transaction.update(existing.ref, patch);
      return { id: existing.id, receiptNote: { ...existing.data(), ...patch } };
    });

    return NextResponse.json({
      status: "ok",
      message: "Firestore に受領ノートを保存しました",
      receiptNote: mapReceiptNoteForClient(saved.id, saved.receiptNote, groupUserIds),
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

import { Timestamp } from "@google-cloud/firestore";
import { NextRequest, NextResponse } from "next/server";
import {
  assertIntegerAmount,
  assertPositiveAmount,
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
  payerId?: string;
  amount?: number;
  lockAmount?: boolean;
};

function parseReceiptNoteBody(body: ReceiptNoteRequestBody, source: string) {
  return {
    category: assertReceiptNoteCategory(body.category),
    userName: body.userName?.trim() || "@自分",
    payerId: body.payerId,
    // 手動ノートは 1 円以上を必須にする（自動集計行は予算超過のマイナスも許容）
    amount:
      source === "manual"
        ? assertPositiveAmount(body.amount)
        : assertIntegerAmount(body.amount),
    lockAmount: body.lockAmount,
  };
}

async function getReceiptNote(id: string) {
  const doc = await getFirestore().collection("receiptNotes").doc(id).get();
  if (!doc.exists) {
    throw new Error("対象の受領ノートが見つかりませんでした");
  }

  return { id: doc.id, ...doc.data() } as Record<string, unknown>;
}

/**
 * 外食貯金ノートの対象ユーザーを変更する前に、変更先ユーザーの有効なノートが同じ月に無いことを確認する。
 * @param before 変更前の受領ノート
 * @param user 変更先ユーザー
 * @param id 変更対象の受領ノート ID
 */
async function ensureNoActiveDiningSavingNote(
  before: Record<string, unknown>,
  user: { id: string; displayName: string },
  id: string,
) {
  const snapshot = await getFirestore()
    .collection("receiptNotes")
    .where("groupId", "==", before.groupId)
    .where("month", "==", before.month)
    .where("category", "==", "diningSaving")
    .where("userId", "==", user.id)
    .get();
  if (snapshot.docs.some((doc) => doc.id !== id && doc.data().isActive !== false)) {
    throw new Error(`${user.displayName} の外食貯金は既にあります`);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const [{ id }, authorizedContext] = await Promise.all([
      context.params,
      getAuthorizedContext(request),
    ]);
    const before = await getReceiptNote(id);
    ensureGroupReceiptNoteAccess(before, authorizedContext);

    // 対象ノートの source を引き継いで金額バリデーションを切り替える
    const source = before.source === "summary" ? "summary" : "manual";
    const body = parseReceiptNoteBody((await request.json()) as ReceiptNoteRequestBody, source);
    // 手動のその他行は payerId 省略時も既存の支払い者（userId）を保つ
    const user = resolveReceiptNoteUser(
      {
        ...body,
        payerId:
          body.payerId ||
          (source === "manual" ? String(before.userId ?? "") : undefined),
      },
      authorizedContext,
    );
    // 外食貯金の対象ユーザー変更は、変更先ユーザーに有効なノートが無いときだけ許可する
    if (before.category === "diningSaving" && user.id !== before.userId) {
      await ensureNoActiveDiningSavingNote(before, user, id);
    }
    const groupUserIds = authorizedContext.users.map((item) => item.id);
    // 外食貯金・精算で対象ユーザーが変わる場合は、別の人への精算になるため既存の確認を消す。
    // それ以外の編集は確認状態（confirmations / received）に触れない
    const clearsConfirmations = before.category !== "other" && user.id !== before.userId;
    const updates = {
      category: body.category,
      userId: user.id,
      userName: user.displayName,
      amount: body.amount,
      // 未固定ノートの保存額は古い算出値のことがあるため、金額の差ではなく明示指定とユーザー変更で固定する
      ...(body.lockAmount === true || user.id !== before.userId
        ? { amountLocked: true }
        : {}),
      ...(clearsConfirmations ? { confirmations: {}, received: false } : {}),
      updatedAt: Timestamp.now(),
    };

    await getFirestore().collection("receiptNotes").doc(id).update(updates);

    return NextResponse.json({
      status: "ok",
      message: "Firestore の受領ノートを更新しました",
      receiptNote: mapReceiptNoteForClient(id, { ...before, ...updates }, groupUserIds),
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
      receiptNote: mapReceiptNoteForClient(
        id,
        { ...before, isActive: false },
        authorizedContext.users.map((item) => item.id),
      ),
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

import { Timestamp } from "@google-cloud/firestore";
import { NextRequest, NextResponse } from "next/server";
import {
  assertDateString,
  assertPositiveAmount,
  dateStringToTimestamp,
  ensureGroupSubscriptionAccess,
  getAuthorizedContext,
  getErrorMessage,
  getFirestore,
  mapSubscriptionForClient,
  parseIntervalLabel,
  resolveUserByName,
} from "@/lib/liff-server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type SubscriptionRequestBody = {
  payerName?: string;
  serviceName?: string;
  amount?: number;
  startDate?: string;
  intervalLabel?: string;
};

function parseSubscriptionBody(body: SubscriptionRequestBody) {
  const serviceName = body.serviceName?.trim();
  if (!serviceName) {
    throw new Error("サブスク名を入力してください");
  }

  return {
    payerName: body.payerName?.trim() || "@自分",
    serviceName,
    amount: assertPositiveAmount(body.amount),
    startDate: assertDateString(body.startDate, "開始日"),
    ...parseIntervalLabel(body.intervalLabel || "毎月"),
  };
}

async function getSubscription(id: string) {
  const doc = await getFirestore().collection("subscriptions").doc(id).get();
  if (!doc.exists) {
    throw new Error("対象のサブスクが見つかりませんでした");
  }

  return { id: doc.id, ...doc.data() } as Record<string, unknown>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const [{ id }, authorizedContext] = await Promise.all([
      context.params,
      getAuthorizedContext(request),
    ]);
    const before = await getSubscription(id);
    ensureGroupSubscriptionAccess(before, authorizedContext);

    const body = parseSubscriptionBody(
      (await request.json()) as SubscriptionRequestBody,
    );
    const payer = resolveUserByName(body.payerName, authorizedContext);
    const updates = {
      payerName: payer.displayName,
      payerUserId: payer.id,
      serviceName: body.serviceName,
      amount: body.amount,
      startDate: dateStringToTimestamp(body.startDate),
      intervalUnit: body.intervalUnit,
      intervalValue: body.intervalValue,
      updatedAt: Timestamp.now(),
    };

    await getFirestore().collection("subscriptions").doc(id).update(updates);

    return NextResponse.json({
      status: "ok",
      message: "Firestore のサブスクを更新しました",
      subscription: mapSubscriptionForClient(id, { ...before, ...updates }),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: getErrorMessage(error, "サブスクの更新に失敗しました"),
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
    const before = await getSubscription(id);
    ensureGroupSubscriptionAccess(before, authorizedContext);

    await getFirestore().collection("subscriptions").doc(id).update({
      isActive: false,
      updatedAt: Timestamp.now(),
    });

    return NextResponse.json({
      status: "ok",
      message: "Firestore のサブスクを削除しました",
      subscription: mapSubscriptionForClient(id, before),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: getErrorMessage(error, "サブスクの削除に失敗しました"),
      },
      { status: 400 },
    );
  }
}

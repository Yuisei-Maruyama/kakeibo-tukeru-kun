import { Timestamp } from "@google-cloud/firestore";
import { NextRequest, NextResponse } from "next/server";
import {
  assertDateString,
  assertPositiveAmount,
  dateStringToTimestamp,
  getAuthorizedContext,
  getErrorMessage,
  getFirestore,
  mapSubscriptionForClient,
  parseIntervalLabel,
  resolveUserByName,
} from "@/lib/liff-server";

export const runtime = "nodejs";

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

  const startDate = assertDateString(body.startDate, "開始日");

  return {
    payerName: body.payerName?.trim() || "@自分",
    serviceName,
    amount: assertPositiveAmount(body.amount),
    startDate,
    ...parseIntervalLabel(body.intervalLabel || "毎月"),
  };
}

export async function POST(request: NextRequest) {
  try {
    const context = await getAuthorizedContext(request);
    const body = parseSubscriptionBody(
      (await request.json()) as SubscriptionRequestBody,
    );
    const payer = resolveUserByName(body.payerName, context);
    const subscriptionRef = getFirestore().collection("subscriptions").doc();
    const subscription = {
      id: subscriptionRef.id,
      groupId: context.groupId,
      payerName: payer.displayName,
      payerUserId: payer.id,
      serviceName: body.serviceName,
      amount: body.amount,
      startDate: dateStringToTimestamp(body.startDate),
      intervalUnit: body.intervalUnit,
      intervalValue: body.intervalValue,
      isActive: true,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await subscriptionRef.set(subscription);

    return NextResponse.json({
      status: "ok",
      message: "Firestore にサブスクを保存しました",
      subscription: mapSubscriptionForClient(subscriptionRef.id, subscription),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: getErrorMessage(error, "サブスクの保存に失敗しました"),
      },
      { status: 400 },
    );
  }
}

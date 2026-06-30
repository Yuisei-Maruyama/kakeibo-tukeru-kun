import { Timestamp } from "@google-cloud/firestore";
import { NextRequest, NextResponse } from "next/server";
import {
  assertPositiveAmount,
  ensureGroupRentAccess,
  getAuthorizedContext,
  getErrorMessage,
  getFirestore,
  mapRentForClient,
  resolveUserByName,
} from "@/lib/liff-server";

export const runtime = "nodejs";

type RentRequestBody = {
  payerName?: string;
  amount?: number;
};

export async function PUT(request: NextRequest) {
  try {
    const context = await getAuthorizedContext(request);
    const body = (await request.json()) as RentRequestBody;
    const payer = resolveUserByName(body.payerName?.trim() || "@自分", context);
    const rentRef = getFirestore().collection("rents").doc("global");
    const now = Timestamp.now();
    const rentDoc = await rentRef.get();
    if (rentDoc.exists) {
      ensureGroupRentAccess(rentDoc.data() ?? {}, context);
    }

    const rent = {
      id: "global",
      groupId: context.groupId,
      payerName: payer.displayName,
      payerUserId: payer.id,
      amount: assertPositiveAmount(body.amount),
      createdAt: rentDoc.exists ? rentDoc.data()?.createdAt ?? now : now,
      updatedAt: now,
    };

    await rentRef.set(rent, { merge: true });

    return NextResponse.json({
      status: "ok",
      message: "Firestore に家賃を保存しました",
      rent: mapRentForClient(rent),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: getErrorMessage(error, "家賃の保存に失敗しました"),
      },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const context = await getAuthorizedContext(request);
    const rentRef = getFirestore().collection("rents").doc("global");
    const rentDoc = await rentRef.get();
    if (rentDoc.exists) {
      ensureGroupRentAccess(rentDoc.data() ?? {}, context);
    }

    await rentRef.delete();

    return NextResponse.json({
      status: "ok",
      message: "Firestore から家賃を削除しました",
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: getErrorMessage(error, "家賃の削除に失敗しました"),
      },
      { status: 400 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import {
  buildScheduleUpdateRequestBody,
  deleteCalendarEvent,
  ensureManagedScheduleEvent,
  getAuthorizedContext,
  getCalendarClient,
  getCalendarEvent,
  getCalendarId,
  getErrorMessage,
  mapCalendarEvent,
  type ScheduleUpdatePayload,
} from "@/lib/liff-server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const [{ id }, authorizedContext] = await Promise.all([
      context.params,
      getAuthorizedContext(request),
    ]);
    const body = (await request.json()) as Partial<ScheduleUpdatePayload>;
    const calendarId = getCalendarId(authorizedContext.settings);
    if (!calendarId) {
      throw new Error("Google Calendar ID が未設定です");
    }

    ensureManagedScheduleEvent(await getCalendarEvent(calendarId, id));
    const response = await getCalendarClient().events.patch({
      calendarId,
      eventId: id,
      requestBody: buildScheduleUpdateRequestBody({
        title: body.title ?? "",
        date: body.date ?? "",
        timeLabel: body.timeLabel,
        description: body.description,
        colorId: body.colorId,
      }),
    });

    return NextResponse.json({
      status: "ok",
      message: "Google Calendar の予定を更新しました",
      event: mapCalendarEvent(response.data),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: getErrorMessage(error, "予定の更新に失敗しました"),
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
    const calendarId = getCalendarId(authorizedContext.settings);
    if (!calendarId) {
      throw new Error("Google Calendar ID が未設定です");
    }

    ensureManagedScheduleEvent(await getCalendarEvent(calendarId, id));
    await deleteCalendarEvent(calendarId, id);

    return NextResponse.json({
      status: "ok",
      message: "Google Calendar から予定を削除しました",
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: getErrorMessage(error, "予定の削除に失敗しました"),
      },
      { status: 400 },
    );
  }
}

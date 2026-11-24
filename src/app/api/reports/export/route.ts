import { NextResponse, type NextRequest } from "next/server";
import { requirePermission } from "@/server/auth/session";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { apiError } from "@/server/http";
import { buildReport, REPORTS, toCsv, toXlsx, type ReportKey } from "@/server/services/reports";

export async function GET(req: NextRequest) {
  try {
    const user = await requirePermission("reports:export");
    const p = req.nextUrl.searchParams;
    const report = (p.get("report") ?? "collections") as ReportKey;
    if (!(report in REPORTS)) return NextResponse.json({ error: "Unknown report" }, { status: 422 });
    const filters = { from: p.get("from") || undefined, to: p.get("to") || undefined, city: p.get("city") || undefined, categoryId: p.get("categoryId") || undefined, collectorId: p.get("collectorId") || undefined, paymentStatus: p.get("paymentStatus") || undefined };
    const rows = await buildReport(report, filters);
    await audit(db, user, "report.export", "Report", report, { after: { ...filters, rows: rows.length, format: p.get("format") } });
    const name = `rewear-${report}-${filters.from ?? "all"}-${filters.to ?? "now"}`;
    if (p.get("format") === "xlsx") {
      const buf = await toXlsx(REPORTS[report], rows);
      return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}.xlsx"`, "Cache-Control": "no-store" } });
    }
    return new NextResponse("﻿" + toCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"`, "Cache-Control": "no-store" } });
  } catch (e) {
    return apiError(e);
  }
}

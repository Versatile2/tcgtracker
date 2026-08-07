import { db } from '@/db/client';
import { requireUserId, errorToResponse } from '@/lib/api/handler';
import { exportRounds } from '@/services/export';
import { exportToCsv } from '@/lib/csv';

export const runtime = 'nodejs';

/** Byte-order mark so Excel reads accented leader names as UTF-8. */
const BOM = '﻿';

export async function GET() {
  try {
    const userId = await requireUserId();
    const csv = exportToCsv(await exportRounds(db, userId));
    const filename = `grand-line-tcg-${new Date().toISOString().slice(0, 10)}.csv`;
    return new Response(BOM + csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    return errorToResponse(err);
  }
}

import { NextResponse } from 'next/server';
import { errorResponse, optionalSession } from '@/lib/api';
import { call } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await optionalSession();
    if (!user) return NextResponse.json({ entries: [] });

    const kind = new URL(request.url).searchParams.get('kind');
    const entries = await call<unknown[]>('jv_ledger_list', {
      p_user_id: user.id,
      p_kind: kind && kind !== 'all' ? kind : null,
      p_limit: 200,
    });
    return NextResponse.json({ entries, wallet: user.wallet });
  } catch (error) {
    return errorResponse(error);
  }
}

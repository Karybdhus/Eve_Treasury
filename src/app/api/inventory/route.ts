import { getDatabase } from '@/lib/db';
import { assertApplicationRequest } from '@/lib/application-access';
import { decideInventory, inventoryDetail, observeInventory, categories } from '@/lib/inventory-provenance';
import { z } from 'zod';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const decision = z.object({ itemId: z.string().regex(/^\d+$/), revision: z.number().int().nonnegative(), action: z.enum(['assign', 'revise', 'revoke', 'confirm', 'reject']), sliceId: z.string().uuid().optional(), quantity: z.string().regex(/^[1-9][0-9]*$/).optional(), category: z.enum(categories).optional(), reason: z.string().min(1).max(2000), method: z.enum(['manual', 'mining', 'pi_production', 'purchase', 'takeover', 'transfer', 'unknown']).optional() }).strict();
export async function GET(request: Request) {
    try {
        assertApplicationRequest(request);
        if (request.headers.get('sec-fetch-site') === 'cross-site')
            throw new Error();
    }
    catch {
        return Response.json({ error: 'Zugriff verweigert' }, { status: 403 });
    }
    const q = new URL(request.url).searchParams, id = q.get('itemId') ?? '', page = Number(q.get('page') ?? 0);
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(page) || page < 0)
        return Response.json({ error: 'Ungueltiger Filter' }, { status: 400 });
    const db = getDatabase();
    try {
        observeInventory(db);
        const result = inventoryDetail(db, id, page);
        return Response.json(result ?? { error: 'Position nicht gefunden' }, { status: result ? 200 : 404, headers: { 'Cache-Control': 'no-store' } });
    }
    finally {
        db.close();
    }
}
export async function POST(request: Request) {
    try {
        assertApplicationRequest(request, true);
    }
    catch {
        return Response.json({ error: 'Zugriff verweigert' }, { status: 403 });
    }
    let input;
    try {
        if (Number(request.headers.get('content-length')) > 10000)
            throw new Error();
        input = decision.parse(await request.json());
    }
    catch {
        return Response.json({ error: 'Ungueltige Zuordnung' }, { status: 400 });
    }
    const db = getDatabase();
    try {
        observeInventory(db);
        return Response.json(decideInventory(db, input), { headers: { 'Cache-Control': 'no-store' } });
    }
    catch (e) {
        const message = (e as Error).message;
        return Response.json({ error: message }, { status: message === 'Revision conflict' ? 409 : 400 });
    }
    finally {
        db.close();
    }
}

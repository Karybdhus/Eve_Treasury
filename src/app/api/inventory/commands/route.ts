import { nameResolver } from '@/lib/names';
import { records } from '@/lib/source-records';
import { pageOf } from '@/lib/display-pages';
import { getDatabase } from '@/lib/db';
import { assertApplicationRequest } from '@/lib/application-access';
import { categories, saveInventoryRule, transferInventory, transformInventory, confirmInventoryEvidence, rejectInventorySuggestion, confirmConsumedObservation, observeInventory } from '@/lib/inventory-provenance';
import { z } from 'zod';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const id = z.string().regex(/^\d+$/), revision = z.number().int().nonnegative(), quantity = z.string().regex(/^[1-9][0-9]*$/), reason = z.string().trim().min(1).max(2000);
const command = z.discriminatedUnion('action', [z.object({ action: z.literal('settle_consumption'), itemId: id, revision, quantity, reason }).strict(), z.object({ action: z.literal('reject_suggestion'), itemId: id, revision, sourceKey: z.string().min(1).max(512), reason }).strict(),
    z.object({ action: z.literal('rule'), id: z.string().uuid().optional(), revision, enabled: z.boolean(), location: id, owner: id.optional(), category: z.enum(categories), reason }).strict(),
    z.object({ action: z.literal('transfer'), from: id, to: id, fromRevision: revision, toRevision: revision, sliceId: z.string().uuid(), quantity, reason }).strict(),
    z.object({ action: z.literal('transform'), id: z.string().uuid(), reason, inputs: z.array(z.object({ itemId: id, sliceId: z.string().uuid().optional(), revision, quantity }).strict()).min(1).max(25), outputs: z.array(z.object({ itemId: id, revision, quantity }).strict()).min(1).max(25) }).strict(),
    z.object({ action: z.literal('evidence'), itemId: id, revision, sourceKey: z.string().min(1).max(512), quantity, category: z.enum(categories), reason }).strict()]);
export async function GET(request: Request) {
    try {
        assertApplicationRequest(request);
        if (request.headers.get('sec-fetch-site') === 'cross-site')
            throw new Error();
    }
    catch {
        return Response.json({ error: 'Zugriff verweigert' }, { status: 403 });
    }
    const db = getDatabase();
    try {
        const params = new URL(request.url).searchParams;
        if (params.get('kind') === 'positions') {
            const query = params.get('q') ?? '', type = params.get('typeId'), page = Number(params.get('page') ?? 0);
            if (query.length > 200 || !Number.isSafeInteger(page) || page < 0 || (type !== null && !/^\d+$/.test(type)))
                return Response.json({ error: 'Ungueltiger Filter' }, { status: 400 });
            observeInventory(db);
            const characters = db.prepare('SELECT character_id,name FROM characters').all() as {
                character_id: string;
                name: string;
            }[], names = nameResolver(records(db, 'type_metadata'), characters);
            const positions = (db.prepare("SELECT item_id itemId,type_id typeId,owner,location,quantity,revision FROM inventory_positions WHERE json_extract(body,'$.present')=1").all() as {
                itemId: string;
                typeId: string;
                owner: string;
                location: string;
                quantity: string | null;
                revision: number;
            }[]).filter(p => !type || p.typeId === type).map(p => ({ ...p, name: names.type(p.typeId), owner: names.character(p.owner), location: names.entity(p.location) })).filter(p => (p.name + ' ' + p.owner + ' ' + p.location).toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => a.name.localeCompare(b.name) || a.itemId.localeCompare(b.itemId));
            return Response.json(pageOf(positions, page), { headers: { 'Cache-Control': 'no-store' } });
        }
        return Response.json({ rules: db.prepare('SELECT body FROM inventory_rules ORDER BY id LIMIT 100').all().map(r => JSON.parse(String(r.body))) }, { headers: { 'Cache-Control': 'no-store' } });
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
        if (Number(request.headers.get('content-length')) > 25000)
            throw new Error();
        input = command.parse(await request.json());
    }
    catch {
        return Response.json({ error: 'Ungueltige Bestandsentscheidung' }, { status: 400 });
    }
    const db = getDatabase();
    try {
        observeInventory(db);
        const result = input.action === 'rule' ? saveInventoryRule(db, input) : input.action === 'transfer' ? transferInventory(db, input) : input.action === 'transform' ? transformInventory(db, input) : input.action === 'settle_consumption' ? confirmConsumedObservation(db, input) : input.action === 'reject_suggestion' ? rejectInventorySuggestion(db, input) : confirmInventoryEvidence(db, input);
        return Response.json(result ?? { ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    }
    catch (e) {
        return Response.json({ error: (e as Error).message }, { status: (e as Error).message === 'Revision conflict' ? 409 : 400 });
    }
    finally {
        db.close();
    }
}

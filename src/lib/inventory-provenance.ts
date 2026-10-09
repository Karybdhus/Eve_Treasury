import { moneyFact, signedCents } from './exact-money';
import type { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { records, type ProjectRecord } from './source-records';
export const categories = ['Mining', 'Ice', 'PI', 'Loot', 'Salvage', 'Hacking', 'Trading', 'MISC'] as const;
export type Category = typeof categories[number];
export type Origin = {
    category: Category;
    quantity: string;
    costCents: string | null;
    evidence: string;
    upstream?: Origin[];status?:'proven'|'manually_confirmed'|'unknown';
};
export type Slice = {
    id: string;
    quantity: string;
    category: Category;
    method: string;
    status: 'proven' | 'manually_confirmed' | 'suggested';
    evidence: string;
    costCents: string | null;
    knownInputCostCents?: string | null;
    manualCategoryOverride?: boolean;unknownOrigin?:boolean;
    transformationId?: string;
    origins?: Origin[];
    active: boolean;
};
export type Position = {
    itemId: string;
    typeId: string;
    owner: string;
    location: string;
    quantity: string | null;
    asOf: string;
    revision: number;
    slices: Slice[];
    unknown: string | null;
    conflict: boolean;
    baseline: boolean;
    present: boolean;
    reservedOut: string;
    identityConflict?: boolean;
};
export const PROVENANCE_SCHEMA = [
    'CREATE TABLE inventory_state(name TEXT PRIMARY KEY,value TEXT NOT NULL)',
    'CREATE TABLE inventory_positions(item_id TEXT PRIMARY KEY,type_id TEXT NOT NULL,owner TEXT NOT NULL,location TEXT NOT NULL,quantity TEXT,as_of TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL)',
    'CREATE INDEX inventory_owner_location ON inventory_positions(owner,location,type_id)',
    'CREATE TABLE inventory_observations(source_key TEXT PRIMARY KEY,item_id TEXT NOT NULL,observed_at TEXT NOT NULL,body TEXT NOT NULL)',
    'CREATE INDEX inventory_observations_item ON inventory_observations(item_id,observed_at)',
    'CREATE TABLE inventory_audit(id TEXT PRIMARY KEY,item_id TEXT NOT NULL,action TEXT NOT NULL,changed_at TEXT NOT NULL,body TEXT NOT NULL)',
    'CREATE INDEX inventory_audit_item ON inventory_audit(item_id,changed_at)',
    'CREATE TABLE inventory_rejections(item_id TEXT NOT NULL,source_key TEXT NOT NULL,reason TEXT NOT NULL,changed_at TEXT NOT NULL,PRIMARY KEY(item_id,source_key))',
    'CREATE TABLE inventory_rules(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,enabled INTEGER NOT NULL,body TEXT NOT NULL)',
    'CREATE TABLE inventory_evidence_claims(slice_id TEXT PRIMARY KEY,source_key TEXT NOT NULL,item_id TEXT NOT NULL,quantity TEXT NOT NULL,active INTEGER NOT NULL)',
    'CREATE INDEX inventory_claims_source ON inventory_evidence_claims(source_key,active)',
    'CREATE TABLE inventory_transformations(id TEXT PRIMARY KEY,created_at TEXT NOT NULL,body TEXT NOT NULL)',
];
function quantity(v: unknown): string | null {
    if (typeof v === 'number' && !Number.isSafeInteger(v))
        return null;
    const s = String(v);
    return /^(0|[1-9][0-9]*)$/.test(s) ? BigInt(s).toString() : null;
}
function audit(db: DatabaseSync, item: string, action: string, body: unknown) { db.prepare('INSERT INTO inventory_audit VALUES(?,?,?,?,?)').run(randomUUID(), item, action, new Date().toISOString(), JSON.stringify(body)); }
function save(db: DatabaseSync, p: Position) { db.prepare('INSERT INTO inventory_positions VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(item_id) DO UPDATE SET type_id=excluded.type_id,owner=excluded.owner,location=excluded.location,quantity=excluded.quantity,as_of=excluded.as_of,revision=excluded.revision,body=excluded.body').run(p.itemId, p.typeId, p.owner, p.location, p.quantity, p.asOf, p.revision, JSON.stringify(p)); }
export function inventoryPosition(db: DatabaseSync, id: string): Position | undefined {
    const r = db.prepare('SELECT body FROM inventory_positions WHERE item_id=?').get(id) as {
        body: string;
    } | undefined;
    return r ? JSON.parse(r.body) : undefined;
}
function recalculate(p: Position) { const used = p.slices.filter(s => s.active && s.status !== 'suggested').reduce((n, s) => n + BigInt(s.quantity), 0n); p.conflict = p.identityConflict === true || (p.quantity !== null && used > BigInt(p.quantity)); const remaining = p.quantity === null ? null : BigInt(p.quantity) - used - BigInt(p.reservedOut ?? '0'); p.conflict = p.conflict || (remaining !== null && remaining < 0n); p.unknown = remaining === null || p.conflict ? null : remaining.toString(); return p; }
// Observations preserve decisions; unexplained decreases never become sales.
export function observeInventory(db: DatabaseSync, input?: ProjectRecord[]) {
    db.exec('BEGIN IMMEDIATE');
    try {
        input ??= records(db, 'asset_snapshot');
        const own = new Set((db.prepare('SELECT character_id FROM characters').all() as {
            character_id: string;
        }[]).map(c => c.character_id));
        const latest = new Map<string, ProjectRecord>();
        const ambiguous = new Set<string>();
        for (const r of input) {
            if (r.status !== 'actual' || r.isCurrent === false || r.dataQuality === 'historical_seed' || r.data.for_corporation === true || r.data.is_corporation === true || !own.has(r.sourceCharacterId ?? ''))
                continue;
            const id = String(r.data.item_id);
            if (!/^\d+$/.test(id))
                continue;
            const prev = latest.get(id);
            if (!prev || prev.fetchedAt < r.fetchedAt) { latest.set(id,r); ambiguous.delete(id); }
            else if(prev.fetchedAt === r.fetchedAt && JSON.stringify([prev.sourceCharacterId,prev.data]) !== JSON.stringify([r.sourceCharacterId,r.data])) ambiguous.add(id);
        }
        const fingerprint = createHash('sha256').update(JSON.stringify([[...latest],[...ambiguous].sort()])).digest('hex');
        const prior = db.prepare('SELECT value FROM inventory_state WHERE name=?').get('asset_fingerprint') as {
            value: string;
        } | undefined;
        if (prior?.value === fingerprint) {
            db.exec('COMMIT');
            return;
        }
        const initial = (db.prepare('SELECT COUNT(*) n FROM inventory_observations').get() as {
            n: number;
        }).n === 0;
        for (const [id, r] of latest) {
            if(ambiguous.has(id)) {
                const old=inventoryPosition(db,id);
                const p:Position=old??{itemId:id,typeId:String(r.data.type_id),owner:r.sourceCharacterId!,location:String(r.data.location_id),quantity:null,asOf:r.fetchedAt,revision:0,slices:[],unknown:null,conflict:true,baseline:initial,present:true,reservedOut:'0'};
                p.identityConflict=true;p.present=true;p.quantity=null;p.revision++;save(db,recalculate(p));
                audit(db,id,'simultaneous_observation_conflict',{note:'Zeitgleiche Quellen widersprechen sich; Besitzer und Menge ungesichert'});continue;
            }
            const key = createHash('sha256').update(JSON.stringify([r.deduplicationKey, r.fetchedAt, r.data, r.sourceCharacterId])).digest('hex');
            if (db.prepare('SELECT 1 FROM inventory_observations WHERE source_key=?').get(key)) {
                const seen = inventoryPosition(db, id);
                if (seen && !seen.present && seen.asOf === r.fetchedAt && seen.owner === r.sourceCharacterId) {
                    seen.present = true;
                    seen.revision++;
                    save(db, recalculate(seen));
                    audit(db, id, 'reobserved', { note: 'Bereits bekannte Beobachtung wieder verfuegbar' });
                }
                continue;
            }
            const old = inventoryPosition(db, id), q = quantity(r.data.quantity);
            const p: Position = { itemId: id, typeId: String(r.data.type_id), owner: r.sourceCharacterId!, location: String(r.data.location_id), quantity: q, asOf: r.fetchedAt, revision: (old?.revision ?? 0) + 1, slices: old?.slices ?? [], unknown: q, conflict: false, baseline: old?.baseline ?? initial, present: true, reservedOut: old?.reservedOut ?? '0' };
            if (old && old.asOf > p.asOf) {
                old.identityConflict = true;
                old.present = false;
                old.revision++;
                save(db, recalculate(old));
                audit(db, id, 'older_observation_conflict', { note: 'Aktueller Quellstand liegt vor der letzten gesicherten Beobachtung' });
                continue;
            }
            if (old && old.typeId !== p.typeId)
                throw new Error('Asset identity conflict');
            recalculate(p);
            db.prepare('INSERT INTO inventory_observations VALUES(?,?,?,?)').run(key, id, p.asOf, JSON.stringify({ quantity: q, owner: p.owner, location: p.location, sourceKey: r.deduplicationKey, rawId: r.rawId ?? null }));
            if (old && (old.owner !== p.owner || old.location !== p.location))
                audit(db, id, 'observed_internal_move', { fromOwner: old.owner, toOwner: p.owner, fromLocation: old.location, toLocation: p.location, quantityUnchanged: old.quantity === q });
            if (old && old.quantity !== q)
                audit(db, id, 'unexplained_quantity_change', { before: old.quantity, after: q });
            save(db, p);
        }
        const previous = db.prepare('SELECT item_id,body FROM inventory_positions').all() as {
            item_id: string;
            body: string;
        }[];
        for (const row of previous) {
            if (latest.has(row.item_id))
                continue;
            const p = JSON.parse(row.body) as Position;
            if (!p.present)
                continue;
            p.present = false;
            p.revision++;
            save(db, p);
            audit(db, p.itemId, 'no_longer_observed', { note: 'Abgangsgrund unbekannt; kein Verkauf gebucht' });
        }
        db.prepare('INSERT INTO inventory_state VALUES(?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value').run('asset_fingerprint', fingerprint);
        db.exec('COMMIT');
    }
    catch (e) {
        db.exec('ROLLBACK');
        throw e;
    }
}
export function decideInventory(db: DatabaseSync, input: {
    itemId: string;
    revision: number;
    action: 'assign' | 'revise' | 'revoke' | 'confirm' | 'reject';
    sliceId?: string;
    quantity?: string;
    category?: Category;
    reason: string;
    method?: string;
}) {
    if (!input.reason.trim() || input.reason.length > 2000)
        throw new Error('Eine Begruendung ist erforderlich');
    db.exec('BEGIN IMMEDIATE');
    try {
        const p = inventoryPosition(db, input.itemId);
        if (!p)
            throw new Error('Position nicht gefunden');
        if (p.revision !== input.revision)
            throw new Error('Revision conflict');
        if (input.action === 'assign') {
            if (!p.present)
                throw new Error('Position aktuell nicht beobachtet');
            const q = quantity(input.quantity);
            if (!q || q === '0' || !categories.includes(input.category!))
                throw new Error('Ungueltige Menge oder Herkunft');
            if (p.unknown === null || BigInt(q) > BigInt(p.unknown))
                throw new Error('Menge uebersteigt den verfuegbaren Bestand');
            p.slices.push({ id: randomUUID(), quantity: q, category: input.category!, method: input.method ?? 'manual', status: 'manually_confirmed', evidence: input.reason, costCents: null, active: true });
        }
        else {
            const s = p.slices.find(s => s.id === input.sliceId && s.active);
            if (!s)
                throw new Error('Zuordnung nicht gefunden');
            if (input.action === 'revise') {
                if (!categories.includes(input.category!))
                    throw new Error('Ungueltige Herkunft');
                s.category = input.category!;
                s.manualCategoryOverride = true;
                s.status = 'manually_confirmed';
                s.evidence = input.reason;
            }
            else if (input.action === 'confirm') {
                if (s.status !== 'suggested' || p.unknown === null || BigInt(s.quantity) > BigInt(p.unknown))
                    throw new Error('Vorschlag kann nicht bestaetigt werden');
                s.status = 'manually_confirmed';
                s.evidence = input.reason;
            }
            else {
                s.active = false;
                db.prepare('UPDATE inventory_evidence_claims SET active=0 WHERE slice_id=?').run(s.id);
            }
        }
        p.revision++;
        recalculate(p);
        save(db, p);
        audit(db, p.itemId, input.action, { ...input, revision: p.revision });
        db.exec('COMMIT');
        return p;
    }
    catch (e) {
        db.exec('ROLLBACK');
        throw e;
    }
}
export function inventoryDetail(db: DatabaseSync, id: string, page = 0) {
    const p = inventoryPosition(db, id);
    if (!p)
        return null;
    const auditCount = (db.prepare('SELECT COUNT(*) n FROM inventory_audit WHERE item_id=?').get(id) as {
        n: number;
    }).n;
    return { auditPage: page, auditPages: Math.max(1, Math.ceil(auditCount / 25)), position: p, suggestions: inventoryCandidates(db, p).slice(page * 25, (page + 1) * 25), suggestionPages: Math.max(1, Math.ceil(inventoryCandidates(db, p).length / 25)), audit: db.prepare('SELECT action,changed_at changedAt,body FROM inventory_audit WHERE item_id=? ORDER BY changed_at DESC,id LIMIT 25 OFFSET ?').all(id, page * 25).map(r => ({ action: String(r.action), changedAt: String(r.changedAt), body: JSON.parse(String(r.body)) })), observations: db.prepare('SELECT observed_at observedAt,body FROM inventory_observations WHERE item_id=? ORDER BY observed_at DESC LIMIT 25 OFFSET ?').all(id, page * 25).map(r => ({ ...r, body: JSON.parse(String(r.body)) })) };
}
export function saveInventoryRule(db: DatabaseSync, input: {
    id?: string;
    revision: number;
    enabled: boolean;
    location: string;
    owner?: string;
    category: Category;
    reason: string;
}) {
    if (!categories.includes(input.category) || !input.location || !input.reason.trim())
        throw new Error('Ungueltige Regel');
    db.exec('BEGIN IMMEDIATE');
    try {
        const id = input.id ?? randomUUID(), old = db.prepare('SELECT revision FROM inventory_rules WHERE id=?').get(id) as {
            revision: number;
        } | undefined;
        if ((old?.revision ?? 0) !== input.revision)
            throw new Error('Revision conflict');
        const body = { ...input, id, revision: input.revision + 1 };
        db.prepare('INSERT INTO inventory_rules VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,enabled=excluded.enabled,body=excluded.body').run(id, body.revision, input.enabled ? 1 : 0, JSON.stringify(body));
        audit(db, 'rule:' + id, 'rule_changed', body);
        db.exec('COMMIT');
        return body;
    }
    catch (e) {
        db.exec('ROLLBACK');
        throw e;
    }
}
function inventoryCandidates(db: DatabaseSync, p: Position) {
    const candidates: {
        key: string;
        quantity: string;
        category: Category;
        method: string;
        evidence: string;
        costCents: string | null;
    }[] = [];
    const sourceRows = db.prepare("SELECT deduplication_key,kind,body,source_timestamp,fetched_at FROM project_records WHERE status='actual' AND data_quality!='historical_seed' AND is_current=1 AND (source_character_id=? OR kind='contract_archive') AND kind IN ('mining_entry','wallet_transaction','pi_pin','contract_archive')").all(p.owner) as {
        deduplication_key: string;
        kind: string;
        body: string;
        source_timestamp: string | null;
        fetched_at: string;
    }[];
    for (const r of sourceRows) {
        const d = JSON.parse(r.body);
        if (r.kind === 'mining_entry' && String(d.typeId) === p.typeId) {
            const q = quantity(d.quantity);
            if (q)
                candidates.push({ key: r.deduplication_key, quantity: q, category: 'Mining', method: 'mining', evidence: 'Mining-Ledger belegt Foerderung; Zuordnung zum Bestand offen', costCents: null });
        }
        if (r.kind === 'wallet_transaction' && String(d.type_id) === p.typeId && d.is_buy === true && d.is_personal === true) {
            const q = quantity(d.quantity);
            if (q)
                candidates.push({ key: r.deduplication_key, quantity: q, category: 'MISC', method: 'purchase', evidence: 'Marktkauf; Verwendungszweck und konkrete Bestandsverknuepfung offen', costCents: moneyFact(d.unit_price).value === null || signedCents(moneyFact(d.unit_price).value!) < 0n ? null : (signedCents(moneyFact(d.unit_price).value!) * BigInt(q)).toString() });
        }
        if (r.kind === 'contract_archive' && d.for_corporation === false && d.type === 'item_exchange' && d.status === 'finished' && Array.isArray(d.items)) {
            const accepts = String(d.acceptor_id) === p.owner, issues = String(d.issuer_id) === p.owner;
            const incoming = d.items.filter((i: {
                type_id: unknown;
                is_included: boolean;
            }) => String(i.type_id) === p.typeId && ((accepts && i.is_included) || (issues && !i.is_included)));
            const quantities = incoming.map((i: {
                quantity: unknown;
            }) => quantity(i.quantity));
            if (quantities.length && quantities.every((q: string | null) => q !== null)) {
                const amount = quantities.reduce((n: bigint, q: string) => n + BigInt(q), 0n);
                if (amount > 0n)
                    candidates.push({ key: r.deduplication_key + ':incoming:' + p.owner + ':' + p.typeId, quantity: amount.toString(), category: 'MISC', method: 'takeover', evidence: 'Abgeschlossener Contract mit Item-Beleg; konkrete Bestandsbewegung muss bestaetigt werden', costCents: null });
            }
        }
        if (r.kind === 'pi_pin' && Array.isArray(d.contents))
            for (const content of d.contents) {
                if (String(content.type_id) === p.typeId) {
                    const q = quantity(content.amount);
                    if (q)
                        candidates.push({ key: r.deduplication_key + ':content:' + p.typeId, quantity: q, category: 'PI', method: 'pi_stock', evidence: 'PI-Pin-Bestand; Produktion und Transfer zum Hangar nicht belegt', costCents: null });
                }
            }
    }
    const rules = db.prepare('SELECT body FROM inventory_rules WHERE enabled=1').all() as {
        body: string;
    }[];
    for (const r of rules) {
        const rule = JSON.parse(r.body);
        if (rule.location === p.location && (!rule.owner || rule.owner === p.owner) && p.unknown && p.unknown !== '0')
            candidates.push({ key: 'rule:' + rule.id, quantity: p.unknown, category: rule.category, method: 'unknown', evidence: rule.reason + ' / Standortregel ist ein Vorschlag', costCents: null });
    }
    const rejected = new Set((db.prepare('SELECT source_key FROM inventory_rejections WHERE item_id=?').all(p.itemId) as {
        source_key: string;
    }[]).map(r => r.source_key));
    return candidates.filter(c => !rejected.has(c.key));
}
// Explicitly confirmed movement is required when stack identities change.
export function transferInventory(db: DatabaseSync, input: {
    from: string;
    to: string;
    fromRevision: number;
    toRevision: number;
    sliceId: string;
    quantity: string;
    reason: string;
}) {
    const q = quantity(input.quantity);
    if (!q || q === '0' || input.from === input.to || !input.reason.trim())
        throw new Error('Ungueltige Bewegung');
    db.exec('BEGIN IMMEDIATE');
    try {
        const a = inventoryPosition(db, input.from), b = inventoryPosition(db, input.to);
        if (!a || !b || !b.present || a.typeId !== b.typeId)
            throw new Error('Positionen passen nicht');
        if (a.revision !== input.fromRevision || b.revision !== input.toRevision)
            throw new Error('Revision conflict');
        const s = a.slices.find(s => s.id === input.sliceId && s.active && s.status !== 'suggested');
        if (!s || BigInt(q) > BigInt(s.quantity) || b.unknown === null || BigInt(q) > BigInt(b.unknown))
            throw new Error('Bewegungsmenge nicht verfuegbar');
        const total = BigInt(s.quantity), cost = s.costCents === null ? null : (BigInt(s.costCents) * BigInt(q) / total).toString();
        s.quantity = (total - BigInt(q)).toString();
        if (s.costCents !== null)
            s.costCents = (BigInt(s.costCents) - BigInt(cost!)).toString();
        if (s.quantity === '0')
            s.active = false;
        const newId = randomUUID();
        b.slices.push({ ...s, id: newId, quantity: q, costCents: cost, active: true, evidence: input.reason + ' / Ursprung ' + input.from });
        const claim = db.prepare('SELECT source_key,quantity FROM inventory_evidence_claims WHERE slice_id=? AND active=1').get(s.id) as {
            source_key: string;
            quantity: string;
        } | undefined;
        if (claim) {
            db.prepare('UPDATE inventory_evidence_claims SET quantity=? WHERE slice_id=?').run((BigInt(claim.quantity) - BigInt(q)).toString(), s.id);
            db.prepare('INSERT INTO inventory_evidence_claims VALUES(?,?,?,?,1)').run(newId, claim.source_key, b.itemId, q);
        }
        a.revision++;
        b.revision++;
        save(db, recalculate(a));
        save(db, recalculate(b));
        audit(db, a.itemId, 'confirmed_internal_transfer', input);
        audit(db, b.itemId, 'confirmed_internal_transfer', input);
        db.exec('COMMIT');
        return { from: a, to: b };
    }
    catch (e) {
        db.exec('ROLLBACK');
        throw e;
    }
}
export function transformInventory(db: DatabaseSync, input: {
    id: string;
    reason: string;
    inputs: {
        itemId: string;
        sliceId?: string;
        revision: number;
        quantity: string;
    }[];
    outputs: {
        itemId: string;
        revision: number;
        quantity: string;
    }[];
}) {
    if (!input.reason.trim() || !input.inputs.length || !input.outputs.length || new Set([...input.inputs, ...input.outputs].map(x => x.itemId)).size !== input.inputs.length + input.outputs.length)
        throw new Error('Eindeutige Ein- und Ausgangspositionen erforderlich');
    db.exec('BEGIN IMMEDIATE');
    try {
        if (db.prepare('SELECT 1 FROM inventory_transformations WHERE id=?').get(input.id))
            throw new Error('Transformation bereits bestaetigt');
        const origins: Origin[] = [];
        for (const i of input.inputs) {
            const p = inventoryPosition(db, i.itemId), q = quantity(i.quantity);
            if (!p || p.revision !== i.revision)
                throw new Error('Revision conflict');
            const s = i.sliceId?p.slices.find(s => s.id === i.sliceId && s.active && s.status !== 'suggested'):undefined;
            if(!q||q==='0'||(i.sliceId&&(!s||BigInt(q)>BigInt(s.quantity)))||(!i.sliceId&&(!p.present||p.unknown===null||BigInt(q)>BigInt(p.unknown))))
                throw new Error('Eingangsmenge nicht verfuegbar');
            const part=BigInt(q),total=s?BigInt(s.quantity):part,cost=!s||s.costCents===null?null:BigInt(s.costCents)*part/total;
            origins.push({category:s?.category??'MISC',quantity:q,costCents:cost?.toString()??null,evidence:s?.evidence??'Ungeklaerter Bestandsanteil',upstream:s?.origins,status:s?.status==='proven'?'proven':s?.unknownOrigin||!s?'unknown':'manually_confirmed'});
            p.reservedOut = (BigInt(p.reservedOut ?? '0') + part).toString();
            const claim = (s?db.prepare('SELECT source_key,quantity FROM inventory_evidence_claims WHERE slice_id=? AND active=1').get(s.id):undefined) as {
                source_key: string;
                quantity: string;
            } | undefined;
            if (claim&&s) {
                db.prepare('UPDATE inventory_evidence_claims SET quantity=? WHERE slice_id=?').run((BigInt(claim.quantity) - part).toString(), s.id);
                db.prepare('INSERT INTO inventory_evidence_claims VALUES(?,?,?,?,1)').run(randomUUID(), claim.source_key, p.itemId, part.toString());
            }
            if(s){s.quantity = (total - part).toString();
            if (cost !== null)
                s.costCents = (BigInt(s.costCents!) - cost).toString();
            if (s.quantity === '0')
                s.active = false;}
            p.revision++;
            save(db, recalculate(p));
            audit(db, p.itemId, 'confirmed_transformation_input', input);
        }
        const known = origins.filter(o => o.costCents !== null), knownCost = known.length ? known.reduce((n, o) => n + BigInt(o.costCents!), 0n).toString() : null, completeCost = known.length === origins.length ? knownCost : null;
        const kinds = [...new Set(origins.flatMap(originCategories))];
        for (const o of input.outputs) {
            const q = quantity(o.quantity), p = inventoryPosition(db, o.itemId);
            if (!p || p.revision !== o.revision)
                throw new Error('Revision conflict');
            if (!q || q === '0' || !p.present || p.unknown === null || BigInt(q) > BigInt(p.unknown))
                throw new Error('Ausgangsmenge nicht verfuegbar');
            p.slices.push({ id: randomUUID(), quantity: q, category: kinds.length === 1 ? kinds[0] : 'MISC', method: 'transformation', status: 'manually_confirmed', evidence: input.reason, costCents: input.outputs.length === 1 ? completeCost : null, knownInputCostCents: knownCost, transformationId: input.id, origins,unknownOrigin:origins.some(o=>o.status==='unknown'), active: true });
            p.revision++;
            save(db, recalculate(p));
            audit(db, p.itemId, 'confirmed_transformation_output', input);
        }
        db.prepare('INSERT INTO inventory_transformations VALUES(?,?,?)').run(input.id, new Date().toISOString(), JSON.stringify({ ...input, origins, knownInputCostCents: knownCost, completeInputCostCents: completeCost, outputCostAllocation: input.outputs.length === 1 ? 'single_output' : 'not_reported' }));
        db.exec('COMMIT');
    }
    catch (e) {
        db.exec('ROLLBACK');
        throw e;
    }
}
export function confirmInventoryEvidence(db: DatabaseSync, input: {
    itemId: string;
    revision: number;
    sourceKey: string;
    quantity: string;
    category: Category;
    reason: string;
}) {
    db.exec('BEGIN IMMEDIATE');
    try {
        const p = inventoryPosition(db, input.itemId);
        if (!p || p.revision !== input.revision)
            throw new Error('Revision conflict');
        const candidate = inventoryCandidates(db, p).find(c => c.key === input.sourceKey), q = quantity(input.quantity);
        if (!p.present || !candidate || !q || q === '0' || p.unknown === null || BigInt(q) > BigInt(p.unknown) || !input.reason.trim() || !categories.includes(input.category))
            throw new Error('Ungueltige Belegzuordnung');
        if (candidate.key.startsWith('rule:'))
            throw new Error('Regeln belegen keinen Erwerb; manuell zuordnen');
        const claims = db.prepare('SELECT quantity FROM inventory_evidence_claims WHERE source_key=? AND active=1').all(input.sourceKey) as {
            quantity: string;
        }[], used = claims.reduce((n, c) => n + BigInt(c.quantity), 0n);
        if (used + BigInt(q) > BigInt(candidate.quantity))
            throw new Error('Belegmenge bereits verwendet');
        const id = randomUUID(), cost = candidate.costCents === null ? null : (BigInt(candidate.costCents) * BigInt(q) / BigInt(candidate.quantity)).toString();
        p.slices.push({ id, quantity: q, category: input.category, method: candidate.method, status: 'manually_confirmed', evidence: input.reason + ' / ' + input.sourceKey, costCents: cost, active: true });
        db.prepare('INSERT INTO inventory_evidence_claims VALUES(?,?,?,?,1)').run(id, input.sourceKey, p.itemId, q);
        p.revision++;
        save(db, recalculate(p));
        audit(db, p.itemId, 'confirmed_source_link', input);
        db.exec('COMMIT');
        return p;
    }
    catch (e) {
        db.exec('ROLLBACK');
        throw e;
    }
}
export function rejectInventorySuggestion(db: DatabaseSync, input: {
    itemId: string;
    revision: number;
    sourceKey: string;
    reason: string;
}) {
    db.exec('BEGIN IMMEDIATE');
    try {
        const p = inventoryPosition(db, input.itemId);
        if (!p || p.revision !== input.revision)
            throw new Error('Revision conflict');
        if (!input.reason.trim())
            throw new Error('Begruendung erforderlich');
        db.prepare('INSERT INTO inventory_rejections VALUES(?,?,?,?) ON CONFLICT(item_id,source_key) DO UPDATE SET reason=excluded.reason,changed_at=excluded.changed_at').run(p.itemId, input.sourceKey, input.reason, new Date().toISOString());
        p.revision++;
        save(db, p);
        audit(db, p.itemId, 'suggestion_rejected', input);
        db.exec('COMMIT');
        return p;
    }
    catch (e) {
        db.exec('ROLLBACK');
        throw e;
    }
}
export function confirmConsumedObservation(db: DatabaseSync, input: {
    itemId: string;
    revision: number;
    quantity: string;
    reason: string;
}) {
    db.exec('BEGIN IMMEDIATE');
    try {
        const p = inventoryPosition(db, input.itemId);
        if (!p || p.revision !== input.revision)
            throw new Error('Revision conflict');
        const q = quantity(input.quantity);
        if (!q || q === '0' || !input.reason.trim() || BigInt(q) > BigInt(p.reservedOut))
            throw new Error('Unbestaetigte Verbrauchsmenge nicht verfuegbar');
        p.reservedOut = (BigInt(p.reservedOut) - BigInt(q)).toString();
        p.revision++;
        save(db, recalculate(p));
        audit(db, p.itemId, 'consumed_observation_confirmed', input);
        db.exec('COMMIT');
        return p;
    }
    catch (e) {
        db.exec('ROLLBACK');
        throw e;
    }
}
export function originCategories(origin: Origin): Category[] { return origin.upstream?.length ? origin.upstream.flatMap(originCategories) : [origin.category]; }
export function sliceCategories(slice: Slice): Category[] { if (slice.manualCategoryOverride)
    return [slice.category]; return slice.origins?.length ? slice.origins.flatMap(originCategories) : [slice.category]; }
export function inventorySuggestions(db: DatabaseSync, p: Position) { return inventoryCandidates(db, p).slice(0, 25); }



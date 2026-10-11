import { storeRecord } from '../src/lib/source-records';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureDb } from './followup-fixtures';
import { observeInventory, inventoryPosition, decideInventory, transferInventory, saveInventoryRule, inventorySuggestions, transformInventory, confirmInventoryEvidence, rejectInventorySuggestion, inventoryDetail } from '../src/lib/inventory-provenance';
import type { ProjectRecord } from '../src/lib/source-records';
function asset(id = '1', owner = '1001', quantity = '100', at = '2026-10-09T12:00:00Z', type = '34'): ProjectRecord { return { kind: 'asset_snapshot', source: 'esi', sourceClass: 'automatic', sourceCharacterId: owner, fetchedAt: at, status: 'actual', dataQuality: 'measured', deduplicationKey: 'asset:' + owner + ':' + id, data: { item_id: id, type_id: type, quantity, location_id: '6001' } }; }
test('Inventory baseline is unknown, excludes plans and foreign owners; exact quantities and idempotence', () => {
    const db = fixtureDb();
    try {
        observeInventory(db, [asset('1', '1001', '9007199254740993'), asset('2', '9999'), { ...asset('3'), status: 'plan' }]);
        const p = inventoryPosition(db, '1')!;
        assert.equal(p.unknown, '9007199254740993');
        assert.equal(p.baseline, true);
        assert.equal(inventoryPosition(db, '2'), undefined);
        assert.equal(inventoryPosition(db, '3'), undefined);
        observeInventory(db, [asset('1', '1001', '9007199254740993')]);
        assert.equal(inventoryPosition(db, '1')!.revision, p.revision);
    }
    finally {
        db.close();
    }
});
test('Manual mixed slices survive same-item own transfer and reimport without any money write', () => {
    const db = fixtureDb();
    try {
        observeInventory(db, [asset()]);
        let p = decideInventory(db, { itemId: '1', revision: 1, action: 'assign', quantity: '60', category: 'Mining', reason: 'Explicit proof' });
        p = decideInventory(db, { itemId: '1', revision: p.revision, action: 'assign', quantity: '25', category: 'Trading', reason: 'Purchased for trading' });
        assert.equal(p.unknown, '15');
        assert.throws(() => decideInventory(db, { itemId: '1', revision: p.revision, action: 'assign', quantity: '16', category: 'PI', reason: 'Invalid' }), /verfuegbar/);
        assert.throws(() => decideInventory(db, { itemId: '1', revision: 1, action: 'revoke', sliceId: p.slices[0].id, reason: 'Stale' }), /Revision conflict/);
        observeInventory(db, [asset('1', '1002', '100', '2026-10-10T12:00:00Z')]);
        p = inventoryPosition(db, '1')!;
        assert.equal(p.owner, '1002');
        assert.equal(p.unknown, '15');
        assert.equal(p.slices[0].quantity, '60');
        assert.equal(db.prepare('SELECT COUNT(*) n FROM financial_sources').get()!.n, 0);
        assert.equal(db.prepare('SELECT COUNT(*) n FROM economic_events').get()!.n, 0);
    }
    finally {
        db.close();
    }
});
test('Partial transfer preserves global classified quantities and cannot double allocate', () => {
    const db = fixtureDb();
    try {
        observeInventory(db, [asset('1'), asset('2', '1002', '40')]);
        const a = decideInventory(db, { itemId: '1', revision: 1, action: 'assign', quantity: '60', category: 'Ice', reason: 'Confirmed ice' }), result = transferInventory(db, { from: '1', to: '2', fromRevision: a.revision, toRevision: 1, sliceId: a.slices[0].id, quantity: '40', reason: 'Confirmed stack split' });
        assert.equal(result.from.slices[0].quantity, '20');
        assert.equal(result.to.slices[0].quantity, '40');
        assert.equal(result.to.unknown, '0');
        assert.throws(() => transferInventory(db, { from: '1', to: '2', fromRevision: result.from.revision, toRevision: result.to.revision, sliceId: a.slices[0].id, quantity: '1', reason: 'Invalid' }), /verfuegbar/);
    }
    finally {
        db.close();
    }
});
test('Shrinking observations expose conflict without silently dropping confirmed provenance', () => {
    const db = fixtureDb();
    try {
        observeInventory(db, [asset()]);
        decideInventory(db, { itemId: '1', revision: 1, action: 'assign', quantity: '60', category: 'PI', reason: 'Confirmed' });
        observeInventory(db, [asset('1', '1001', '20', '2026-10-10T12:00:00Z')]);
        const p = inventoryPosition(db, '1')!;
        assert.equal(p.conflict, true);
        assert.equal(p.unknown, null);
        assert.equal(p.slices[0].quantity, '60');
        assert.equal(db.prepare('SELECT COUNT(*) n FROM financial_sources').get()!.n, 0);
    }
    finally {
        db.close();
    }
});
test('Location rules are suggestions, are audited and cannot override manual assignments', () => {
    const db = fixtureDb();
    try {
        observeInventory(db, [asset()]);
        const p = decideInventory(db, { itemId: '1', revision: 1, action: 'assign', quantity: '60', category: 'Mining', reason: 'Confirmed' });
        const rule = saveInventoryRule(db, { revision: 0, enabled: true, location: '6001', category: 'Trading', reason: 'Proposal only' });
        assert.equal(inventorySuggestions(db, p)[0].quantity, '40');
        assert.equal(inventoryPosition(db, '1')!.slices[0].category, 'Mining');
        saveInventoryRule(db, { ...rule, enabled: false });
        assert.equal(inventorySuggestions(db, p).length, 0);
    }
    finally {
        db.close();
    }
});
test('Confirmed transformation consumes partial input slices, retains mixed origins and unknown costs', () => {
    const db = fixtureDb();
    try {
        observeInventory(db, [asset('1'), asset('2', '1001', '100'), asset('3', '1001', '10', undefined, '35')]);
        const a = decideInventory(db, { itemId: '1', revision: 1, action: 'assign', quantity: '60', category: 'Mining', reason: 'Mine' }), b = decideInventory(db, { itemId: '2', revision: 1, action: 'assign', quantity: '40', category: 'Trading', reason: 'Buy' });
        transformInventory(db, { id: 'fixture-transform', reason: 'Explicit processing evidence', inputs: [{ itemId: '1', sliceId: a.slices[0].id, revision: a.revision, quantity: '30' }, { itemId: '2', sliceId: b.slices[0].id, revision: b.revision, quantity: '20' }], outputs: [{ itemId: '3', revision: 1, quantity: '10' }] });
        const p = inventoryPosition(db, '3')!;
        assert.equal(p.slices.length, 1);
        assert.equal(p.slices[0].quantity, '10');
        assert.equal(p.slices[0].costCents, null);
        assert.deepEqual(p.slices[0].origins?.map(o => [o.category, o.quantity]), [['Mining', '30'], ['Trading', '20']]);
        assert.equal(inventoryPosition(db, '1')!.unknown, '40');
        assert.equal(p.unknown, '0');
        assert.equal(inventoryPosition(db, '1')!.slices[0].quantity, '30');
        assert.equal(db.prepare('SELECT COUNT(*) n FROM financial_sources').get()!.n, 0);
    }
    finally {
        db.close();
    }
});
test('Market source quantities are exclusive, preserve exact purchase cost and do not imply Trading', () => {
    const db = fixtureDb();
    try {
        observeInventory(db, [asset('1'), asset('2', '1001')]);
        storeRecord(db, { ...asset(), kind: 'wallet_transaction', deduplicationKey: 'purchase:1', data: { type_id: '34', quantity: '3', unit_price: '0.01', is_buy: true, is_personal: true } });
        const a = confirmInventoryEvidence(db, { itemId: '1', revision: 1, sourceKey: 'purchase:1', quantity: '2', category: 'MISC', reason: 'Confirmed acquisition link' });
        assert.equal(a.slices[0].costCents, '2');
        assert.equal(a.slices[0].method, 'purchase');
        assert.equal(a.slices[0].category, 'MISC');
        assert.throws(() => confirmInventoryEvidence(db, { itemId: '2', revision: 1, sourceKey: 'purchase:1', quantity: '2', category: 'Trading', reason: 'Reuse invalid' }), /bereits verwendet/);
        const b = confirmInventoryEvidence(db, { itemId: '2', revision: 1, sourceKey: 'purchase:1', quantity: '1', category: 'MISC', reason: 'Remaining purchase' });
        assert.equal(b.slices[0].costCents, '1');
        assert.equal(db.prepare('SELECT COUNT(*) n FROM economic_events').get()!.n, 0);
    }
    finally {
        db.close();
    }
});
test('Rejected source proposal survives repeated observation; wallet amount alone is not an item proof', () => {
    const db = fixtureDb();
    try {
        observeInventory(db, [asset()]);
        storeRecord(db, { ...asset(), kind: 'mining_entry', deduplicationKey: 'mining:1', data: { typeId: '34', quantity: '30' } });
        storeRecord(db, { ...asset(), kind: 'wallet_journal', deduplicationKey: 'wallet:1', data: { amount: '100.00' } });
        const p = inventoryPosition(db, '1')!;
        assert.equal(inventorySuggestions(db, p).length, 1);
        rejectInventorySuggestion(db, { itemId: '1', revision: p.revision, sourceKey: 'mining:1', reason: 'Incorrect linkage' });
        observeInventory(db, [asset()]);
        assert.equal(inventorySuggestions(db, inventoryPosition(db, '1')!).length, 0);
        assert.equal(inventoryDetail(db, '1')!.audit[0].action, 'suggestion_rejected');
    }
    finally {
        db.close();
    }
});
test('Missing observation is not a sale and stale or unobserved positions cannot acquire classifications', () => {
    const db = fixtureDb();
    try {
        observeInventory(db, [asset()]);
        observeInventory(db, []);
        const p = inventoryPosition(db, '1')!;
        assert.equal(p.present, false);
        assert.equal(p.quantity, '100');
        assert.throws(() => decideInventory(db, { itemId: '1', revision: p.revision, action: 'assign', quantity: '1', category: 'Mining', reason: 'No current position' }), /nicht beobachtet/);
        assert.equal(db.prepare('SELECT COUNT(*) n FROM economic_events').get()!.n, 0);
    }
    finally {
        db.close();
    }
});
test('Processing one output unit retains both input origins without inventing fractional output quantities', () => {
    const db = fixtureDb();
    try {
        observeInventory(db, [asset('1'), asset('2', '1001'), asset('3', '1001', '1', undefined, '35')]);
        const a = decideInventory(db, { itemId: '1', revision: 1, action: 'assign', quantity: '60', category: 'Mining', reason: 'Mine' }), b = decideInventory(db, { itemId: '2', revision: 1, action: 'assign', quantity: '40', category: 'Trading', reason: 'Buy' });
        transformInventory(db, { id: 'mixed-singleton', reason: 'Confirmed processing', inputs: [{ itemId: '1', sliceId: a.slices[0].id, revision: a.revision, quantity: '30' }, { itemId: '2', sliceId: b.slices[0].id, revision: b.revision, quantity: '20' }], outputs: [{ itemId: '3', revision: 1, quantity: '1' }] });
        const p = inventoryPosition(db, '3')!;
        assert.equal(p.slices[0].quantity, '1');
        assert.equal(p.slices[0].origins!.length, 2);
        assert.equal(inventoryPosition(db, '1')!.reservedOut, '30');
        assert.throws(() => decideInventory(db, { itemId: '1', revision: inventoryPosition(db, '1')!.revision, action: 'assign', quantity: '41', category: 'Mining', reason: 'Consumed input reused' }), /verfuegbar/);
    }
    finally {
        db.close();
    }
});
test('Unknown input origins and partially known costs remain distinct in a mixed transformation',()=>{const db=fixtureDb();try{observeInventory(db,[asset('1'),asset('2','1001'),asset('3','1001','1',undefined,'35')]);storeRecord(db,{...asset(),kind:'wallet_transaction',deduplicationKey:'purchase:unknown-mix',data:{type_id:'34',quantity:'10',unit_price:'2.01',is_buy:true,is_personal:true}});const a=confirmInventoryEvidence(db,{itemId:'1',revision:1,sourceKey:'purchase:unknown-mix',quantity:'10',category:'Trading',reason:'Known purchase cost'});transformInventory(db,{id:'known-plus-unknown',reason:'Explicit mixed processing',inputs:[{itemId:'1',sliceId:a.slices[0].id,revision:a.revision,quantity:'5'},{itemId:'2',revision:1,quantity:'5'}],outputs:[{itemId:'3',revision:1,quantity:'1'}]});const p=inventoryPosition(db,'3')!;assert.equal(p.slices[0].unknownOrigin,true);assert.equal(p.slices[0].knownInputCostCents,'1005');assert.equal(p.slices[0].costCents,null);assert.equal(p.slices[0].origins![1].status,'unknown');assert.equal(inventoryPosition(db,'2')!.unknown,'95');}finally{db.close();}});

test('Equal-time contradictory owners remain a conflict rather than selecting an arbitrary source',()=>{
 const db=fixtureDb();try{const rows=[asset('1','1001','100'),asset('1','1002','80')];observeInventory(db,rows);const p=inventoryPosition(db,'1')!;assert.equal(p.conflict,true);assert.equal(p.quantity,null);assert.equal(p.unknown,null);assert.throws(()=>decideInventory(db,{itemId:'1',revision:p.revision,action:'assign',quantity:'1',category:'Mining',reason:'Not proven'}));const revision=p.revision;observeInventory(db,rows);assert.equal(inventoryPosition(db,'1')!.revision,revision);}finally{db.close();}
});

test('PI contents and incoming contract items stay proposals; plans and outgoing items never become acquisition',()=>{
 const db=fixtureDb();try{observeInventory(db,[asset()]);storeRecord(db,{...asset(),kind:'pi_pin',deduplicationKey:'pi:stock',data:{contents:[{type_id:'34',amount:'8'}]}});storeRecord(db,{...asset(),kind:'pi_pin',status:'plan',deduplicationKey:'pi:plan',data:{contents:[{type_id:'34',amount:'999'}]}});storeRecord(db,{...asset(),kind:'contract_archive',deduplicationKey:'contract:incoming',data:{for_corporation:false,type:'item_exchange',status:'finished',issuer_id:'9000',acceptor_id:'1001',items:[{type_id:'34',quantity:'12',is_included:true}]}});storeRecord(db,{...asset(),kind:'contract_archive',deduplicationKey:'contract:outgoing',data:{for_corporation:false,type:'item_exchange',status:'finished',issuer_id:'1001',acceptor_id:'9000',items:[{type_id:'34',quantity:'12',is_included:true}]}});const suggestions=inventorySuggestions(db,inventoryPosition(db,'1')!);assert.equal(suggestions.length,2);assert.equal(suggestions.find(s=>s.method==='pi_stock')!.quantity,'8');assert.equal(suggestions.find(s=>s.method==='takeover')!.quantity,'12');assert.equal(inventoryPosition(db,'1')!.unknown,'100');assert.equal(db.prepare('SELECT COUNT(*) n FROM economic_events').get()!.n,0);}finally{db.close();}
});
test('Stale observation cannot overwrite newer custody or known costs',()=>{const db=fixtureDb();try{observeInventory(db,[asset('1','1001','100','2026-10-10T12:00:00Z')]);const p=decideInventory(db,{itemId:'1',revision:1,action:'assign',quantity:'20',category:'Mining',reason:'Known stock'});observeInventory(db,[asset()]);const next=inventoryPosition(db,'1')!;assert.equal(next.asOf,'2026-10-10T12:00:00Z');assert.equal(next.slices[0].id,p.slices[0].id);assert.equal(next.conflict,true);assert.equal(next.present,false);}finally{db.close();}});
test('Negative purchase prices stay an unknown cost basis',()=>{const db=fixtureDb();try{observeInventory(db,[asset()]);storeRecord(db,{...asset(),kind:'wallet_transaction',deduplicationKey:'invalid-price',data:{type_id:'34',quantity:'10',unit_price:'-2.01',is_buy:true,is_personal:true}});assert.equal(inventorySuggestions(db,inventoryPosition(db,'1')!)[0].costCents,null);}finally{db.close();}});

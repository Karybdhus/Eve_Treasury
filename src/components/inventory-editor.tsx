'use client';
import { useRouter } from 'next/navigation';
import { InventoryMovement } from './inventory-movement';
import { useState } from 'react';
import type { Position, Origin } from '@/lib/inventory-provenance';
function OriginTree({ origins }: {
    origins: Origin[];
}) { return <ul>{origins.map((o, i) => <li key={i}>{o.category}: {o.quantity} Eingangsmenge{o.status==='unknown'?' / Herkunft unbekannt':''} / Kosten {o.costCents === null ? 'Unbekannt' : o.costCents + ' Cent'}{o.upstream && <OriginTree origins={o.upstream}/>}</li>)}</ul>; }
const actionNames:Record<string,string>={assign:'Teilmenge zugeordnet',revise:'Herkunft korrigiert',revoke:'Zuordnung zurueckgenommen',confirmed_source_link:'Quellbeleg bestaetigt',confirmed_internal_transfer:'Interne Bewegung bestaetigt',transformation_input:'Verarbeitung: Eingang',transformation_output:'Verarbeitung: Ausgang',observed_internal_move:'Interner Standortwechsel beobachtet',unexplained_quantity_change:'Ungeklaerte Mengenaenderung',no_longer_observed:'Nicht mehr beobachtet',reobserved:'Erneut beobachtet',older_observation_conflict:'Veralteter Quellstand',simultaneous_observation_conflict:'Widerspruechliche Quellen',rejected_suggestion:'Vorschlag verworfen',rule_created:'Standortregel angelegt',rule_updated:'Standortregel geaendert',consumption_settled:'Verbrauch in Beobachtung bestaetigt'};
const categories = ['Mining', 'Ice', 'PI', 'Loot', 'Salvage', 'Hacking', 'Trading', 'MISC'];
type Suggestion = {
    key: string;
    quantity: string;
    category: string;
    method: string;
    evidence: string;
    costCents: string | null;
};
type Rule = {
    id: string;
    revision: number;
    enabled: boolean;
    location: string;
    owner?: string;
    category: string;
    reason: string;
};
export function InventoryEditor({ itemId }: {
    itemId: string;
}) {
    const router = useRouter();
    const [position, setPosition] = useState<Position>(), [suggestions, setSuggestions] = useState<Suggestion[]>([]), [rules, setRules] = useState<Rule[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false), [history, setHistory] = useState<{
        action: string;
        changedAt: string;
        body: {
            reason?: string;
        };
    }[]>([]);
    const [auditPage, setAuditPage] = useState(0), [auditPages, setAuditPages] = useState(1);
    async function load(page = 0) {
        setBusy(true);
        try {
            const response = await fetch('/api/inventory?' + new URLSearchParams({ itemId, page: String(page) }), { cache: 'no-store' }), data = await response.json();
            if (!response.ok)
                throw new Error(data.error);
            setPosition(data.position);
            setHistory(data.audit);
            setAuditPage(data.auditPage ?? 0);
            setAuditPages(Math.max(data.auditPages ?? 1, data.suggestionPages ?? 1));
            setSuggestions(data.suggestions ?? []);
            const rr = await fetch('/api/inventory/commands', { cache: 'no-store' });
            if (rr.ok)
                setRules((await rr.json()).rules);
            setError('');
        }
        catch (e) {
            setError((e as Error).message);
        }
        finally {
            setBusy(false);
        }
    }
    async function change(action: string, values: Record<string, unknown>, command = false) {
        if (!position)
            return;
        setBusy(true);
        setError('');
        try {
            const response = await fetch('/api/inventory' + (command ? '/commands' : ''), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId, revision: position.revision, action, ...values }) }), data = await response.json();
            if (!response.ok)
                throw new Error(data.error);
            await load();
            router.refresh();
        }
        catch (e) {
            setError((e as Error).message);
        }
        finally {
            setBusy(false);
        }
    }
    async function rule(values: Record<string, unknown>) {
        setBusy(true);
        try {
            const r = await fetch('/api/inventory/commands', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'rule', ...values }) }), data = await r.json();
            if (!r.ok)
                throw new Error(data.error);
            await load();
            router.refresh();
        }
        catch (e) {
            setError((e as Error).message);
        }
        finally {
            setBusy(false);
        }
    }
    function categorySelect(defaultValue = 'MISC') { return <label>Herkunft<select name="category" defaultValue={defaultValue}>{categories.map(c => <option key={c}>{c}</option>)}</select></label>; }
    return <details onToggle={e => {
            if (e.currentTarget.open && !position && !busy)
                void load();
        }}><summary>Herkunft und Teilmengen</summary>{busy && <p role="status">Laden...</p>}{error && <p role="alert">{error} <button type="button" onClick={() => void load()}>Aktualisieren</button></p>}{position && <>
        <p>Unzugeordnete freie Menge: {position.unknown ?? 'Unbekannt'} / Bestand: {position.quantity ?? 'Unbekannt'}{position.conflict && ' / Mengenkonflikt'}<br /><small>Stand {new Date(position.asOf).toLocaleString('de-DE')} / Historischer Startbestand: {position.baseline ? 'Ja' : 'Nein'}</small></p>
        {position.slices.filter(s => s.active).map(s => <div key={s.id}><p>{s.quantity} / {s.origins?.length && !s.manualCategoryOverride ? "Verarbeitet / Herkunft aus Eingangsbestand" : s.category} / {({ manual: "Manuell", mining: "Foerderung", pi_production: "PI-Produktion", pi_stock: "PI-Pin-Bestand", purchase: "Kauf", takeover: "Uebernahme", transformation: "Verarbeitung", unknown: "Ungeklaert" } as Record<string, string>)[s.method] ?? s.method} / {s.status === 'manually_confirmed' ? 'Manuell bestaetigt' : s.status}<br />{s.evidence}<br />{s.unknownOrigin&&!s.manualCategoryOverride&&'Herkunft teilweise unbekannt. '}Kostenbasis: {s.costCents === null ? 'Unbekannt' : (BigInt(s.costCents) / 100n).toLocaleString('de-DE') + ',' + (BigInt(s.costCents) % 100n).toString().padStart(2, '0') + ' ISK'}</p><>{s.origins && <OriginTree origins={s.origins}/>} {s.knownInputCostCents != null && <p>Bekannte Eingangsanteile: {s.knownInputCostCents} Cent. Weitere Kostenanteile und ihre Aufteilung koennen unbekannt sein.</p>}</><form className="compact-search" onSubmit={e => { e.preventDefault(); const values = new FormData(e.currentTarget); void change('revise', { sliceId: s.id, category: String(values.get('category')), reason: String(values.get('reason')) }); }}>{categorySelect(s.category)}<label>Korrektur begruenden<input name="reason" required maxLength={2000}/></label><button disabled={busy}>Herkunft korrigieren</button><button type="button" disabled={busy} onClick={e => { const form = e.currentTarget.form!; if (form.reportValidity())
            void change('revoke', { sliceId: s.id, reason: String(new FormData(form).get('reason')) }); }}>Zuordnung zuruecknehmen</button></form><InventoryMovement position={position} slice={s} onChanged={async () => { await load(); router.refresh(); }}/></div>)}
{position.present&&position.unknown!==null&&position.unknown!=='0'&&<InventoryMovement position={position} onChanged={async()=>{await load();router.refresh();}}/>}
        <form className="compact-search" onSubmit={e => { e.preventDefault(); const values = new FormData(e.currentTarget); void change('assign', { quantity: String(values.get('quantity')), category: String(values.get('category')), reason: String(values.get('reason')) }); }}><label>Teilmenge<input name="quantity" required inputMode="numeric" pattern="[1-9][0-9]*"/></label>{categorySelect()}<label>Begruendung<input name="reason" required maxLength={2000}/></label><button disabled={busy || position.conflict || !position.present}>Zuordnen</button></form>
        {position.reservedOut !== '0' && <details><summary>Verbrauch mit aktuellem Bestand abgleichen</summary><p>{position.reservedOut} bereits bestaetigte Verbrauchsmenge ist gegen erneute Zuordnung gesperrt. Bestaetige nur Mengen, deren Abgang im aktuellen beobachteten Bestand bereits enthalten ist.</p><form className="compact-search" onSubmit={e => { e.preventDefault(); const values = new FormData(e.currentTarget); void change('settle_consumption', { quantity: String(values.get('quantity')), reason: String(values.get('reason')) }, true); }}><label>Im Bestand enthaltener Abgang<input name="quantity" required inputMode="numeric" pattern="[1-9][0-9]*"/></label><label>Bestandsabgleich begruenden<input name="reason" required maxLength={2000}/></label><button disabled={busy}>Abgang bestaetigen</button></form></details>}<details><summary>Moegliche Belege ({suggestions.length})</summary><p>Diese Belege zeigen moegliche Herkunft. Erst eine bestaetigte Mengenverknuepfung ordnet sie diesem Bestand zu. Ein Kauf legt keinen Trading-Zweck fest.</p>{suggestions.map(s => <form key={s.key} className="compact-search" onSubmit={e => { e.preventDefault(); const values = new FormData(e.currentTarget); void change('evidence', { sourceKey: s.key, quantity: String(values.get('quantity')), category: String(values.get('category')), reason: String(values.get('reason')) }, true); }}><p>{s.evidence} / Belegmenge {s.quantity} / Kosten {s.costCents === null ? 'Unbekannt' : s.costCents + ' Cent'}</p><label>Beleg-Teilmenge<input name="quantity" required inputMode="numeric" pattern="[1-9][0-9]*"/></label>{categorySelect(s.category)}<label>Verknuepfung begruenden<input name="reason" required maxLength={2000}/></label><button disabled={busy || s.key.startsWith('rule:')}>Beleg bestaetigen</button><button type="button" disabled={busy} onClick={() => void change('reject_suggestion', { sourceKey: s.key, reason: 'Vorschlag manuell verworfen' }, true)}>Vorschlag verwerfen</button></form>)}</details>
        <details><summary>Standortregeln</summary><p>Eine Standortregel erstellt Vorschlaege und ersetzt keine bestaetigte Herkunft.</p>{rules.filter(r => r.location === position.location).map(r => <form key={r.id} className="compact-search" onSubmit={e => { e.preventDefault(); const values = new FormData(e.currentTarget); void rule({ ...r, category: String(values.get('category')), reason: String(values.get('reason')), enabled: values.get('enabled') === 'on' }); }}>{categorySelect(r.category)}<label>Begruendung<input name="reason" defaultValue={r.reason} required/></label><label>Aktiv<input type="checkbox" name="enabled" defaultChecked={r.enabled}/></label><button disabled={busy}>Regel speichern</button></form>)}<form className="compact-search" onSubmit={e => { e.preventDefault(); const values = new FormData(e.currentTarget); void rule({ revision: 0, enabled: true, location: position.location, category: String(values.get('category')), reason: String(values.get('reason')) }); }}>{categorySelect()}<label>Neue Standortregel begruenden<input name="reason" required maxLength={2000}/></label><button disabled={busy}>Regel anlegen</button></form></details>
        <details><summary>Entscheidungen und Bewegungen</summary><div className="actions"><button type="button" disabled={busy || auditPage === 0} onClick={() => void load(auditPage - 1)}>Vorige Belege</button><small>Seite {auditPage + 1} / {auditPages}</small><button type="button" disabled={busy || auditPage + 1 >= auditPages} onClick={() => void load(auditPage + 1)}>Weitere Belege</button></div>{history.map((a, i) => <p key={i}>{actionNames[a.action]??"Bestandsentscheidung"} / {new Date(a.changedAt).toLocaleString('de-DE')}<br />{a.body.reason}</p>)}</details></>}</details>;
}

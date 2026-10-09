import type {ProjectRecord} from '@/lib/source-records';
import type {Character} from '@/lib/esi/sync';
import {assetGroups} from '@/lib/asset-groups';
import {nameResolver} from '@/lib/names';
import {AssetList} from './asset-list';
export function AssetsPanel({rows,characters=[]}:{rows:ProjectRecord[];characters?:Character[]}){
 const names=nameResolver(rows,characters);
 const groups=assetGroups(rows).map(g=>({...g,name:names.type(g.typeId),positions:g.positions.map(p=>({...p,owner:names.character(p.owner),location:names.entity(p.location)}))}));
 return <section className="panel"><h2>Gegenstaende / aktueller Bestand</h2><p>Nach Gegenstandstyp zusammengefasst. Einzelstuecke und Blueprint-Kopien bleiben getrennt. Inventar ist kein realisierter Gewinn.</p><AssetList groups={groups}/></section>;
}

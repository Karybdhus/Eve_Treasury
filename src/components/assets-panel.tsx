import type {ProjectRecord} from '@/lib/source-records';
import {assetPage} from '@/lib/display-pages';
import {AssetList} from './asset-list';
export function AssetsPanel({rows,characters=[],query='',page=0,characterId}:{rows:ProjectRecord[];characters?:{character_id:string;name:string}[];query?:string;page?:number;characterId?:string}){return <section className="panel"><h2>Gegenstaende / aktueller Bestand</h2><p>Typen zusammengefasst; Einzelstuecke und Blueprint-Kopien getrennt. Inventar ist kein realisierter Gewinn. Besitzer und Orte erst bei Bedarf laden.</p><AssetList data={assetPage(rows,characters,query,page)} characterId={characterId}/></section>;}

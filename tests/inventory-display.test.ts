import test from 'node:test';
import assert from 'node:assert/strict';
import {assetPage} from '../src/lib/display-pages';
import {assetGroups} from '../src/lib/asset-groups';
import type {ProjectRecord} from '../src/lib/source-records';
const asset=(id:string,location:string,quantity:string,owner='1'):ProjectRecord=>({kind:'asset_snapshot',source:'esi',sourceClass:'automatic',sourceCharacterId:owner,fetchedAt:'2026-10-09T12:00:00Z',status:'actual',dataQuality:'measured',deduplicationKey:'asset:'+owner+':'+id,data:{item_id:id,type_id:'34',quantity,location_id:location}});
test('Location filter scopes quantities and unresolved locations form one readable option',()=>{
 const rows=[asset('1','60003760','100'),asset('2','99999','30'),asset('3','99998','20')];const result=assetPage(rows,[],'',0,undefined,{location:'unknown'});assert.equal(result.rows[0].quantity,'50');assert.equal(result.rows[0].positionCount,2);assert.equal(result.locations.filter(l=>l.id==='unknown').length,1);
});
test('Conflicting simultaneous asset rows never expose an arbitrary physical quantity',()=>{assert.equal(assetGroups([asset('1','60003760','100'),asset('1','60003760','80','2')])[0].quantity,null);});

test('Container roots resolve and missing or cyclic parents remain unknown',()=>{const child={...asset('1','2','10'),data:{...asset('1','2','10').data,location_type:'item'}};const parent=asset('2','60003760','1');const resolved=assetGroups([child,parent]).find(g=>g.positions.some(p=>p.itemId==='1'))!.positions.find(p=>p.itemId==='1')!;assert.equal(resolved.rootLocation,'60003760');assert.equal(resolved.containers.length,1);assert.equal(assetGroups([child])[0].positions[0].locationUnknown,true);const cycle={...parent,data:{...parent.data,location_id:'1',location_type:'item'}};assert.equal(assetGroups([child,cycle])[0].positions[0].locationUnknown,true);});

import test from 'node:test';
import assert from 'node:assert/strict';
import {searchLibrary} from '../shared/library-search.mjs';
import {registerHistoryTools} from '../mcp/history-tools.mjs';

const charts=[{id:'allowed',name:'Synthetic Physics Division',status:'draft',nodes:[{
 id:'root',data:{unit:{name:'Synthetic Physics',shortName:'SP',assignmentLabel:'Zoë Example',positionTitle:'Deputy Director'}},
}],supportPanels:[{id:'support',title:'Matrix Support',entries:[{id:'e',role:'HR Business Partner',person:'Renée Example'}]}]},
{id:'private',name:'Synthetic Restricted',status:'draft',nodes:[],supportPanels:[{title:'Hidden Support',entries:[{role:'HR Business Partner',person:'Renée Secret'}]}]},
{id:'archived',name:'Synthetic Archived',status:'archived',nodes:[],supportPanels:[{title:'Old Support',entries:[{role:'HR Partner',person:'Renée Older'}]}]}];

test('desktop and MCP search agree on accented names, support roles, combined fields and chart titles',async()=>{
 const handlers=new Map();const client={authorizeTool:async()=>{},listCharts:async()=>({charts}),request:async()=>({control:{chartScope:'selected',allowedChartIds:['allowed']}})};
 registerHistoryTools({registerTool:(name,_schema,handler)=>handlers.set(name,handler)},client);
 for(const query of ['zoe','renee','HR business','zoe deputy','Physics Renee','SP','Matrix support']){
  const expected=searchLibrary([charts[0]],query);assert.ok(expected.length,query);
  const actual=await handlers.get('search_library')({query,includeArchived:false});
  assert.equal(actual.isError,undefined);assert.deepEqual(actual.structuredContent.matches,expected);
  assert.ok(actual.structuredContent.matches.every(x=>x.chartId==='allowed'));
 }
 assert.deepEqual(searchLibrary(charts,'   --- '),[]);
});
test('MCP search excludes archives by default, includes them explicitly and bounds returned results',async()=>{
 const handlers=new Map();registerHistoryTools({registerTool:(n,_s,h)=>handlers.set(n,h)},{authorizeTool:async()=>{},listCharts:async()=>({charts}),request:async()=>({control:{chartScope:'all'}})});
 assert.equal((await handlers.get('search_library')({query:'renee',includeArchived:false})).structuredContent.total,2);
 assert.equal((await handlers.get('search_library')({query:'renee',includeArchived:true})).structuredContent.total,3);
 const many=structuredClone(charts[0]);many.nodes=Array.from({length:550},(_,i)=>({...many.nodes[0],id:'n'+i}));
 const bounded=new Map();registerHistoryTools({registerTool:(n,_s,h)=>bounded.set(n,h)},{authorizeTool:async()=>{},listCharts:async()=>({charts:[many]}),request:async()=>({control:{chartScope:'all'}})});
 const result=(await bounded.get('search_library')({query:'zoe',includeArchived:false})).structuredContent;
 assert.equal(result.total,550);assert.equal(result.matches.length,500);
});

import { ensureSchema, getBindings } from "../../../db";
export async function GET() {
  const { DB } = getBindings(); await ensureSchema(DB);
  const rows=await DB.prepare("SELECT key,payload FROM app_settings WHERE key IN ('library-view','chart-appearance')").all<{key:string;payload:string}>();
  const values=new Map(rows.results.map(r=>[r.key,r.payload]));
  return Response.json({libraryView:values.get('library-view')==='tree'?'tree':'flat',chartAppearance:values.get('chart-appearance')==='annotated'?'annotated':'official'}, {headers:{'cache-control':'private, no-store'}});
}
export async function POST(request:Request) {
  let body:{libraryView?:string;chartAppearance?:string};
  try {body=await request.json();}catch{return Response.json({error:'Invalid preference request.'},{status:400});}
  if (!body || typeof body!=='object' || (body.libraryView===undefined&&body.chartAppearance===undefined) ||
    (body.libraryView!==undefined&&!['flat','tree'].includes(body.libraryView)) ||
    (body.chartAppearance!==undefined&&!['official','annotated'].includes(body.chartAppearance)))
    return Response.json({error:'Choose a supported library view or chart appearance.'},{status:422});
  const {DB}=getBindings();await ensureSchema(DB);
  const entries=[['library-view',body.libraryView],['chart-appearance',body.chartAppearance]].filter((e):e is [string,string]=>e[1]!==undefined);
  await DB.batch(entries.map(([key,value])=>DB.prepare('INSERT INTO app_settings(key,payload) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload').bind(key,value)));
  return GET();
}

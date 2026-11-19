/** @param {string} value */
export function searchText(value) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}

/**
 * The desktop and plain-Node MCP server use the same search rules.
 * @param {import('../lib/chart-library').ChartDocument[]} charts
 * @param {string} query
 * @returns {import('../lib/library-navigation').LibraryMatch[]}
 */
export function searchLibrary(charts, query) {
  const terms=searchText(query).split(' ').filter(Boolean);
  if (!terms.length) return [];
  const matches = (/** @type {string[]} */ values) => {
    const text=searchText(values.join(' '));
    return terms.every(term=>text.includes(term));
  };
  return charts.flatMap(chart=>{
    const nodes=chart.nodes.filter(n=>matches([
      chart.name,n.data.unit.name,n.data.unit.shortName,
      n.data.unit.assignmentLabel,n.data.unit.positionTitle,
    ]));
    const supports=(chart.supportPanels??[]).flatMap(p=>p.entries
      .filter(e=>matches([chart.name,p.title,e.role,e.person]))
      .map(e=>({chartId:chart.id,chartName:chart.name,status:chart.status,
        nodeId:null,organization:p.title,person:e.person,role:e.role})));
    const found=[...supports,...nodes.map(n=>({chartId:chart.id,
      chartName:chart.name,status:chart.status,nodeId:n.id,
      organization:n.data.unit.name,person:n.data.unit.assignmentLabel,
      role:n.data.unit.positionTitle}))];
    return found.length?found:matches([chart.name])?[{
      chartId:chart.id,chartName:chart.name,status:chart.status,nodeId:null,
      organization:chart.name,person:'',role:'',
    }]:[];
  });
}

import React, { useEffect, useState, useMemo } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { getPartyColor } from './utils/colors';
import { TopNav, Card } from './components/layout.jsx';
import { InteractiveMap, Legend } from './components/map.jsx';
import { BarChart, PieChart, LeadMarginChart, CoverageTimeline, PartyTrendChart } from './components/charts.jsx';
import DetailOverlay from './components/DetailOverlay';
import SortableTH from './components/SortableTH';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

function App(){
  // Raw state
  const [results, setResults] = useState([]);            // all individual division result records
  const [districts, setDistricts] = useState([]);        // meta data (id, name, divisions)
  const [selected, setSelected] = useState(null);        // overlay target (result or aggregated district)
  const [view, setView] = useState('dashboard');         // current navigation view
  const [districtSort, setDistrictSort] = useState({ field:'ed_name', dir:'asc' });
  const [divisionSort, setDivisionSort] = useState({ field:'ed_name', dir:'asc' });

  // Initial data fetch + socket live updates
  useEffect(()=> {
    let active = true;
    axios.get(`${API_BASE}/api/districts`).then(r=> { if(active) setDistricts(r.data||[]); });
    axios.get(`${API_BASE}/api/results`).then(r=> { if(active) setResults(r.data||[]); });
    const socket = io(API_BASE,{ transports:['websocket'] });
    socket.on('results:all', (all)=> { setResults([...all]); });
    socket.on('result:new', (rec)=> { setResults(prev=> [...prev, rec]); });
    socket.on('result:updated', (rec)=> { setResults(prev=> prev.map(r=> r.id===rec.id? rec : r)); });
    return ()=> { active=false; socket.close(); };
  },[]);

  // Sort results newest first for timeline / latest result
  const resultsSorted = useMemo(()=> {
    const sorted = [...results].sort((a,b)=> new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    console.log('resultsSorted updated:', sorted.length);
    return sorted;
  },[results]);
  const latestResult = resultsSorted[0];

  // Latest record per polling division (choose newest by createdAt)
  const latestPerDivision = useMemo(()=> {
    const byDivision = new Map();
    results.forEach(r=> {
      if(!r.pd_code) return; // safety
      const prev = byDivision.get(r.pd_code);
      if(!prev || new Date(r.createdAt) > new Date(prev.createdAt)) byDivision.set(r.pd_code, r);
    });
    const latest = Array.from(byDivision.values());
    console.log('latestPerDivision updated:', latest.length);
    return latest;
  },[results]);

  // Aggregated district level data (coverage + parties + winners)
  const districtData = useMemo(()=> {
    if(!districts.length) return [];
    // Precompute latest division results by district
    const latestByDivision = new Map(latestPerDivision.map(r=> [r.pd_code, r]));
    return districts.map(d=> {
      const ed_code = d.id;
      const ed_name = d.name?.en || d.name || d.id;
      const divisionCodes = (d.divisions||[]).map(div=> div.id);
      const perDivision = divisionCodes.map(code=> latestByDivision.get(code)).filter(Boolean);
      const reportedDivisions = perDivision.map(r=> r.pd_code);
      const reportedCount = reportedDivisions.length;
      const totalDivisions = divisionCodes.length || 0;
      const coverageRatio = totalDivisions? reportedCount/totalDivisions : 0;
      const complete = totalDivisions>0 && reportedCount === totalDivisions;
      // Aggregate parties
      const partyMap = new Map();
      perDivision.forEach(r=> (r.by_party||[]).forEach(p=> {
        const prev = partyMap.get(p.party_code) || { party_code:p.party_code, party_name:p.party_name, votes:0 };
        prev.votes += p.votes || 0;
        partyMap.set(p.party_code, prev);
      }));
      const parties = Array.from(partyMap.values()).sort((a,b)=> b.votes - a.votes);
      const top = parties[0];
      return {
        ed_code, ed_name,
        divisionCodes,
        reportedDivisions,
        reportedCount,
        totalDivisions,
        coverageRatio,
        complete,
        parties,
        topParty: top?.party_code || null,
        topVotes: top?.votes || 0,
        partiesCount: parties.length
      };
    });
  },[districts, latestPerDivision]);

  // Winners list for map component
  const districtWinners = useMemo(()=> {
    const winners = districtData.filter(d=> d.topParty).map(d=> ({
      ed_code:d.ed_code,
      ed_name:d.ed_name,
      party_code:d.topParty,
      votes:d.topVotes,
      complete:d.complete,
      ratio:d.coverageRatio,
      data:d
    }));
    console.log('districtWinners updated:', winners.length);
    return winners;
  },[districtData]);

  // District totals raw (for sorting / charts)
  const districtTotalsRaw = useMemo(()=> districtData.map(d=> ({
    ed_code:d.ed_code,
    ed_name:d.ed_name,
    totalVotes: d.parties.reduce((a,p)=> a+p.votes,0),
    topParty:d.topParty,
    topVotes:d.topVotes,
    coverage:d.coverageRatio,
    record:d
  })),[districtData]);

  // Sorted district totals
  const districtTotals = useMemo(()=> {
    const { field, dir } = districtSort; const list=[...districtTotalsRaw];
    list.sort((a,b)=> {
      let va=a[field]; let vb=b[field];
      if(field==='ed_name'){ va=va||''; vb=vb||''; return dir==='asc'? va.localeCompare(vb): vb.localeCompare(va); }
      if(typeof va==='number' && typeof vb==='number') return dir==='asc'? va - vb : vb - va;
      return 0;
    });
    return list;
  },[districtTotalsRaw, districtSort]);

  // Division level sortable rows
  const divisionRows = useMemo(()=> {
    const rows = latestPerDivision.map(r=> {
      const partiesSorted=[...(r.by_party||[])].sort((a,b)=> b.votes - a.votes);
      const lead=partiesSorted[0]; const second=partiesSorted[1];
      const totalVotes = partiesSorted.reduce((a,p)=> a+p.votes,0);
      return {
        id:r.id,
        ed_code:r.ed_code,
        ed_name:r.ed_name,
        pd_code:r.pd_code,
        pd_name:r.pd_name,
        totalVotes,
        leadParty:lead?.party_code || null,
        leadVotes:lead?.votes || 0,
        margin: second? (lead.votes-second.votes):(lead?.votes||0),
        marginPct: second? ((lead.votes-second.votes)/(lead.votes||1)):1,
        record:r
      };
    });
    const { field, dir } = divisionSort;
    rows.sort((a,b)=> {
      let va=a[field]; let vb=b[field];
      if(field==='ed_name' || field==='pd_name'){ va=va||''; vb=vb||''; return dir==='asc'? va.localeCompare(vb): vb.localeCompare(va); }
      if(typeof va==='number' && typeof vb==='number') return dir==='asc'? va - vb : vb - va;
      return 0;
    });
    return rows;
  },[latestPerDivision, divisionSort]);

  // Island totals (aggregate parties across districts)
  const islandTotals = useMemo(()=> {
    const map = new Map();
    districtData.forEach(d=> d.parties.forEach(p=> { const prev=map.get(p.party_code)||{ party_code:p.party_code, party_name:p.party_name, votes:0 }; prev.votes+=p.votes; map.set(p.party_code, prev); }));
    const totals = Array.from(map.values()).sort((a,b)=> b.votes-a.votes);
    console.log('islandTotals updated:', totals.length);
    return totals;
  },[districtData]);

  const totalDistricts = districtData.length;
  const receivedDistricts = districtData.filter(d=> d.complete).length;

  return (
    <div className="client-app">
      <TopNav current={view} onChange={setView} />
      <div className="client-main">
        {view==='dashboard' && (
          <>
            <div className="dash-left">
              <h1 className="page-title">Sri Lanka Presidential Results (Live)</h1>
              <h3 className="section-title">District Leaders Map</h3>
              <InteractiveMap winners={districtWinners} onSelect={(d)=> setSelected(d.data)} />
              <Legend />
              <div className="cards-grid">
                <Card title="Latest Result - Just Received">
                  {!latestResult && <em>No results yet</em>}
                  {latestResult && <div onClick={()=> setSelected(latestResult)} className="clickable">
                    <strong>{latestResult.ed_name} / {latestResult.pd_name}</strong><br/>
                    <small>ID: {latestResult.id}</small><br/>
                    <small>Seq: {latestResult.sequence_number}</small><br/>
                    <small>Created: {new Date(latestResult.createdAt).toLocaleTimeString()}</small>
                  </div>}
                </Card>
                <Card title="Island Total">
                  {islandTotals.length===0 && <em>No data</em>}
                  {islandTotals.slice(0,8).map(p=> <div key={p.party_code} className="list-row">
                    <span><span className="party-swatch" style={{background:getPartyColor(p.party_code)}}></span>{p.party_code}</span>
                    <span className="mono">{p.votes.toLocaleString()}</span>
                  </div>)}
                </Card>
                <Card title="District Totals (sortable)">
                  {districtTotals.length===0 && <em>No data</em>}
                  <div className="scroll-box h200">
                    <table className="tight-table">
                      <thead><tr>
                        <SortableTH label='District' field='ed_name' state={districtSort} setState={setDistrictSort} />
                        <SortableTH label='Votes' field='totalVotes' numeric state={districtSort} setState={setDistrictSort} />
                        <SortableTH label='Coverage' field='coverage' numeric state={districtSort} setState={setDistrictSort} />
                        <th align='left'>Top</th>
                      </tr></thead>
                      <tbody>{districtTotals.map(d=> <tr key={d.ed_code} className="row-link" onClick={()=> setSelected(d.record)}>
                        <td>{d.ed_name}</td>
                        <td align='right' className="mono">{d.totalVotes.toLocaleString()}</td>
                        <td align='right' className="mono">{(d.coverage*100).toFixed(0)}%</td>
                        <td><span className="party-swatch sm" style={{background:getPartyColor(d.topParty)}}></span>{d.topParty}</td>
                      </tr>)}</tbody>
                    </table>
                  </div>
                </Card>
                <Card title="All Results in Received Order">
                  {resultsSorted.length===0 && <em>No results</em>}
                  <div className="scroll-box h200 list-compact">
                    {resultsSorted.map(r=> <div key={r.id} className="list-item row-link" onClick={()=> setSelected(r)}>
                      <strong>{r.sequence_number}</strong> - {r.ed_name} / {r.pd_name} <small className="dim">{new Date(r.createdAt).toLocaleTimeString()}</small>
                    </div>)}
                  </div>
                </Card>
                <Card title="District Completion">
                  <div className="scroll-box h200">
                    <table className="tight-table">
                      <thead><tr><th align='left'>District</th><th align='right'>Divisions</th><th align='left'>Status</th></tr></thead>
                      <tbody>{districtData.map(d=> <tr key={d.ed_code} className="row-link" onClick={()=> setSelected(d)}>
                        <td>{d.ed_name}</td>
                        <td align='right' className="mono">{d.reportedCount}/{d.totalDivisions}</td>
                        <td><span className={d.complete? 'status-chip complete':'status-chip partial'}>{d.complete? 'Complete':'Partial'}</span></td>
                      </tr>)}</tbody>
                    </table>
                  </div>
                </Card>
              </div>
            </div>
            <div className="dash-right">
              <h2 className="panel-heading mt0">District Leaders</h2>
              <table className="tight-table">
                <thead><tr><th align='left'>District</th><th align='left'>Party</th><th align='right'>Votes</th></tr></thead>
                <tbody>{districtWinners.map(w=> <tr key={w.ed_code} className="row-link" onClick={()=> setSelected(w.data)}>
                  <td>{w.ed_name}</td>
                  <td><span className="party-swatch" style={{background:getPartyColor(w.party_code)}}></span>{w.party_code}</td>
                  <td align='right' className="mono">{w.votes.toLocaleString()}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </>
        )}

        {view==='map' && (
          <div className="view-shell">
            <h2 className="panel-heading mt0">Interactive Map</h2>
            <InteractiveMap winners={districtWinners} onSelect={(d)=> setSelected(d.data)} large />
            <p className="hint-text">Hover / click districts to inspect. Colors correspond to leading party.</p>
          </div>
        )}

        {view==='charts' && (
          <div className="view-shell">
            <h2 className="panel-heading mt0">Charts</h2>
            <div className="chart-grid-alt">
              <Card title='Island Vote Share (Top 6)'><BarChart data={islandTotals.slice(0,6)} /></Card>
              <Card title='Island Vote Share Pie (Top 6)'><PieChart data={islandTotals.slice(0,6)} /></Card>
              <Card title='District Lead Margins'><LeadMarginChart districts={districtTotals.slice(0,20)} /></Card>
              <Card title='Coverage Timeline'><CoverageTimeline results={resultsSorted} districts={districtData} /></Card>
              <Card title='Party Cumulative Trend'><PartyTrendChart results={resultsSorted} /></Card>
            </div>
          </div>
        )}

        {view==='divisions' && (
          <div className="view-shell">
            <h2 className="panel-heading mt0">Divisions (Latest Results)</h2>
            <div className="scroll-box h400">
              <table className="tight-table">
                <thead><tr>
                  <SortableTH label='District' field='ed_name' state={divisionSort} setState={setDivisionSort} />
                  <SortableTH label='Division' field='pd_name' state={divisionSort} setState={setDivisionSort} />
                  <SortableTH label='Votes' field='totalVotes' numeric state={divisionSort} setState={setDivisionSort} />
                  <SortableTH label='Lead' field='leadVotes' numeric state={divisionSort} setState={setDivisionSort} />
                  <SortableTH label='Margin' field='margin' numeric state={divisionSort} setState={setDivisionSort} />
                  <SortableTH label='Margin %' field='marginPct' numeric state={divisionSort} setState={setDivisionSort} />
                </tr></thead>
                <tbody>{divisionRows.map(r=> <tr key={r.id} className='row-link' onClick={()=> setSelected(r.record)}>
                  <td>{r.ed_name}</td>
                  <td>{r.pd_name}</td>
                  <td align='right' className='mono'>{r.totalVotes.toLocaleString()}</td>
                  <td><span className='party-swatch sm' style={{background:getPartyColor(r.leadParty)}}></span>{r.leadParty}</td>
                  <td align='right' className='mono'>{r.margin.toLocaleString()}</td>
                  <td align='right' className='mono'>{(r.marginPct*100).toFixed(1)}%</td>
                </tr>)}</tbody>
              </table>
            </div>
          </div>
        )}

        {view==='coverage' && (
          <div className="view-shell">
            <h2 className="panel-heading mt0">Coverage</h2>
            <div className="progress-bar-lg"><div style={{width: totalDistricts? (receivedDistricts/totalDistricts*100).toFixed(1)+'%':'0%'}} /></div>
            <p className="coverage-text"><strong>{receivedDistricts}</strong> of <strong>{totalDistricts}</strong> districts reported.</p>
            <InteractiveMap winners={districtWinners} onSelect={(d)=> setSelected(d.data)} />
          </div>
        )}
      </div>
      {selected && <DetailOverlay result={selected} onClose={()=> setSelected(null)} />}
    </div>
  );
}

export default App;


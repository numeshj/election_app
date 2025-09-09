import React, { useMemo } from 'react';
import { getPartyColor } from '../utils/colors';

export function BarChart({ data }){
  if(!data || data.length===0) return <em style={{opacity:.6}}>No data</em>;
  const max = Math.max(...data.map(d=> d.votes));
  return <div className="bar-chart">{data.map(d=> <div key={d.party_code} className="bar-row">
    <div className="bar-row-head"><span>{d.party_code}</span><span className="mono">{d.votes.toLocaleString()}</span></div>
    <div className="bar-track"><div className="bar-fill" style={{width:(d.votes/max*100)+'%', background:getPartyColor(d.party_code)}} /></div>
  </div>)}</div>;
}

export function PieChart({ data }){
  if(!data || data.length===0) return <em style={{opacity:.6}}>No data</em>;
  const total = data.reduce((a,b)=> a + b.votes, 0) || 1; let acc = 0;
  const circles = data.map(d=> { const frac=d.votes/total; const dash=frac*100; const gap=100-dash; const c=<circle key={d.party_code} r="15.9" cx="16" cy="16" fill="transparent" stroke={getPartyColor(d.party_code)} strokeWidth="8" strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-acc} />; acc+=dash; return c; });
  return <div className="pie-chart">
    <svg viewBox='0 0 32 32' className="pie-svg">{circles}</svg>
    <div className="pie-legend">{data.map(d=> <div key={d.party_code} className="pie-legend-row"><span className="party-swatch" style={{background:getPartyColor(d.party_code)}}></span>{d.party_code} {(d.votes/total*100).toFixed(1)}%</div>)}</div>
  </div>;
}

export function LeadMarginChart({ districts }){
  if(!districts || districts.length===0) return <em style={{opacity:.6}}>No data</em>;
  const rows = districts.filter(d=> d.topVotes>0).map(d=> ({ name:d.ed_name, margin:d.topVotes - (d.record.parties[1]?.votes||0), topParty:d.topParty }));
  if(rows.length===0) return <em style={{opacity:.6}}>No data</em>;
  const max = Math.max(...rows.map(r=> r.margin));
  return <div className='bar-chart small'>
    {rows.map(r=> <div key={r.name} className='bar-row'>
      <div className='bar-row-head'><span>{r.name}</span><span className='mono'>{r.margin.toLocaleString()}</span></div>
      <div className='bar-track'><div className='bar-fill' style={{width:(r.margin/max*100)+'%', background:getPartyColor(r.topParty)}} /></div>
    </div>)}
  </div>;
}

export function CoverageTimeline({ results, districts }){
  if(!results || results.length===0) return <em style={{opacity:.6}}>No data</em>;
  const completedSet=new Set(); const districtStatus=new Map(); const points=[];
  results.forEach((r,i)=> { const key=r.ed_code; const st=districtStatus.get(key)||{ divisions:new Set(), total:0 }; if(!st.total){ const dist=districts.find((d)=> d.ed_code===key); st.total=dist? dist.totalDivisions:0; } if(r.pd_code) st.divisions.add(r.pd_code); if(st.total>0 && st.divisions.size===st.total) completedSet.add(key); districtStatus.set(key, st); points.push({x:i+1,y:completedSet.size}); });
  const maxY=districts.length||1, w=260,h=120,pad=24; const path=points.map((p,i)=> { const x=pad+(p.x/points.length)*(w-pad*2); const y=h-pad-(p.y/maxY)*(h-pad*2); return (i===0?`M${x},${y}`:`L${x},${y}`); }).join(' ');
  return <svg viewBox={`0 0 ${w} ${h}`} className='mini-line'>
    <rect x='0' y='0' width={w} height={h} fill='none' stroke='#2d333b' />
    <path d={path} fill='none' stroke='#2ea043' strokeWidth='2' />
    <text x={pad} y={12} fontSize='10' fill='#8b949e'>0</text>
    <text x={w-18} y={12} fontSize='10' fill='#8b949e'>{maxY}</text>
  </svg>;
}

export function PartyTrendChart({ results }){
  if(!results || results.length===0) return <em style={{opacity:.6}}>No data</em>;
  const cumulative=new Map(); const series=new Map();
  results.forEach((r,i)=> { r.by_party.forEach((p)=> { const prev=cumulative.get(p.party_code)||0; const next=prev+p.votes; cumulative.set(p.party_code,next); if(!series.has(p.party_code)) series.set(p.party_code,[]); series.get(p.party_code).push({x:i+1,y:next}); }); });
  const allPts=Array.from(series.values()).flat(); const maxY=Math.max(...allPts.map(p=> p.y)); const w=260,h=140,pad=24;
  const paths = Array.from(series.entries()).map(([code,pts])=> { const d=pts.map((p,i)=> { const x=pad+(p.x/results.length)*(w-pad*2); const y=h-pad-(p.y/maxY)*(h-pad*2); return (i===0?`M${x},${y}`:`L${x},${y}`); }).join(' '); return <path key={code} d={d} fill='none' stroke={getPartyColor(code)} strokeWidth='2' />; });
  return <div className='trend-chart'>
    <svg viewBox={`0 0 ${w} ${h}`} className='mini-line'>{paths}</svg>
    <div className='mini-legend'>{Array.from(series.keys()).slice(0,8).map(code=> <span key={code} className='legend-chip'><span className='party-swatch sm' style={{background:getPartyColor(code)}}></span>{code}</span>)}</div>
  </div>;
}

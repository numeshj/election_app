import React from 'react';
import { getPartyColor } from '../utils/colors';

export default function DetailOverlay({ result, onClose }) {
  if(!result) return null;
  const isDistrictAgg = result && result.divisionCodes;
  const parties = isDistrictAgg? result.parties : (result.by_party || []);
  const top = parties.slice().sort((a,b)=> b.votes - a.votes)[0];
  return <div className="overlay-lite" role="dialog">
    <div className="overlay-content-box">
      <div className="overlay-head">
        <h2 className="overlay-title">{isDistrictAgg? result.ed_name : `${result.ed_name} / ${result.pd_name}`}</h2>
        <button onClick={onClose} className="btn-close">Close</button>
      </div>
      {isDistrictAgg && <p className="overlay-meta">Divisions reported: {result.reportedCount}/{result.totalDivisions} ({Math.round(result.coverageRatio*100)}%) • Status: {result.complete? 'Complete':'Partial'}</p>}
      {!isDistrictAgg && <p className="overlay-meta">Seq {result.sequence_number} • Ref {result.reference} • {new Date(result.createdAt).toLocaleString()}</p>}
      <div className="overlay-summary">
        <div className="summary-block">
          <strong>{isDistrictAgg? 'Aggregated Parties':'Summary'}</strong>
          {!isDistrictAgg && <ul className="plain-list">{Object.entries(result.summary || {}).map(([k,v])=> <li key={k}>{k}: <strong>{v}</strong></li>)}</ul>}
          {isDistrictAgg && <div className="totals-line">Total Votes: <strong>{parties.reduce((a,p)=> a+p.votes,0).toLocaleString()}</strong></div>}
        </div>
        <div className="summary-block">
          <strong>Top Party</strong>
          {top && <div className="top-party"><span className="party-swatch" style={{background:getPartyColor(top.party_code)}}></span>{top.party_code} {top.party_name} ({top.votes.toLocaleString()} votes)</div>}
        </div>
      </div>
      <h3 className="subheading">Parties</h3>
      <table className="tight-table"><thead><tr><th align='left'>Code</th><th align='left'>Party</th><th align='right'>Votes</th></tr></thead><tbody>
  {parties.slice().sort((a,b)=> b.votes - a.votes).map((p)=> <tr key={p.party_code}><td><span className="party-swatch sm" style={{background:getPartyColor(p.party_code)}}></span>{p.party_code}</td><td>{p.party_name}</td><td align='right' className="mono">{p.votes.toLocaleString()}</td></tr>)}
      </tbody></table>
  {isDistrictAgg && <><h3 className="subheading">Divisions Coverage</h3><div className="divisions-list">{result.divisionCodes.map((code)=> { const reported = result.reportedDivisions.includes(code); return <span key={code} className={reported? 'division-chip reported':'division-chip pending'}>{code}{!reported && '*'}</span>; })}</div><p className="pending-note">* awaiting result</p></>}
    </div>
  </div>;
}

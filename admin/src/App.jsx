import React, { useState, useRef, useEffect, useMemo } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import paths from './data/paths.json';

const empty = { timestamp:'', level:'', ed_code:'', ed_name:'', pd_code:'', pd_name:'', type:'PRESIDENTIAL-FIRST', sequence_number:'', reference:'', summary:{ valid:0, rejected:0, polled:0, electors:0, percent_valid:0, percent_rejected:0, percent_polled:0 }, by_party: [] };

export default function App(){
  const [form, setForm] = useState(empty);
  const [partyRow, setPartyRow] = useState({ party_code:'', votes:0, percentage:0, party_name:'', candidate:'' });
  const [autoCalc, setAutoCalc] = useState(true);
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [view, setView] = useState('entry'); // 'entry' | 'history' | 'coverage'
  const [results, setResults] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [staged, setStaged] = useState([]); // staged bulk imports before submit
  const [submittingAll, setSubmittingAll] = useState(false);
  
  // Required metadata fields for enabling submit
  const requiredMeta = ['timestamp','level','ed_code','ed_name','pd_code','pd_name','type','sequence_number','reference'];
  const formValid = useMemo(()=> {
    // All required meta non-empty (allow 0 numeric) and at least one party with votes
    const metaOk = requiredMeta.every(k=> {
      const v = form[k];
      return v !== undefined && v !== null && String(v).trim() !== '';
    });
    const partiesOk = form.by_party && form.by_party.length>0;
    return metaOk && partiesOk;
  },[form, requiredMeta]);

  // live subscribe to results for history / coverage
  useEffect(()=> {
    axios.get('http://localhost:4000/api/results').then(r=> setResults(r.data));
    axios.get('http://localhost:4000/api/districts').then(r=> setDistricts(r.data));
    const socket = io('http://localhost:4000');
    socket.on('results:all', data => setResults(data));
    socket.on('result:new', rec => setResults(prev => [...prev, rec]));
    return ()=> socket.close();
  },[]);

  // latest per district map for coverage coloring
  const latestPerDistrict = useMemo(()=>{
    const m = new Map();
    [...results].sort((a,b)=> new Date(a.createdAt) - new Date(b.createdAt)).forEach(r=> { m.set(r.ed_code, r); });
    return Array.from(m.values());
  },[results]);
  // Division-level completeness: a district counts complete only if each division id has at least one result (pd_code)
  const districtCompletion = useMemo(()=> {
    const map = {};
    districts.forEach(d=> { map[d.id] = { total: d.divisions?.length || 0, reported: new Set() }; });
    results.forEach(r=> {
      const dist = r.ed_code; // expecting ed_code like '19'
      if(map[dist] && r.pd_code){ map[dist].reported.add(r.pd_code); }
    });
    return map;
  },[districts, results]);
  // Winners enriched with completeness ratio/flags (same method as client app)
  const winners = useMemo(()=> {
    return latestPerDistrict.map(r=> {
      const top = [...r.by_party].sort((a,b)=> b.votes - a.votes)[0];
      const comp = districtCompletion[r.ed_code] || { total:0, reported:new Set() };
      const ratio = comp.total? comp.reported.size/comp.total : 0;
      return { ed_code:r.ed_code, ed_name:r.ed_name, party_code: top?.party_code, record:r, ratio, complete: comp.total>0 && comp.reported.size===comp.total };
    });
  },[latestPerDistrict, districtCompletion]);
  const totalDistricts = districts.length;
  const receivedDistricts = Object.entries(districtCompletion).filter(([k,v])=> v.total>0 && v.reported.size === v.total).length;

  const notify = (text, type='info') => { setMessage({ text, type }); setTimeout(()=> setMessage(null), 3000); };

  const addParty = () => {
    if(!partyRow.party_code) return;
    setForm(f => ({...f, by_party:[...f.by_party, partyRow]}));
    setPartyRow({ party_code:'', votes:0, percentage:0, party_name:'', candidate:'' });
  };

  const removeParty = (code) => setForm(f=> ({...f, by_party: f.by_party.filter(p=> p.party_code!==code)}));

  const submit = async () => {
    try {
      setBusy(true);
      const payload = maybeRecalculate(form);
      await axios.post('http://localhost:4000/api/results', payload);
      notify('Saved result','success');
      setForm(empty);
    } catch(e){
      console.error(e);
      notify('Error saving','error');
    } finally { setBusy(false);}    
  };

  const updateSummary = (k,v) => setForm(f=> ({...f, summary:{...f.summary, [k]:v }}));
  const updateField = (k,v) => setForm(f=> ({...f, [k]:v }));

  const handleFilePick = async (e) => {
    const files = Array.from(e.target.files || []);
    if(files.length === 0) return;
    if(files.length === 1){
      // keep single behavior (load into form directly)
      try {
        const text = await files[0].text();
        const json = JSON.parse(text);
        const merged = { ...empty, ...json, summary: { ...empty.summary, ...(json.summary||{}) }, by_party: json.by_party||[] };
        setForm(merged);
        notify('JSON loaded');
      } catch(err){
        console.error(err);
        notify('Invalid JSON','error');
      }
      return;
    }
    // staging multiple files
    const stagedEntries = await Promise.all(files.map(async (file, idx) => {
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        const merged = { ...empty, ...json, summary: { ...empty.summary, ...(json.summary||{}) }, by_party: json.by_party||[] };
        return { id: Date.now() + '-' + idx + '-' + file.name, name: file.name, data: merged, status:'pending', error:null };
      } catch(err){
        return { id: Date.now() + '-' + idx + '-' + file.name, name: file.name, data: null, status:'invalid', error: 'Parse error' };
      }
    }));
    setStaged(prev => [...prev, ...stagedEntries]);
    notify(`Staged ${stagedEntries.length} files`);
    if(e.target) e.target.value='';
  };

  const removeStaged = (id) => setStaged(s=> s.filter(x=> x.id!==id));
  const loadStagedIntoForm = (id) => {
    const item = staged.find(s=> s.id===id && s.data);
    if(!item) return;
    setForm(item.data);
    notify('Loaded into form');
  };
  const submitStagedOne = async (id) => {
    setStaged(s=> s.map(x=> x.id===id? {...x, status: x.data? 'uploading':x.status }: x));
    const item = staged.find(s=> s.id===id);
    if(!item || !item.data) return;
    try {
      const payload = maybeRecalculate(item.data);
      await axios.post('http://localhost:4000/api/results', payload);
      setStaged(s=> s.map(x=> x.id===id? {...x, status:'success'}:x));
    } catch(err){
      console.error(err);
      setStaged(s=> s.map(x=> x.id===id? {...x, status:'error', error: err.message||'Error'}:x));
    }
  };
  const submitAllStaged = async () => {
    const pending = staged.filter(s=> s.status==='pending' || s.status==='error');
    if(pending.length===0) { notify('Nothing to submit'); return; }
    setSubmittingAll(true);
    for(const p of pending){
      await submitStagedOne(p.id);
    }
    setSubmittingAll(false);
  // Clear form & staged imports after bulk submission
  setForm(empty);
  setStaged([]);
  notify('Bulk submit complete and cleared');
  };
  const clearStaged = () => setStaged([]);

  const maybeRecalculate = (f) => {
    if(!autoCalc) return f;
    const totalVotes = f.by_party.reduce((a,p)=> a + Number(p.votes||0), 0);
    const updatedByParty = f.by_party.map(p=> ({...p, percentage: totalVotes? Number(((p.votes||0)/totalVotes*100).toFixed(2)):0 }));
    const s = { ...f.summary };
    if(totalVotes && !s.valid) s.valid = totalVotes;
    if(s.valid) {
      s.percent_valid = s.polled? Number(((s.valid / s.polled)*100).toFixed(2)) : s.percent_valid;
    }
    return { ...f, by_party: updatedByParty, summary: s };
  };

  const recalcNow = () => setForm(f=> maybeRecalculate(f));

  return <div className="app-shell">
    <Header current={view} onChange={setView} onUploadClick={()=> fileRef.current?.click()} />
    {message && <Toast {...message} />}
  <input ref={fileRef} style={{display:'none'}} type='file' accept='application/json' multiple onChange={handleFilePick} />
    <main className="content">
      {view === 'entry' && <>
      <section className="panel">
        <PanelHeader title="Metadata" extra={<small style={{opacity:.7}}>Result identification</small>} />
        <div className="grid-fields">
          {['timestamp','level','ed_code','ed_name','pd_code','pd_name','type','sequence_number','reference'].map(k=> <Field key={k} label={k}>
            <input value={form[k]} onChange={e=>updateField(k,e.target.value)} />
          </Field>)}
        </div>
      </section>

      <section className="panel">
        <PanelHeader title="Summary" extra={<label style={{fontSize:12}}><input type='checkbox' checked={autoCalc} onChange={e=> setAutoCalc(e.target.checked)} /> auto-calc %</label>} />
        <div className="summary-row">
          {Object.keys(form.summary).map(k=> <Field key={k} label={k}>
            <input type='number' value={form.summary[k]} onChange={e=>updateSummary(k,Number(e.target.value))} />
          </Field>)}
        </div>
        <div style={{textAlign:'right'}}>
          <button className='btn ghost' onClick={recalcNow}>Recalculate</button>
        </div>
      </section>

      <section className="panel">
        <PanelHeader title="Parties" extra={<small style={{opacity:.7}}>{form.by_party.length} entries</small>} />
        <div className="party-inputs">
          {Object.keys(partyRow).map(k=> <Field key={k} label={k} compact>
            <input value={partyRow[k]} onChange={e=> setPartyRow(r=> ({...r, [k]: k==='votes' || k==='percentage'? Number(e.target.value): e.target.value }))} />
          </Field>)}
          <div style={{alignSelf:'end'}}>
            <button className='btn' onClick={addParty}>Add</button>
          </div>
        </div>
        <div className='table-wrapper'>
          <table className='data-table'>
            <thead><tr><th>Party</th><th>Votes</th><th>%</th><th>Candidate</th><th></th></tr></thead>
            <tbody>
              {form.by_party.map((p,i)=> <tr key={p.party_code + i}>
                <td>{p.party_code}<br/><span className='muted'>{p.party_name}</span></td>
                <td style={{textAlign:'right'}}>{p.votes}</td>
                <td style={{textAlign:'right'}}>{p.percentage}</td>
                <td>{p.candidate}</td>
                <td style={{textAlign:'right'}}><button className='btn tiny danger' onClick={()=> removeParty(p.party_code)}>x</button></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </section>

      {staged.length>0 && <section className='panel staging-panel'>
        <PanelHeader title="Staged Imports" extra={<small style={{opacity:.7}}>{staged.length} file(s)</small>} />
        <div className='staging-actions'>
          <button className='btn primary' disabled={submittingAll} onClick={submitAllStaged}>{submittingAll? 'Submitting...':'Submit All'}</button>
          <button className='btn ghost' disabled={submittingAll} onClick={clearStaged}>Clear</button>
        </div>
        <div className='staging-list'>
          {staged.map(item=> <div key={item.id} className={'staging-item status-' + item.status}>
            <div className='staging-meta'>
              <strong>{item.name}</strong>
              {item.data && <span className='muted small'>ed:{item.data.ed_code||'-'} pd:{item.data.pd_code||'-'} seq:{item.data.sequence_number||'-'}</span>}
              {!item.data && <span className='muted small'>No data</span>}
            </div>
            <div className='staging-status-badge'>{item.status}</div>
            <div className='staging-buttons'>
              <button className='btn tiny ghost' disabled={!item.data || item.status==='uploading'} onClick={()=> loadStagedIntoForm(item.id)}>Load</button>
              <button className='btn tiny' disabled={!item.data || item.status==='uploading'} onClick={()=> submitStagedOne(item.id)}>Submit</button>
              <button className='btn tiny danger' disabled={item.status==='uploading'} onClick={()=> removeStaged(item.id)}>Remove</button>
            </div>
            {item.error && <div className='staging-error'>{item.error}</div>}
          </div>)}
        </div>
      </section>}

      <div className='actions-bar'>
  <button disabled={busy || !formValid} className='btn primary' onClick={submit}>{busy? 'Saving...' : 'Submit Result'}</button>
        <button disabled={busy} className='btn ghost' onClick={()=> setForm(empty)}>Clear</button>
        <button className='btn ghost' onClick={()=> fileRef.current?.click()}>Load JSON</button>
      </div>
      </>}

      {view === 'history' && <section className='panel'>
        <PanelHeader title="Submitted Results (Live)" extra={<small style={{opacity:.7}}>{results.length} records</small>} />
        {results.length === 0 && <em style={{opacity:.7}}>No results yet</em>}
        <div className='history-list'>
          {[...results].sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt)).map(r=> <div key={r.id} className='history-item'>
            <div className='hi-left'>
              <strong>{r.sequence_number || '-'}</strong>
              <span className='muted'>{r.ed_name} / {r.pd_name}</span>
            </div>
            <div className='hi-right'>
              <span className='muted'>{new Date(r.createdAt).toLocaleTimeString()}</span>
            </div>
          </div>)}
        </div>
      </section>}

      {view === 'coverage' && <section className='panel'>
        <PanelHeader title="District Coverage" extra={<small style={{opacity:.7}}>{receivedDistricts}/{totalDistricts} districts reported</small>} />
        <div style={{margin:'10px 0 16px', height:8, background:'#0f141a', borderRadius:4, overflow:'hidden', border:'1px solid var(--border)'} }>
          <div style={{width: totalDistricts? (receivedDistricts/totalDistricts*100).toFixed(1)+'%' : '0%', background:'var(--accent)', height:'100%'}} />
        </div>
  <CoverageMap winners={winners} />
        <div style={{display:'flex', gap:14, flexWrap:'wrap', fontSize:11, marginTop:10}}>
          <span style={{display:'flex', alignItems:'center', gap:4}}><span style={{width:14,height:14,background:'#222b33',borderRadius:3}}></span> No Data</span>
          <span style={{display:'flex', alignItems:'center', gap:4}}><span style={{width:14,height:14,background:'var(--accent)',opacity:.6,borderRadius:3}}></span> Partial</span>
          <span style={{display:'flex', alignItems:'center', gap:4}}><span style={{width:14,height:14,background:'var(--accent)',opacity:1,borderRadius:3}}></span> Complete</span>
        </div>
        <div style={{marginTop:16, fontSize:12, display:'flex', gap:30, flexWrap:'wrap'}}>
          <div><strong>Received</strong><br/>{receivedDistricts}</div>
          <div><strong>Pending</strong><br/>{Math.max(0,totalDistricts - receivedDistricts)}</div>
        </div>
      </section>}
    </main>
  <Footer />
  </div>;
}

// Reusable components & styles
function Header({ onUploadClick, current, onChange }){
  const tabs = [
    { key:'entry', label:'Enter Result' },
    { key:'history', label:'History' },
    { key:'coverage', label:'Coverage' }
  ];
  return <header className='topbar'>
    <div className='logo'>Election Admin</div>
    <nav className='nav-tabs'>
      {tabs.map(t=> <button key={t.key} className={'tab-btn' + (current===t.key? ' active':'')} onClick={()=> onChange(t.key)}>{t.label}</button>)}
    </nav>
    <nav className='top-actions'>
      <button className='btn ghost' onClick={onUploadClick}>Import JSON</button>
    </nav>
  </header>;
}

function Footer(){
  return <footer className='footer'>In-memory prototype • {new Date().getFullYear()}</footer>;
}

function PanelHeader({ title, extra }){
  return <div className='panel-header'>
    <h3>{title}</h3>
    <div>{extra}</div>
  </div>;
}

function Field({ label, children, compact }){
  return <label className={`field ${compact? 'compact':''}`}> <span>{label}</span>{children}</label>;
}

function Toast({ text, type }){
  return <div className={`toast ${type}`}>{text}</div>;
}


// Basic coverage map (color districts with any result). For simplicity using inline filtered version of original SVG paths.
function CoverageMap({ winners }){
  const byName = useMemo(()=> Object.fromEntries(winners.map(w=> [normalizeName(aliasName(w.ed_name)), w])), [winners]);
  const colorFor = (code) => {
    const colors = ['#3b82f6','#10b981','#f59e0b','#ef4444','#6366f1','#0ea5e9','#f43f5e','#84cc16'];
    if(!code) return '#222b33';
    const idx = [...code].reduce((a,c)=> a + c.charCodeAt(0),0) % colors.length;
    return colors[idx];
  };
  return <div className='coverage-map'>
    <svg viewBox='0 0 1000 1000'>
      <g>
        {paths.map(p=> {
          const win = byName[normalizeName(aliasName(p.name))];
          if(!win){
            return <path key={p.name} d={p.d} className='map-district outline' />;
          }
          const fill = colorFor(win.party_code);
          const opacity = win.complete? 1 : (0.55 + 0.45 * win.ratio);
          return <path key={p.name} d={p.d} fill={fill} fillOpacity={opacity} className='map-district has-data'>
            <title>{`${p.name} - ${win.party_code || 'N/A'} (${Math.round(win.ratio*100)}% divisions)`}</title>
          </path>;
        })}
      </g>
    </svg>
  </div>;
}

function normalizeName(n){ return (n||'').toLowerCase().replace(/\s+/g,'').replace(/-/g,''); }
function aliasName(name){
  const n = normalizeName(name);
  const map = {
    mulaithivu:'mullaitivu',
    monaragala:'moneragala',
    kandy:'mahanuwara',
  };
  return map[n] || name;
}

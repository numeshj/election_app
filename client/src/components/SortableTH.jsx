import React from 'react';

export default function SortableTH({ label, field, state, setState, numeric }) {
  const active = state.field === field; const dir = active? state.dir : 'asc';
  return <th align={numeric? 'right':'left'} className={active? 'sorted':''} style={{cursor:'pointer'}} onClick={()=> setState({ field, dir: active && dir==='asc'? 'desc':'asc' })}>{label}{active && (dir==='asc'? ' ▲':' ▼')}</th>;
}

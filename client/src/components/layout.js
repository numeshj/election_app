import React from 'react';

export function TopNav({ current, onChange }){
  const tabs = [
    { key:'dashboard', label:'Dashboard' },
    { key:'map', label:'Map' },
    { key:'charts', label:'Charts' },
    { key:'divisions', label:'Divisions' },
    { key:'coverage', label:'Coverage' },
  ];
  return <header className="top-nav">
    <strong className="brand">Election Results</strong>
    <nav className="nav-tabs">{tabs.map(t=> <button key={t.key} onClick={()=> onChange(t.key)} className={current===t.key? 'tab-btn active':'tab-btn'}>{t.label}</button>)}</nav>
  </header>;
}

export function Card({ title, children }){ return <div className="card"><h4 className="card-title">{title}</h4>{children}</div>; }

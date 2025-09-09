import React, { useMemo } from 'react';
import { getPartyColor } from '../utils/colors';
import { sriLankaPaths, normalizeName, aliasName } from '../utils/mapPaths';

export function InteractiveMap({ winners, onSelect, large }){
  const byName = useMemo(()=> Object.fromEntries(winners.map(w=> [normalizeName(w.ed_name), w])), [winners]);
  const paths = useMemo(()=> sriLankaPaths(), []);
  return <div className={large? 'map-shell large':'map-shell'}>
    <svg viewBox='0 0 1000 1000' className="map-svg" data-large={large? '1':'0'}>
      <g>
        {paths.map(p=> {
          const key = normalizeName(aliasName(p.name));
          const w = byName[key];
          if(!w) return <path key={p.name} d={p.d} className="map-district outline" />;
          const fill = getPartyColor(w.party_code);
            const opacity = w.complete? 1 : (0.55 + 0.45 * w.ratio);
          return <path key={p.name} d={p.d} fill={fill} fillOpacity={opacity} className="map-district has-data" onClick={()=> onSelect && onSelect(w)}>
            <title>{`${p.name} - ${w.party_code} (${Math.round(w.ratio*100)}% divisions)`}</title>
          </path>;
        })}
      </g>
    </svg>
  </div>;
}

export function Legend(){
  return <div className="legend">
    <span className="legend-item"><span className="legend-swatch none" /> No Data</span>
    <span className="legend-item"><span className="legend-swatch partial" /> Partial</span>
    <span className="legend-item"><span className="legend-swatch full" /> Complete</span>
  </div>;
}

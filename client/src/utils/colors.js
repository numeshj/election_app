// Color mapping sourced from parties.json (authoritative list) with hash fallback.
import partiesData from '../data/parties.json';

const partyList = (partiesData?.SriLankaPresidentialElection2024?.parties)||[];
// Build direct lookup { CODE: color }
const fixedColors = Object.fromEntries(partyList.map(p=> [p.code, p.color]));

// Fallback palette & hash (in case an unknown code appears in result stream)
const fallbackPalette = [
  '#e63946','#ff9f1c','#2ec4b6','#3d5a80','#6a4c93','#40916c',
  '#ff006e','#8338ec','#bc6c25','#118ab2','#ef476f','#06d6a0'
];
function hashString(str=''){ let h=0; for(let i=0;i<str.length;i++){ h=(Math.imul(31,h)+str.charCodeAt(i))|0;} return Math.abs(h); }

export function getPartyColor(code){
  if (!code) return '#666';
  if (fixedColors[code]) return fixedColors[code];
  const h = hashString(code);
  return fallbackPalette[h % fallbackPalette.length];
}

export function getPartyMeta(code){
  return partyList.find(p=> p.code===code);
}

export const allParties = partyList.slice();

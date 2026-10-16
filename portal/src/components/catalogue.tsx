import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Search,ArrowUpRight,ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { versions, type featured } from '@/lib/versions';
export function GameTile({version}:{version:(typeof versions)[number]}){return <Link to="/viewer/$version" params={{version:version.id}} className="game-tile"><div className="tile-art"><img src={version.image} alt={version.game} loading="lazy"/><span className="tile-tag">{version.path==='index.html'?'ORIGINAL':version.path==='beta-ai.html'?'AI':version.path==='v0xff3.html'?'EXPERIMENTAL':version.category.toUpperCase()}</span></div><div className="tile-copy"><div className="min-w-0"><h3>{version.name}</h3><p>{version.path==='index.html'?'Оригинальный анализатор':version.path==='pro-luckyjet.html'?'Расширенная аналитика':'Оригинальная версия'}</p></div><ArrowUpRight className="tile-arrow" size={16}/></div></Link>}
export function Catalogue({limit}:{limit?:number}){
 const [search,setSearch]=useState('');
 const [filter,setFilter]=useState('Все');
 const filtered=versions.filter(v=>(filter==='Все'||v.game===filter)&&`${v.name} ${v.path}`.toLowerCase().includes(search.toLowerCase()));
 const shown=limit&&!search&&filter==='Все'?filtered.slice(0,limit):filtered;
 return <>
  <div className="catalogue-toolbar">
   <div className="filter-tabs" role="group" aria-label="Игра">{['Все','Lucky Jet','Rocket Queen','Aviator'].map(f=><Button key={f} variant={f===filter?'secondary':'ghost'} onClick={()=>setFilter(f)} aria-pressed={f===filter}>{f}</Button>)}</div>
   <label className="search"><Search size={15}/><input aria-label="Поиск версии" placeholder="Найти версию…" value={search} onChange={e=>setSearch(e.target.value)}/></label>
  </div>
  <p className="catalogue-results" role="status" aria-live="polite" aria-atomic="true">Показано {shown.length} из {filtered.length}</p>
  <div className="catalogue-grid">{shown.map(v=><Link to="/viewer/$version" params={{version:v.id}} className="version-row" key={v.id}>
   <img src={v.image} alt="" loading="lazy"/>
   <div className="min-w-0"><h3>{v.name}</h3><p>{v.game} <span>·</span> {v.category}</p></div><ChevronRight size={16}/>
  </Link>)}</div>
  {!shown.length&&<div className="empty-state">Ничего не найдено.<br/>Попробуйте другое название.</div>}
 </>
}

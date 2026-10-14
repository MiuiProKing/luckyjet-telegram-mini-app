import { describe,it,expect } from 'vitest';
import { versions,featured,formatCoefficient,versionUrl,LEGACY_BASE } from '@/lib/versions';
import { connection } from '@/lib/feed';
const status={source_connected:true,fresh:true,error:'',checked_at:'',last_round_at:'',game_order_verified:false};
describe('AllPredictor data integrity',()=>{
 it('preserves every unique legacy entry',()=>{expect(versions).toHaveLength(51);expect(new Set(versions.map(v=>v.path)).size).toBe(51)});
 it('keeps exactly 1.00 and two decimal coefficients',()=>{expect(formatCoefficient(1)).toBe('1.00');expect(formatCoefficient(1.01)).toBe('1.01');expect(formatCoefficient(123.4)).toBe('123.40')});
 it('does not invent freshness',()=>{expect(connection(status)).toBe('Источник подключён');expect(connection({...status,fresh:false})).toBe('Данные устарели');expect(connection({...status,source_connected:false})).toBe('Источник отключён');expect(connection({...status,error:'offline'})).toBe('Ошибка источника');expect(connection(status,new Error())).toBe('Источник недоступен')});
 it('uses the Classic adapter instead of a recursive hub link',()=>{expect(versionUrl({path:'index.html'})).toBe(LEGACY_BASE+'index.html#luckyjet');expect(versionUrl({path:'pro-luckyjet.html'})).toBe(LEGACY_BASE+'pro-luckyjet.html')});
 it('separates games and exposes all requested featured versions',()=>{expect(featured).toHaveLength(5);expect(versions.find(v=>v.path==='aviator.html')?.game).toBe('Aviator');expect(versions.filter(v=>v.path.includes('rocket')).every(v=>v.game==='Rocket Queen')).toBe(true)})
});

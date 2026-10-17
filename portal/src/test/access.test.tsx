import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import type {ReactNode} from 'react';
import {AppShell} from '@/components/app-shell';
vi.mock('@tanstack/react-router',()=>({Link:({children,to,...props}:{children:ReactNode;to:string})=><a href={to} {...props}>{children}</a>,useRouterState:()=>'/'}));
beforeEach(()=>{sessionStorage.clear();document.documentElement.className=''});
afterEach(cleanup);
describe('Session access',()=>{
 it('rejects a wrong PIN and accepts a numeric PIN entered on a phone',()=>{
  render(<AppShell><p>Application content</p></AppShell>);
  const input=screen.getByLabelText('Код доступа') as HTMLInputElement;
  fireEvent.change(input,{target:{value:'0000'}});fireEvent.submit(input.closest('form')!);
  expect(screen.getByRole('alert').textContent).toContain('Неверный код');
  fireEvent.change(input,{target:{value:'12aa34'}});expect(input.value).toBe('1234');
  fireEvent.submit(input.closest('form')!);
  expect(screen.getByText('Application content')).toBeTruthy();
  expect(sessionStorage.getItem('allpredictor-access')).toBe('yes');
  expect(document.activeElement).toBe(screen.getByRole('main'));
 });
 it('masks the PIN and toggles its visibility',()=>{
  render(<AppShell>content</AppShell>);
  const input=screen.getByLabelText('Код доступа') as HTMLInputElement;
  expect(input.type).toBe('password');fireEvent.click(screen.getByLabelText('Показать код'));
  expect(input.type).toBe('text');fireEvent.click(screen.getByLabelText('Скрыть код'));expect(input.type).toBe('password');
 });
 it('reuses the session across pages and logs out',()=>{
  sessionStorage.setItem('allpredictor-access','yes');
  render(<AppShell>protected page</AppShell>);expect(screen.getByText('protected page')).toBeTruthy();
  fireEvent.click(screen.getByLabelText('Выйти'));expect(sessionStorage.getItem('allpredictor-access')).toBe(null);
  expect(screen.getByLabelText('Код доступа')).toBeTruthy();
 });
 it('restores reduced motion on every app page',()=>{
  sessionStorage.setItem('allpredictor-motion','reduced');render(<AppShell>content</AppShell>);
  expect(document.documentElement.classList.contains('reduced-motion')).toBe(true);
 });
 it('offers a skip link without changing the hash route',()=>{
  sessionStorage.setItem('allpredictor-access','yes');
  window.location.hash='#/history';
  render(<AppShell>content</AppShell>);
  const skip=screen.getByRole('link',{name:'К содержимому'});
  fireEvent.click(skip);
  expect(document.activeElement).toBe(screen.getByRole('main'));
  expect(window.location.hash).toBe('#/history');
 });
});

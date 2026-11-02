import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hitBetButton} from '../safari/src/betting-dom.mjs';

test('a cross-origin frame returns only its origin and never exposes its query token',()=>{
  const frame={localName:'iframe',contentDocument:null,src:'https://game.example/play?access_token=private-fixture-token#secret',ownerDocument:{baseURI:'https://one-vv3016.com/'}};
  const result=hitBetButton({elementsFromPoint:()=>[frame]},20,20);
  assert.equal(result.frameOrigin,'https://game.example');
  assert.match(result.error,/отдельном фрейме/);
  assert.doesNotMatch(JSON.stringify(result),/private-fixture-token|access_token|#secret/);
  assert.equal(result.element,undefined);
});
test('picker recognizes only bet commands, not login, cashout or cancel controls',()=>{
  for(const label of ['Ставка 100','Сделать ставку','Поставить','Зробити ставку','Bet 5.00','Place bet']){
    const button={localName:'button',innerText:label,click(){throw Error('Picker must never click');},getRootNode:()=>({}),closest(){return this;}};
    assert.equal(hitBetButton({elementsFromPoint:()=>[button]},1,1).element,button,label);
  }
  for(const label of ['Вход','Регистрация','Забрать 2,15×','Отменить','Cash out','Bet accepted','Waiting']){
    const button={localName:'button',innerText:label,click(){throw Error('Picker must never click');},getRootNode:()=>({}),closest(){return this;}};
    assert.ok(hitBetButton({elementsFromPoint:()=>[button]},1,1).error,label);
  }
});
test('picker ignores its own overlay while keeping the real button untouched',()=>{
  let clicks=0;
  const own={id:'god-preditor-safari-overlay'};
  const button={localName:'button',innerText:'Ставка',click(){clicks++;},getRootNode:()=>({}),closest(){return this;}};
  assert.equal(hitBetButton({elementsFromPoint:()=>[own,button]},1,1).element,button);
  assert.equal(clicks,0);
});

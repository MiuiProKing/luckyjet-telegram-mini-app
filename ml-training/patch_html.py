from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
path=ROOT/'bog-hishchnik-alert/index.html'
html=path.read_text(encoding='utf-8')
assert 'id="mlLab"' not in html
css='''
.ml-controls{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:16px 0}.ml-controls label{font-size:12px;color:var(--muted)}.ml-controls select{display:block;margin-top:7px;background:#191a24;color:white;border:1px solid #414252;border-radius:10px;padding:10px;min-width:140px}.ml-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.ml-state{display:inline-block;border:1px solid #675029;color:#ffd28c;background:#2a2013;border-radius:10px;padding:10px 12px;line-height:1.5;font-size:12px}.ml-scroll{overflow-x:auto;margin:15px 0}.ml-table{width:100%;border-collapse:collapse;font-size:12px}.ml-table th,.ml-table td{text-align:left;padding:12px 8px;border-bottom:1px solid var(--border)}.ml-table th{color:var(--muted)}.ml-table td:first-child{white-space:nowrap}.ml-grid .signal-value{font-size:29px}.ml-grid .signal-cell{min-width:0}.ml-caption{font-size:11px;color:var(--muted);line-height:1.55}.ml-actions{display:flex;flex-wrap:wrap;gap:10px}.ml-actions button{padding:11px 13px;background:#191a24;color:white;border:1px solid #414252;border-radius:11px;cursor:pointer}.ml-actions button:disabled{opacity:.5}.ml-source{color:#8bd6ff;font-size:12px;line-height:1.55}@media(max-width:390px){.ml-grid{grid-template-columns:1fr}.ml-controls label{flex:1}.ml-controls select{width:100%;min-width:0}}
'''
html=html.replace('</style>',css+'</style>',1)
panel='''
<section class="section card" id="mlLab" aria-label="Сравнение обученных моделей">
 <div class="analysis-head"><div><h2>Модели Lucky Jet</h2><p>CatBoost · LightGBM · логистическая модель. Проверка на последующих данных.</p></div><a href="ml-evaluation.json" target="_blank" rel="noopener">Отчёт проверки ↗</a></div>
 <div class="ml-state" id="mlState" role="status">Загружаются модели…</div>
 <div class="ml-controls"><label>Целевой коэффициент<select id="mlTarget"><option value="2">От 2×</option><option value="5" selected>От 5×</option><option value="10">От 10×</option><option value="20">От 20×</option></select></label><label>Окно наблюдения<select id="mlHorizon"><option value="1">Следующий раунд</option><option value="3" selected>Следующие 3 раунда</option><option value="5">Следующие 5 раундов</option></select></label></div>
 <p class="signal-note" id="mlEvent">Ожидание истории</p>
 <div class="ml-grid"><div class="signal-cell"><div class="signal-label">Базовая частота в обучении</div><div class="signal-value blue" id="mlBaseline">—</div><p class="ml-caption">Сравнение для такой же цели и количества раундов.</p></div><div class="signal-cell"><div class="signal-label">Экспериментальная оценка модели</div><div class="signal-value violet" id="mlCandidate">—</div><p class="ml-caption" id="mlSelected">Ожидание данных</p></div></div>
 <p class="signal-note" id="mlReasons">Преимущество должно быть подтверждено отдельно от расчёта.</p>
 <details><summary>Сравнение на отложенной истории</summary><div class="ml-scroll"><table class="ml-table"><thead><tr><th>Модель</th><th>Brier ↓</th><th>Log loss ↓</th><th>AUC</th></tr></thead><tbody id="mlComparison"></tbody></table></div><p class="signal-note" id="mlEvaluation"></p><p class="ml-caption">Обучение — 60%, выбор модели — 15%, калибровка — 10%, финальная проверка — 15%. На границах исключены пересекающиеся будущие метки. Проверено 20 000 записей; это не гарантия результата игры.</p></details>
 <p class="ml-source" id="mlSource">Подключение истории…</p><p class="signal-note" id="mlStorage">Открывается постоянное хранилище…</p>
 <div class="ml-actions"><button id="mlBackfill">Дочитать до 20 000 раундов</button><button id="mlExport">Скачать историю и журнал JSON</button></div>
 <details style="margin-top:18px"><summary>Новые наблюдения после открытия</summary><p class="signal-note" id="mlLiveStats"></p><div id="mlJournal"></div></details>
 <p class="ml-caption">Сон устройства или закрытие браузера останавливает сбор. При возвращении история дочитывается; потерянные окна не считаются промахами или попаданиями. Точность игрового времени и полнота источника пока не подтверждены.</p>
</section>
'''
html=html.replace('<section class="section card" id="forecast">',panel+'\n<section class="section card" id="forecast">',1)
html=html.replace('<title>БОГ ХИЩНИК — история и статистический прогноз</title>','<title>БОГ ХИЩНИК ML — модели и проверка прогнозов</title>')
html=html.replace('ИСТОРИЯ КОЭФФИЦИЕНТОВ','LUCKY JET · МОДЕЛИ И ИСТОРИЯ',1)
html=html.replace('Интеллектуальный анализ Lucky Jet','Исходные правила · Lucky Jet')
html=html.replace('<script>','<script src="ml-core.js"></script>\n<script>',1)
html=html.replace('const items=merge(result.rows,arrivalIds);lastPollAt=Date.now();online=true;',
 '''const transportGap=!!(wasInitialized&&lastPollAt&&startedAt-lastPollAt>COVERAGE_MS);
   const anchorMissing=!!(anchor&&!result.rows.some(r=>String(r.id)===anchor));
   const items=merge(result.rows,arrivalIds);lastPollAt=Date.now();online=true;
   if(window.BogMLClient)window.BogMLClient.onFeed(rounds,{online:true,fresh:fresh(),pollAt:lastPollAt,gap:transportGap||anchorMissing});''')
html=html.replace("}catch(e){online=false;gap('История не обновилась: '+e.message);", "}catch(e){online=false;if(window.BogMLClient)window.BogMLClient.onError();gap('История не обновилась: '+e.message);")
html=html.replace('processNew(items);render();updateAnalysis()}','processNew(items);if(window.BogMLClient)window.BogMLClient.onFeed(rounds,{online,fresh:fresh(),pollAt:lastPollAt,gap:false});render();updateAnalysis()}')
html=html.replace('Локальная версия 4 · доставка раундов 03.10.2026.', 'Новая ML-ветка · 05.10.2026. Получение коэффициентов — прежний публичный источник, каждую секунду. Обученные модели работают локально в браузере; исходные правила показаны отдельно.')
html=html.replace('</body>','<script src="ml-client.js"></script>\n</body>')
html=html.replace('<a href="#forecast"><b>✦</b>Прогноз</a>','<a href="#mlLab"><b>✦</b>Модели</a><a href="#forecast"><b>◈</b>Правила</a>')
assert 'BogMLClient.onFeed' in html and 'src="ml-client.js"' in html
path.write_text(html,encoding='utf-8')
(path.parent/'FULL_HTML.txt').write_text(html,encoding='utf-8')
print('ML panel and source hooks added to separate copy')

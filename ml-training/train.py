"""Chronological train/select/calibrate/test experiment. No claims about RNG predictability."""
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'.tools/python'))
import json
import math
import hashlib
from datetime import datetime, timezone
import numpy as np
import catboost
import lightgbm as lgb
import xgboost as xgb
import sklearn
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score

LOOKBACK = 200
THRESHOLDS = [1.5, 2, 3, 5, 10, 20, 50]
HORIZONS = [1, 3, 5]

def features(history):
    if len(history) < LOOKBACK:
        raise ValueError('200 past results required')
    history = np.asarray(history[-LOOKBACK:], dtype=np.float64)
    result = []
    for width in [20, 50, 200]:
        part = history[-width:]
        logs = np.log(np.minimum(part, 1000))
        result += [float(logs.mean()), float(logs.std())]
        result += [float(np.mean(part >= threshold)) for threshold in [2, 5, 10]]
    result += [math.log(min(float(value), 1000)) for value in history[-5:][::-1]]
    for threshold in [5, 10, 20, 50]:
        found = np.flatnonzero(history >= threshold)
        gap = LOOKBACK - 1 - int(found[-1]) if len(found) else LOOKBACK
        result.append(gap / LOOKBACK)
    logs = np.log(np.minimum(history, 1000))
    for width in [5,10,20,50,100]:
        part=logs[-width:]
        value=float(part[0]);alpha=2/(width+1)
        for item in part[1:]: value=alpha*float(item)+(1-alpha)*value
        result.append(value)
    for width in [20,50,200]: result += [float(q) for q in np.quantile(logs[-width:], [.25,.5,.75])]
    for threshold in [1.5,2,3]:
        streak=0
        for value in history[::-1]:
            if value>=threshold: break
            streak+=1
        result.append(streak/LOOKBACK)
    return np.asarray(result, dtype=np.float32)

def metrics(y, p):
    p = np.clip(p, 1e-6, 1-1e-6)
    bins = []
    bin_index = np.minimum((p*10).astype(int),9)
    for index in range(10):
        mask = bin_index == index
        if mask.sum():
            bins.append(dict(count=int(mask.sum()), predicted=float(p[mask].mean()), observed=float(y[mask].mean())))
    return dict(brier=float(brier_score_loss(y, p)), logloss=float(log_loss(y, p)),
                auc=float(roc_auc_score(y, p)) if len(np.unique(y)) == 2 else None,
                prevalence=float(y.mean()), samples=len(y), positives=int(y.sum()), calibration=bins)

def calibrate(raw, y):
    raw = np.clip(raw, 1e-6, 1-1e-6)
    x = np.log(raw/(1-raw)).reshape(-1, 1)
    fit = LogisticRegression(C=1, max_iter=300).fit(x, y)
    return [float(fit.coef_[0, 0]), float(fit.intercept_[0])]

def apply_calibration(p, calibration):
    p = np.clip(p, 1e-6, 1-1e-6)
    z = calibration[0] * np.log(p/(1-p)) + calibration[1]
    return 1 / (1 + np.exp(-np.clip(z, -40, 40)))

def interval(y, candidate, baseline):
    # Non-overlapping 50-example blocks account partially for overlapping horizon labels.
    delta = (y-baseline)**2 - (y-candidate)**2
    blocks = np.array([delta[i:i+50].mean() for i in range(0, len(delta)-49, 50)])
    rng = np.random.default_rng(20261005)
    means = rng.choice(blocks, size=(1000, len(blocks)), replace=True).mean(axis=1)
    return [float(x) for x in np.quantile(means, [0.025, 0.975])]

def export_cat(model, path):
    model.save_model(str(path), format='json')
    data = json.loads(path.read_text())
    trees = []
    for tree in data['oblivious_trees']:
        splits = []
        for split in tree.get('splits', []):
            assert split['split_type'] == 'FloatFeature'
            splits.append([split['float_feature_index'], split['border']])
        trees.append(dict(splits=splits, leaves=tree['leaf_values']))
    scale, bias = data['scale_and_bias']
    return dict(type='catboost', trees=trees, scale=scale, bias=bias[0])

def export_lgb(model):
    def compact(tree):
        if 'leaf_value' in tree:
            return float(tree['leaf_value'])
        assert tree['decision_type'] == '<='
        return [tree['split_feature'], tree['threshold'], compact(tree['left_child']), compact(tree['right_child'])]
    return dict(type='lightgbm', trees=[compact(tree['tree_structure']) for tree in model.booster_.dump_model()['tree_info']])

def export_xgb(model):
    booster=model.get_booster()[:model.best_iteration+1]
    config=json.loads(booster.save_config())
    base=json.loads(config['learner']['learner_model_param']['base_score'])
    if isinstance(base,list):base=base[0]
    def compact(tree):
        if 'leaf' in tree:return float(tree['leaf'])
        children={c['nodeid']:c for c in tree['children']}
        feature=int(str(tree['split']).removeprefix('f'))
        return [feature,tree['split_condition'],compact(children[tree['yes']]),compact(children[tree['no']])]
    return dict(type='xgboost',bias=math.log(base/(1-base)),trees=[compact(json.loads(tree)) for tree in booster.get_dump(dump_format='json')])

def old_2x(history):
    # Exact score branch from existing god-preditor-engine.js / predict2x.
    desc=list(reversed(history[-200:]));rate=lambda a:sum(v>=2 for v in a)/len(a)
    def ema(a,alpha):
        value=a[-1]
        for item in a[-2::-1]:value=alpha*item+(1-alpha)*value
        return value
    a50=np.asarray(desc[:50]);streak=0
    for value in desc:
        if value>=2:break
        streak+=1
    weighted=rate(desc[:20])*.5+rate(desc[:50])*.3+rate(desc)*.2
    value=weighted*100+(3 if ema(desc[:20],.25)>=ema(desc[:50],.12) else -2)+(4 if np.median(a50)>=2 else -2)+(min(8,streak) if streak>=4 else 0)-(6 if a50.std()>a50.mean()*1.6 else 0)
    return math.floor(max(45,min(90,value))+.5)/100

def walk_forward(x,y,old=None):
    folds=[];n=len(y)
    for fraction in [.40,.55,.70]:
        end=int(n*fraction);cal_start=int(end*.90);stop=int(n*(fraction+.10))
        fit=np.arange(0,cal_start-5);cal=np.arange(cal_start,end-5);future=np.arange(end,stop)
        baseline=float(y[:end-5].mean());scaler=StandardScaler().fit(x[fit])
        models={
            'logistic':LogisticRegression(C=.1,max_iter=500).fit(scaler.transform(x[fit]),y[fit]),
            'catboost':catboost.CatBoostClassifier(iterations=80,depth=4,learning_rate=.05,l2_leaf_reg=5,random_seed=20261005,thread_count=2,verbose=False,allow_writing_files=False).fit(x[fit],y[fit]),
            'lightgbm':lgb.LGBMClassifier(n_estimators=80,max_depth=4,num_leaves=15,min_child_samples=100,learning_rate=.05,reg_lambda=5,random_state=20261005,n_jobs=2,verbosity=-1,force_col_wise=True).fit(x[fit],y[fit]),
            'xgboost':xgb.XGBClassifier(n_estimators=80,max_depth=4,min_child_weight=25,learning_rate=.05,reg_lambda=5,objective='binary:logistic',tree_method='hist',n_jobs=2,random_state=20261005).fit(x[fit],y[fit])}
        scores={'baseline':metrics(y[future],np.full(len(future),baseline))}
        for name,model in models.items():
            transform=scaler.transform if name=='logistic' else lambda z:z
            calibration=calibrate(model.predict_proba(transform(x[cal]))[:,1],y[cal])
            scores[name]=metrics(y[future],apply_calibration(model.predict_proba(transform(x[future]))[:,1],calibration))
        if old is not None:
            scores['old_2x_raw_score']=metrics(y[future],old[future])
            scores['old_2x_calibrated']=metrics(y[future],apply_calibration(old[future],calibrate(old[cal],y[cal])))
        folds.append(dict(train_end=end,calibration_start=cal_start,test_start=end,test_end=stop,metrics=scores))
    return dict(folds=folds,mean_brier={name:float(np.mean([f['metrics'][name]['brier'] for f in folds])) for name in folds[0]['metrics']},policy='Expanding chronological windows, fixed 80 trees; calibration uses earlier data only; final 15% never used by folds')

def signal_metrics(y,p,baseline,horizon,cutoff):
    wins=[];signals=0;streak=0;worst=0;paused=False;eligible=0
    for i in range(0,len(y),horizon):
        eligible+=1
        if paused or p[i]<cutoff:continue
        signals+=1;win=bool(y[i]);wins.append(win);streak=0 if win else streak+1;worst=max(worst,streak)
        if streak>=2:paused=True
    return dict(signals=signals,eligible_windows=eligible,skip_rate=1-signals/max(eligible,1),hits=sum(wins),misses=len(wins)-sum(wins),hit_rate=sum(wins)/max(signals,1),max_loss_streak=worst,pause_after_two=paused,cutoff=float(cutoff),scope='Unverified API sequence; non-overlapping windows, pause after two misses, no automatic resume')

def main():
    data = json.loads((ROOT/'.data/history.json').read_text())
    manifest = json.loads((ROOT/'.data/manifest.json').read_text())
    values = np.array([row['coefficient'] for row in reversed(data)], dtype=np.float64)
    anchors = np.arange(LOOKBACK, len(values)-max(HORIZONS)+1)
    x = np.stack([features(values[:i]) for i in anchors])
    n = len(anchors)
    boundary = [int(n*.60), int(n*.75), int(n*.85)]
    # Purge the largest target horizon at every boundary: no label uses the next partition.
    train = np.arange(0, boundary[0]-5)
    select = np.arange(boundary[0], boundary[1]-5)
    calibration = np.arange(boundary[1], boundary[2]-5)
    test = np.arange(boundary[2], n)
    tasks, parity = {}, []
    old_scores=np.asarray([old_2x(values[:i]) for i in anchors])
    feature_names = [f'{name}_{width}' for width in [20,50,200] for name in ['log_mean','log_sd','rate2','rate5','rate10']]+[f'log_lag{i}' for i in range(1,6)]+['gap5','gap10','gap20','gap50']+[f'log_ema{w}' for w in [5,10,20,50,100]]+[f'log_q{q}_{w}' for w in [20,50,200] for q in [25,50,75]]+['streak1_5','streak2','streak3']
    export_dir = ROOT/'.data/catboost'
    export_dir.mkdir(exist_ok=True)
    for target in THRESHOLDS:
        for horizon in HORIZONS:
            key = f'{target}x_{horizon}'
            y = np.asarray([int(np.max(values[i:i+horizon]) >= target) for i in anchors])
            baseline = float(y[train].mean())
            scaler = StandardScaler().fit(x[train])
            logistic = LogisticRegression(C=.1, max_iter=500).fit(scaler.transform(x[train]), y[train])
            cb = catboost.CatBoostClassifier(iterations=160, depth=4, learning_rate=.05, l2_leaf_reg=5, loss_function='Logloss', eval_metric='Logloss', random_seed=20261005, thread_count=2, verbose=False, allow_writing_files=False)
            cb.fit(x[train], y[train], eval_set=(x[select], y[select]), early_stopping_rounds=25)
            gb = lgb.LGBMClassifier(n_estimators=160, max_depth=4, num_leaves=15, min_child_samples=100, learning_rate=.05, reg_lambda=5, random_state=20261005, n_jobs=2, verbosity=-1, force_col_wise=True)
            gb.fit(x[train], y[train], eval_set=[(x[select], y[select])], callbacks=[lgb.early_stopping(25, verbose=False)])
            xb=xgb.XGBClassifier(n_estimators=160,max_depth=4,min_child_weight=25,learning_rate=.05,reg_lambda=5,objective='binary:logistic',eval_metric='logloss',tree_method='hist',n_jobs=2,random_state=20261005,early_stopping_rounds=25)
            xb.fit(x[train],y[train],eval_set=[(x[select],y[select])],verbose=False)
            predictors = {'logistic': lambda matrix: logistic.predict_proba(scaler.transform(matrix))[:,1], 'catboost': lambda matrix: cb.predict_proba(matrix)[:,1], 'lightgbm': lambda matrix: gb.predict_proba(matrix)[:,1], 'xgboost':lambda matrix:xb.predict_proba(matrix)[:,1]}
            exported = dict(logistic=dict(type='logistic', mean=scaler.mean_.tolist(), std=scaler.scale_.tolist(), coefficients=logistic.coef_[0].tolist(), intercept=float(logistic.intercept_[0])),
                            catboost=export_cat(cb, export_dir/f'{key}.json'), lightgbm=export_lgb(gb),xgboost=export_xgb(xb))
            select_scores = {name: float(brier_score_loss(y[select], predict(x[select]))) for name, predict in predictors.items()}
            selected = min(select_scores, key=select_scores.get)
            scores, probabilities = {}, {}
            for name, predict in predictors.items():
                cal = calibrate(predict(x[calibration]), y[calibration])
                exported[name]['calibration'] = cal
                p = apply_calibration(predict(x[test]), cal)
                probabilities[name] = p
                scores[name] = metrics(y[test], p)
                examples = np.linspace(0, len(test)-1, 12, dtype=int)
                for example in examples:
                    parity.append(dict(task=key, model=name, features=x[test[example]].tolist(), history=values[anchors[test[example]]-LOOKBACK:anchors[test[example]]].tolist(), probability=float(p[example])))
            baseline_metrics = metrics(y[test], np.full(len(test), baseline))
            old_metrics=None
            if target==2:
                old_cal=calibrate(old_scores[calibration],y[calibration])
                old_metrics=dict(raw_score=metrics(y[test],old_scores[test]),calibrated=metrics(y[test],apply_calibration(old_scores[test],old_cal)),note='Original 2x score is not a probability. Raw Brier is diagnostic only; calibrated version is a fair learned comparator.')
            wf=walk_forward(x,y,old_scores if target==2 else None) if (target,horizon) in [(2,1),(2,3),(10,1),(50,1)] else None
            confidence = interval(y[test], probabilities[selected], baseline)
            improvement = baseline_metrics['brier'] - scores[selected]['brier']
            reasons = ['Порядок игровых раундов и полнота источника независимо не подтверждены.']
            if manifest['approximate_rows']:
                reasons.append(f"Оценочное время у {manifest['approximate_rows']} из {manifest['rows']} записей.")
            if confidence[0] <= 0:
                reasons.append('Устойчивое преимущество по Brier на отложенной части не подтверждено.')
            # Keep source certification false. Historical metrics alone must never turn this into a betting signal.
            tasks[key] = dict(target=target, horizon=horizon, baseline=baseline, selected=selected, models=exported, metrics=scores, baseline_metrics=baseline_metrics,
                selection_brier=select_scores, brier_improvement=improvement, improvement_interval=confidence,
                promoted=False, reasons=reasons, counts=dict(train=len(train), select=len(select), calibration=len(calibration), test=len(test)),old_2x=old_metrics,walk_forward=wf,
                rare_warning=bool(y[test].sum()<100),signal_comparison=dict(old_all_windows=signal_metrics(y[test],old_scores[test],baseline,horizon,0) if target==2 else None,new_observation_policy=signal_metrics(y[test],probabilities[selected],baseline,horizon,min(.99,baseline+.02)),released_signals=0))
            print(f'{key}: selected={selected}; brier improvement={improvement:.6f}; CI={confidence}; SHADOW', flush=True)
    artifact = dict(version='20261005-ml2', created_utc=datetime.now(timezone.utc).isoformat(), lookback=LOOKBACK, feature_names=feature_names,
        source_manifest={k:v for k,v in manifest.items() if k!='pages'}, source_certified=False, actual_game_order_verified=False,
        split='60% train / 15% select / 10% calibrate / 15% later test; 5 labels purged at boundaries',
        development_holdout_warning='Later test period was already viewed in the earlier pilot. No tuning on test metrics, but a new independent future holdout is required.',
        packages=dict(catboost=catboost.__version__, lightgbm=lgb.__version__,xgboost=xgb.__version__, sklearn=sklearn.__version__, numpy=np.__version__), tasks=tasks)
    public = ROOT/'bog-hishchnik-alert'
    (public/'ml-models.json').write_text(json.dumps(artifact, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    (ROOT/'tests/fixtures/ml-parity.json').write_text(json.dumps(parity, separators=(',', ':')), encoding='utf-8')
    metrics_only = {key:{k:v for k,v in task.items() if k!='models'} for key, task in tasks.items()}
    report = {k:v for k,v in artifact.items() if k!='tasks'}
    report['tasks'] = metrics_only
    (public/'ml-evaluation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print('MODEL_EXPORT_COMPLETE', flush=True)

if __name__ == '__main__':
    main()

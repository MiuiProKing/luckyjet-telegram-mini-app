"""Dependency-free numeric inference; trained parameters are read from the web artifact."""
import math
import struct

def f32(x):
    return struct.unpack('f', struct.pack('f', x))[0]

def sigmoid(z):
    return 1/(1+math.exp(-max(-40, min(40, z))))

def features(history):
    a=list(history[-200:])
    if len(a)<200 or any(not math.isfinite(v) or v<1 for v in a):
        return None
    result=[]
    logs=[math.log(min(v,1000)) for v in a]
    for width in [20,50,200]:
        part=logs[-width:]; mean=sum(part)/width
        result.extend([mean,math.sqrt(sum((v-mean)**2 for v in part)/width)])
        result.extend(sum(v>=t for v in a[-width:])/width for t in [2,5,10])
    result.extend(logs[-5:][::-1])
    for threshold in [5,10,20,50]:
        gap=next((i for i,v in enumerate(reversed(a)) if v>=threshold),200)
        result.append(gap/200)
    for width in [5,10,20,50,100]:
        part=logs[-width:]; value=part[0]; alpha=2/(width+1)
        for item in part[1:]: value=alpha*item+(1-alpha)*value
        result.append(value)
    for width in [20,50,200]:
        part=sorted(logs[-width:])
        for q in [.25,.5,.75]:
            at=(width-1)*q; lo=math.floor(at); hi=math.ceil(at)
            result.append(part[lo]+(part[hi]-part[lo])*(at-lo))
    for threshold in [1.5,2,3]:
        streak=0
        for value in reversed(a):
            if value>=threshold: break
            streak+=1
        result.append(streak/200)
    return list(map(f32,result))

def predict(model,x):
    kind=model['type']; z=0
    if kind=='logistic':
        z=model['intercept']+sum((v-model['mean'][i])/model['std'][i]*model['coefficients'][i] for i,v in enumerate(x))
    elif kind=='catboost':
        for tree in model['trees']:
            leaf=sum((1<<i) for i,(feature,border) in enumerate(tree['splits']) if f32(x[feature])>border)
            z+=tree['leaves'][leaf]
        z=z*model['scale']+model['bias']
    elif kind in ['lightgbm','xgboost']:
        z=model.get('bias',0)
        for tree in model['trees']:
            node=tree
            while isinstance(node,list):
                condition=x[node[0]]<=node[1] if kind=='lightgbm' else f32(x[node[0]])<f32(node[1])
                node=node[2] if condition else node[3]
            z+=node
    else:
        raise ValueError('Unsupported model')
    p=max(1e-6,min(1-1e-6,sigmoid(z))); cal=model.get('calibration',[1,0])
    return max(1e-6,min(1-1e-6,sigmoid(cal[0]*math.log(p/(1-p))+cal[1])))

# Amazon fixes approved by the user 2026-10-16 (answers to Shopify-draft flags):
# 72PC + 48PC kits: remove recovery/swelling/keloid/irritation claims (B3, B4); GK0220-Gold piece count 36; 54PC kits 54 (not 50);
# eucalyptus ingredients botanical name Lavandula Angustifolia -> Eucalyptus Globulus. All sibling SKUs on each ASIN.
import sys, json, csv, re, urllib.parse, time
sys.path.insert(0,'/Users/DK/sp-api'); from spapi import request, seller_id
MP='ATVPDKIKX0DER'; sid=seller_id(); mode=sys.argv[1]
rows=list(csv.DictReader(open('/Users/DK/.cache/spapi/listings.tsv',encoding='utf-8-sig'),delimiter='\t'))
asin_of={r['seller-sku']:r['asin1'] for r in rows}; by_asin={}
for r in rows: by_asin.setdefault(r['asin1'],[]).append(r['seller-sku'])
P=json.load(open('products.json'))
def fam(skus): return sorted({s2 for s in skus for a in [asin_of.get(s) or asin_of.get(s+'_FBA') or asin_of.get(s.replace('_FBA',''))] if a for s2 in by_asin[a] if not s2.startswith('amzn.gr')})
G72=fam(P['4888243798063']['v']); G48=fam(P['9782748217627']['v']); G54=fam(P['4700182904879']['v']); GOLD=fam(['GK0220-Gold'])
EUC=[r['seller-sku'] for r in rows if r['seller-sku'].startswith('PD-EUCALYPTUS')]
BR=[(r'Using Aftercare Solutions Creates Safe and Gentle Piercing Experience\. BENEFITS: Regular Application of BodyJ4You Aftercare Has Been Proven to Speed Up Recovery and Reduce Swelling, Minimizing the Chances of Skin Cracks, Elevated Bumps, and Keloids\.',
     'Using an Aftercare Oil or Balm Keeps Each Size Step Gentle and Comfortable. Apply a Little to the Lobe and the Taper Before Inserting, and Give Your Lobes Time Between Sizes.'),
    (r'for Safe Gentle Piercing Experience\. Oil Moisturizes and Thickens Skin, Calms and Prevents Irritations by Forming Nourishing Oily Layer\. Speed Up Recovery and Reduce Swelling, Minimizing Chances of Skin Cracks, Elevated Bumps, and Keloids\.',
     'for a Gentle Stretching Experience. The Oil Moisturizes and Softens Skin by Forming a Nourishing Oily Layer, Keeping Lobes Comfortable Between Sizes.'),
    (r'Providing Most Comfortable Wear, Prevents Damage and Irritation, Perfect For Daily Use\.','Providing Comfortable Wear, Perfect For Daily Use.')]
log=open(f'amazon_fixes_{mode}.log','w'); rec=[]
def doit(s,fn):
    q=urllib.parse.quote(s,safe='')
    try: r=request('GET',f'/listings/2021-08-01/items/{sid}/{q}',params={'marketplaceIds':MP,'includedData':'summaries,attributes'})
    except Exception as e: return f'{s} GET fail'
    a=r.get('attributes',{}); 
    if not r.get('summaries'): return f'{s} no summary'
    pt=r['summaries'][0]['productType']; patches=[]
    for k,new in fn(a).items():
        if new!=a.get(k): patches.append({'op':'replace','path':f'/attributes/{k}','value':new}); rec.append([s,k,json.dumps(a.get(k),ensure_ascii=False),json.dumps(new,ensure_ascii=False)])
    if not patches: return f'{s} no change'
    p={'marketplaceIds':MP,'issueLocale':'en_US'}
    if mode=='preview': p['mode']='VALIDATION_PREVIEW'
    res=request('PATCH',f'/listings/2021-08-01/items/{sid}/{q}',params=p,body={'productType':pt,'patches':patches})
    return f"{s} {[x['path'][12:] for x in patches]} {res.get('status')} {[(i['code'],i['message'][:90]) for i in res.get('issues',[]) if i.get('severity')=='ERROR']}"
def claims(a):
    bp=[dict(x) for x in a.get('bullet_point',[])]
    for x in bp:
        for o,n in BR: x['value']=re.sub(o,n,x['value'])
    return {'bullet_point':bp} if bp else {}
def qty(n):
    def f(a):
        out={}
        for k in ['item_package_quantity','number_of_pieces']:
            if a.get(k) and a[k][0].get('value') in (32,50):
                v=[dict(x) for x in a[k]]; v[0]['value']=n; out[k]=v
        return out
    return f
def euc(a):
    v=[dict(x) for x in a.get('ingredients',[])]
    for x in v: x['value']=x['value'].replace('(Lavandula Angustifolia)','(Eucalyptus Globulus)')
    return {'ingredients':v} if v else {}
jobs=[(s,claims) for s in G72+G48]+[(s,qty(36)) for s in GOLD]+[(s,qty(54)) for s in G54]+[(s,euc) for s in EUC]
for s,fn in jobs:
    line=doit(s,fn); print(line); log.write(line+'\n'); time.sleep(0.2)
with open(f'changes/2026-10-16-amazon-fixes-{mode}.csv','w') as f:
    w=csv.writer(f); w.writerow(['marketplace','sku','field','before','after']); [w.writerow(['Amazon US']+r) for r in rec]

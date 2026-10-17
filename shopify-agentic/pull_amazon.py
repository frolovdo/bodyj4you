# For every Shopify variant SKU, pull the live Amazon listing (exact SKU, then +/-_FBA variants) -> amazon.json
import sys, json, urllib.parse
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0,'/Users/DK/sp-api'); from spapi import request, seller_id
sid=seller_id(); P=json.load(open('products.json'))
KEEP=['item_name','title_differentiation','bullet_point','product_description','color','size','material','number_of_items','item_package_quantity','unit_count','item_volume','scent','metal_type','gem_type','style','special_feature','material_feature','product_benefit','item_shape','skin_type','directions','safety_warning','ingredients','included_components']
def get(sku):
    for s in [sku, sku.replace('_FBA',''), sku+'_FBA', sku.replace('-FBA','')]:
        try:
            r=request('GET',f'/listings/2021-08-01/items/{sid}/{urllib.parse.quote(s,safe="")}',params={'marketplaceIds':'ATVPDKIKX0DER','includedData':'summaries,attributes'})
            a=r.get('attributes',{})
            if a.get('bullet_point') or a.get('item_name'):
                out={k:[v.get('value', v) if isinstance(v,dict) else v for v in a[k]] for k in KEEP if k in a}
                out['_sku']=s; out['_asin']=(r.get('summaries') or [{}])[0].get('asin'); return sku,out
        except Exception: pass
    return sku,None
skus=[s for p in P.values() for s in p['v']]
with ThreadPoolExecutor(3) as ex: A=dict(ex.map(get,skus))
json.dump(A,open('amazon.json','w'),indent=1,ensure_ascii=False)
print(len(skus),'skus; found',sum(1 for v in A.values() if v),'; missing:',[s for s,v in A.items() if not v])

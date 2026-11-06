# Set the Amazon US price for every seller SKU on the same ASIN as the given SKU.
# Usage: python3 amazon_price.py EO-ROSEHIP-16oz 34.99 preview   (dry run, Amazon validates only)
#        python3 amazon_price.py EO-ROSEHIP-16oz 34.99 send
import sys, json, csv, urllib.parse, datetime
sys.path.insert(0, '/Users/DK/sp-api'); from spapi import request, seller_id
MP = 'ATVPDKIKX0DER'; sku, price, mode = sys.argv[1], round(float(sys.argv[2]), 2), sys.argv[3]
assert mode in ('preview', 'send')
sid = seller_id()
rows = list(csv.DictReader(open('/Users/DK/.cache/spapi/listings.tsv', encoding='utf-8-sig'), delimiter='\t'))
asin = next(r['asin1'] for r in rows if r['seller-sku'] in (sku, sku + '_FBA'))
skus = [r['seller-sku'] for r in rows if r['asin1'] == asin and not r['seller-sku'].startswith('amzn.gr')]
print('ASIN', asin, 'SKUs', skus)
rec = []
for s in skus:
    q = urllib.parse.quote(s, safe='')
    r = request('GET', f'/listings/2021-08-01/items/{sid}/{q}',
                params={'marketplaceIds': MP, 'includedData': 'summaries,attributes'})
    if not r.get('summaries'): print(s, 'no summary'); continue
    pt = r['summaries'][0]['productType']
    old = r.get('attributes', {}).get('purchasable_offer') or [{'marketplace_id': MP, 'currency': 'USD'}]
    new = [dict(o) for o in old]
    for o in new:
        if o.get('marketplace_id', MP) == MP and o.get('audience', 'ALL') == 'ALL':
            o['our_price'] = [{'schedule': [{'value_with_tax': price}]}]
    p = {'marketplaceIds': MP, 'issueLocale': 'en_US'}
    if mode == 'preview': p['mode'] = 'VALIDATION_PREVIEW'
    res = request('PATCH', f'/listings/2021-08-01/items/{sid}/{q}', params=p, body={'productType': pt,
                  'patches': [{'op': 'replace', 'path': '/attributes/purchasable_offer', 'value': new}]})
    errs = [(i['code'], i['message'][:120]) for i in res.get('issues', []) if i.get('severity') == 'ERROR']
    print(s, res.get('status'), errs)
    rec.append([s, json.dumps(old), json.dumps(new), res.get('status')])
with open(f'changes/{datetime.date.today()}-amazon-price-{sku}-{mode}.csv', 'w') as f:
    w = csv.writer(f); w.writerow(['sku', 'before', 'after', 'status']); w.writerows(rec)

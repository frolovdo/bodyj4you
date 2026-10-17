"""Fetch product pages on a theme (preview_theme_id) and validate the JSON-LD. Usage: validate.py THEME_ID [handle ...]"""
import sys, re, json, urllib.request, http.cookiejar
sys.path.insert(0, '/Users/DK/shop-api'); from shopapi import gql
theme = sys.argv[1]
ids = list(json.load(open('/Users/DK/bodyj4you/shopify-agentic/products.json'))) if len(sys.argv) < 3 else None
handles = sys.argv[2:]
if not handles:
    for i in ids:
        gid = i if str(i).startswith('gid') else 'gid://shopify/Product/%s' % i
        handles.append(gql('query($i:ID!){product(id:$i){handle}}', {'i': gid})['product']['handle'])
res = {}
for h in handles:
    cj = http.cookiejar.CookieJar(); op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    op.addheaders = [('User-Agent', 'Mozilla/5.0')]
    s = op.open('https://www.bodyj4you.com/products/%s?preview_theme_id=%s' % (h, theme), timeout=60).read().decode()
    blocks = re.findall(r'<script type="application/ld\+json">(.*?)</script>', s, re.S)
    r = {'blocks': 0, 'errors': []}
    for b in blocks:
        try:
            j = json.loads(b)
        except Exception as e:
            r['errors'].append('PARSE %s: %s' % (e, b.strip()[:120])); continue
        r['blocks'] += 1
        t = j.get('@type')
        if t in ('Product', 'ProductGroup'):
            r['product'] = t; r['rating'] = (j.get('aggregateRating') or {}).get('ratingValue'), (j.get('aggregateRating') or {}).get('reviewCount')
            r['facts'] = len(j.get('additionalProperty', [])); r['offers'] = bool(j.get('offers') or j.get('hasVariant'))
        if t == 'FAQPage':
            r['faqs'] = len(j['mainEntity'])
    res[h] = r
    print(h[:50].ljust(50), json.dumps(r)[:200])
json.dump(res, open('/Users/DK/bodyj4you/shopify-agentic/theme/validate_%s.json' % theme, 'w'), indent=1)
bad = [h for h, r in res.items() if r['errors'] or not r.get('product')]
print('pages', len(res), 'with errors/no product:', len(bad), 'faq pages:', sum(1 for r in res.values() if r.get('faqs')),
      'rated:', sum(1 for r in res.values() if r.get('rating', (None,))[0]))

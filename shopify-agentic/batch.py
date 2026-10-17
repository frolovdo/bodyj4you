import json,sys
D=json.load(open('all_drafts.json')); B=json.load(open('batches.json')); n=int(sys.argv[1])
ids=B[n]; q='mutation Up('+', '.join(f'$p{i}: ProductUpdateInput!' for i in range(len(ids)))+') { '+' '.join(f'u{i}: productUpdate(product: $p{i}) {{ product {{ id }} userErrors {{ field message }} }}' for i in range(len(ids)))+' }'
v={f'p{i}':{'id':f'gid://shopify/Product/{pid}','descriptionHtml':D[pid]['descriptionHtml'],'seo':{'title':D[pid]['seoTitle'],'description':D[pid]['seoDescription']}} for i,pid in enumerate(ids)}
print(q); print(json.dumps(v,ensure_ascii=False))

# Checker for out/<group>.json against SPEC.md hard rules.
import sys, json, re, html
D=json.load(open(sys.argv[1])); bad=0
BAN=r"\b(heal\w*|cure\w*|treat(s|ment|ing)?|prevent\w* infection|antibacterial|antiseptic|antimicrobial|disinfect\w*|kills? germs|swelling|redness|pain|keloid\s+(removal|treatment)|scar removal|hair (re)?growth|regrowth|reliev\w*|anxiety|insomnia|therapeutic|clinically|dermatologist|doctor|kids?|girls?|boys?|teens?|tweens?|children|child|school|best|#1|top[- ]rated|made in usa|guarantee\w*|money[- ]back|amazon|walmart)\b"
for pid,v in D.items():
    h=v.get('descriptionHtml',''); txt=html.unescape(re.sub('<[^>]+>',' ',h)); words=len(txt.split())
    probs=[]
    for k in ['descriptionHtml','seoTitle','seoDescription']:
        if not v.get(k): probs.append('missing '+k)
    for m in re.finditer(BAN, txt+' '+v.get('seoTitle','')+' '+v.get('seoDescription',''), re.I): probs.append('banned: '+m.group(0))
    if not 280<=words<=650: probs.append(f'words {words}')
    if len(v.get('seoTitle',''))>60: probs.append('seoTitle >60')
    if len(v.get('seoDescription',''))>155: probs.append('seoDescription >155')
    for sec in ['Key Facts','Frequently Asked Questions']:
        if f'<h2>{sec}</h2>' not in h: probs.append('missing section '+sec)
    if len(re.findall('<h3>',h))<5: probs.append('FAQ <5')
    if re.search(r'style=|<table|<img|<script',h): probs.append('disallowed html')
    if probs: bad+=1; print(pid, sorted(set(probs)))
print(len(D),'products,',bad,'with problems')

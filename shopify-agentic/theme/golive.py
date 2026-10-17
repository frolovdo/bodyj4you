"""Put the agentic JSON-LD on the LIVE theme (or roll it back).
    python3 golive.py send       upload snippet + edited main-product.liquid to the MAIN theme
    python3 golive.py rollback   restore main-product.liquid from changes/2026-10-17-live-main-product.before.liquid
Before-state of the live file: ../changes/2026-10-17-live-main-product.before.liquid"""
import sys, json, os
sys.path.insert(0, '/Users/DK/shop-api'); from shopapi import gql
HERE = os.path.dirname(os.path.abspath(__file__))
MAIN = "gid://shopify/OnlineStoreTheme/195676799259"
BEFORE = os.path.join(HERE, '../changes/2026-10-17-live-main-product.before.liquid')
OLD = """  <script type="application/ld+json">
    {{ product | structured_data }}
  </script>"""
NEW = "  {%- render 'agentic-product-jsonld', product: product -%}"
Q = 'mutation($t:ID!,$f:[OnlineStoreThemeFilesUpsertFileInput!]!){ themeFilesUpsert(themeId:$t, files:$f){ upsertedThemeFiles{ filename } userErrors{ filename message } } }'

def live_file():
    d = gql('query($t:ID!){ theme(id:$t){ role files(filenames:["sections/main-product.liquid"]){ nodes{ body{ ... on OnlineStoreThemeFileBodyText{ content } } } } } }', {"t": MAIN})["theme"]
    assert d["role"] == "MAIN", d["role"]
    return d["files"]["nodes"][0]["body"]["content"]

cmd = sys.argv[1] if len(sys.argv) > 1 else ''
if cmd == 'send':
    cur = live_file()
    assert cur == open(BEFORE).read(), "live main-product.liquid changed since the backup; re-check before sending"
    files = [{"filename": "snippets/agentic-product-jsonld.liquid", "body": {"type": "TEXT", "value": open(os.path.join(HERE, 'agentic-product-jsonld.liquid')).read()}},
             {"filename": "sections/main-product.liquid", "body": {"type": "TEXT", "value": cur.replace(OLD, NEW)}}]
    print(json.dumps(gql(Q, {"t": MAIN, "f": files})))
elif cmd == 'rollback':
    print(json.dumps(gql(Q, {"t": MAIN, "f": [{"filename": "sections/main-product.liquid", "body": {"type": "TEXT", "value": open(BEFORE).read()}}]})))
else:
    print(__doc__)

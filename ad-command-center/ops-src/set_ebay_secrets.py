#!/usr/bin/env python3
"""Copy the eBay keys from ~/.ebay/creds.json into the bodyj4you-amazon-api repo's GitHub secrets
(for the Ops page's late-order alerts). Prints names only, never values."""
import json, os, subprocess
c = json.load(open(os.path.expanduser("~/.ebay/creds.json")))
for name, key in (("EBAY_APP_ID", "appId"), ("EBAY_DEV_ID", "devId"), ("EBAY_CERT_ID", "certId"), ("EBAY_TOKEN", "userToken")):
    subprocess.run(["gh", "secret", "set", name, "-R", "frolovdo/bodyj4you-amazon-api"], input=c[key].encode(), check=True)
    print("set", name)

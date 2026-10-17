"""Copy the Walmart and TikTok API keys from this Mac (keychain / .env) into the GitHub secrets
of frolovdo/bodyj4you-amazon-api, so the Ops page pull can read Walmart WFS and TikTok FBT.
Values are piped straight to `gh secret set`; only the secret names are printed."""
import os
import subprocess
import sys

REPO = "frolovdo/bodyj4you-amazon-api"


def put(name, value):
    if not value:
        print("MISSING", name)
        return
    subprocess.run(["gh", "secret", "set", name, "--repo", REPO], input=value.encode(), check=True,
                   stdout=subprocess.DEVNULL)
    print("set", name)


sys.path.insert(0, os.path.expanduser("~/wm-api"))
import wmapi  # noqa: E402
cid, sec = wmapi.creds()
put("WM_CLIENT_ID", cid)
put("WM_CLIENT_SECRET", sec)

sys.path.insert(0, os.path.expanduser("~/tt-api"))
import ttapi  # noqa: E402
ttapi.load_env()
for k in ("TT_APP_KEY", "TT_APP_SECRET", "TT_REFRESH_TOKEN"):
    put(k, ttapi.secret(k))
put("TT_SHOP_CIPHER", os.environ.get("TT_SHOP_CIPHER"))

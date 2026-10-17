# Copy the Ops page source (also the claude.ai artifact) into the Action Center site as /ops.
# The page switches itself to web mode (PIN login, /api/ops-api) when served from netlify.app.
# Then deploy: cd ~/bodyj4you/ad-command-center && npx netlify deploy --build --prod --message "..." < /dev/null
import os
here = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(here, "ops-briefing.html")
dst = os.path.join(os.path.dirname(here), "public", "ops", "index.html")
s = open(src).read()
s = s.replace("<meta name=viewport", "<meta name=robots content=noindex><meta name=viewport", 1)
open(dst, "w").write(s)
print("wrote", dst, len(s))

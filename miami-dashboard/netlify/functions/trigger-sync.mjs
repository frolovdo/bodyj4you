// Proxy: dashboard → this function → GitHub workflow_dispatch.
//
// The browser cannot POST to GitHub directly because the call needs a
// repo-scoped PAT. We hold that PAT here as a Netlify environment variable
// (GITHUB_TOKEN — set in Site settings → Environment variables) so it never
// ships in any JS bundle.
//
// Triggers the `sync-reorder.yml` workflow on branch `main`, which is the
// same workflow the cron tick runs every 30 minutes. Inside ~30 seconds the
// Action re-reads 00_IN_FBA, regenerates the Miami + China xlsx files, and
// uploads them to the OUT folders.

const REPO_OWNER = 'frolovdo';
const REPO_NAME = 'bodyj4you';
const WORKFLOW_FILE = 'sync-reorder.yml';
const REF = 'main';

export default async (req) => {
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405);
  }

  const token = Netlify.env.get('GITHUB_TOKEN');
  if (!token) {
    return json(
      {
        ok: false,
        error:
          'GITHUB_TOKEN is not set on this Netlify site. Add a fine-grained PAT with Actions: write under Site settings → Environment variables.',
      },
      500,
    );
  }

  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${WORKFLOW_FILE}/dispatches`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'content-type': 'application/json',
        'User-Agent': 'bodyj4you-dashboard',
      },
      body: JSON.stringify({ ref: REF }),
    });
  } catch (e) {
    return json({ ok: false, error: `Network error: ${e.message || e}` }, 502);
  }

  if (!res.ok) {
    const text = (await res.text()).slice(0, 400);
    return json({ ok: false, error: `GitHub returned ${res.status}: ${text}` }, 502);
  }

  return json({ ok: true, message: 'Workflow dispatched on main' }, 202);
};

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

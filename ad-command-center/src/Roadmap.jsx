import React from 'react';

// Roadmap: what we decided to build next and why, so nothing gets lost between sessions. Static on purpose: edit this file to
// change it. Decided 2026-10-19 after comparing the tool with AdLabs' feature list.
const STATUS = {
  built: ['Built', 'var(--good)'],
  next: ['Next', 'var(--accent)'],
  planned: ['Planned', 'var(--c2)'],
  placeholder: ['Placeholder: not started', 'var(--warn)'],
  later: ['Later', 'var(--mut)'],
  skip: ['Decided not to build', 'var(--mut)'],
};

const ITEMS = [
  { id: 'search-terms', status: 'built', title: 'Word-pattern waste (n-grams)', where: 'Search terms page',
    what: 'Cuts every search into word patterns and adds up clicks and spend per pattern, so waste hidden across many small searches can be judged and blocked as a negative phrase. Same bad-luck rule as the Keywords page.',
    todo: ['Merge the engine change (adsops/ac_ngrams.py, branch claude/searchterm-ngrams in bodyj4you-amazon-api) so the nightly model pushes it'] },
  { id: 'brand-leak', status: 'built', title: 'Brand leak check', where: 'Search terms page',
    what: 'Brand searches paid for by generic campaigns. Today it is small, and there is no product-ad brand campaign to catch them, so the page says to leave them running.' },
  { id: 'sp-brand', status: 'next', title: 'Product-ad brand campaign', where: 'Update campaigns',
    what: 'Found by the brand leak check: brand searches only have the banner to land on. A small exact-match product-ad campaign on our brand terms would make them cheap and let the generic campaigns block them.' },
  { id: 'second-family', status: 'next', title: 'Second family under management', where: 'Engine: /ads-discover then /ads-review',
    what: 'Only rosehip is managed. The discovery and weekly review flow is family-agnostic; onboarding a second family is where most of the remaining money is.' },
  { id: 'one-rulebook', status: 'planned', title: 'One rulebook', where: 'Engine weekly review',
    what: 'Waste and bid rules exist twice with different thresholds (ads/audit.py in the public repo, review.py in the engine). Make the weekly review the single source and retire the duplicates before they drift further.' },
  { id: 'harvest-routing', status: 'planned', title: 'Harvest routing rules', where: 'Keywords page',
    what: 'Rules that say which campaign a harvested search term goes to (by size, job, or keyword type), instead of picking a destination by hand each time.' },
  { id: 'keyword-ideas', status: 'built', title: 'Keyword ideas from Amazon', where: 'Keywords page, and engine discovery',
    what: 'Amazon’s ranked keyword recommendations for our ASINs, labelled against what we already run, buy through or block, with competitor brands marked. Add them as exact keywords from the Keywords page. In discovery, run ac_kwideas.py before spending Helium 10 calls.',
    todo: ['Merge the engine change (adsops/ac_kwideas.py, same branch claude/searchterm-ngrams) so the nightly model pushes it'] },
  { id: 'amc-recurring', status: 'planned', title: 'AMC queries on a schedule', where: 'Engine',
    what: 'The 19 saved rosehip AMC queries run by hand today. Run the useful ones weekly and push the results, starting with the audience sizing query below.' },
  { id: 'tags', status: 'later', title: 'Tags on campaigns, targets and terms', where: '-',
    what: 'Naming and families cover most of it today.' },
  { id: 'skip', status: 'skip', title: 'Flow-canvas automation and widget dashboards', where: '-',
    what: 'The scheduled jobs plus the approval queue already do the automation, and a dashboard builder is product work with little payoff for one account.' },
];


// AMC question bank (saved 2026-10-19). Runs through our own Ads API connection: the engine's AMC client (amc.py run "<sql>").
const AMC_Q = [
  { q: 'Did the deal bring new customers?', how: 'New-to-brand vs returning orders, rosehip only, on a deal day vs a normal day vs Prime Big Deal Days; ads and organic.',
    decides: 'Whether deals are for winning new buyers or for pulling reorders forward, and so how deep and how often to run them (the charter\u2019s deal rules).',
    have: 'Partly: q1_path_asin_week already counts new-to-brand purchases by week. Not split by deal day yet.' },
  { q: 'When do rosehip customers come back?', how: 'Most common reorder window after the first order, per size (1oz, 2oz, 4oz, 16oz refill, roller), and value per customer over 12 and 24 months vs the first order.',
    decides: 'The reorder window for the \u201cpast buyers due to reorder\u201d audience above (replaces our 45 to 365 day guess), the timing of follow-up emails, and how much a new customer is worth paying for.',
    have: 'No. q4_time_freq covers time from first ad to purchase, not time between purchases.' },
  { q: 'Which first order makes a loyal customer?', how: 'Repeat rate and 12-month value by the size of the first order.',
    decides: 'Which size to push in ads to win new customers, and the budget split between sizes. If 1oz first-timers rarely come back, the 1oz is a poor acquisition product even at a low cost per order.',
    have: 'No.' },
  { q: 'Are new customers as good as last year\u2019s?', how: '90-day revenue as a multiple of the first order, by the month of first purchase.',
    decides: 'Whether a big acquisition month (Prime Day, Q4) brings buyers who stick. Fix what happens after the first order before buying more new customers.',
    have: 'No.' },
];

function Pill({ s }) {
  const [label, color] = STATUS[s];
  return <span className="pill" style={{ borderColor: color, color }}> {label}</span>;
}

export default function Roadmap() {
  return (
    <>
      <p className="small mut">What we decided to build next and why. Edit <code>ad-command-center/src/Roadmap.jsx</code> to change it.</p>

      <h2 id="audiences">AMC audiences as bid boosts</h2>
      <div className="card" style={{ borderLeft: '4px solid var(--warn)' }}>
        <p style={{ marginTop: 0 }}><Pill s="placeholder" /> <b>Nothing is built for this yet.</b> This card is the reminder and the plan.</p>
        <p><b>What it is:</b> an audience built in Amazon Marketing Cloud, attached to a product-ad or banner campaign as a bid boost. When a shopper in the audience searches one of our terms, the bid goes up by the boost. It targets no one and excludes no one; it only pays more for people we already know.</p>
        <p><b>Why rosehip:</b> it gets used up and rebought, so the shoppers worth most are ones we already reached.</p>
        <div style={{ overflowX: 'auto' }}><table className="kw"><thead><tr><th>Audience</th><th>Boost on</th><th>Why</th></tr></thead><tbody>
          <tr><td><b>Past rosehip buyers due to reorder</b><div className="small mut">bought 45 to 365 days ago</div></td><td>Branded and core rosehip terms</td><td>Keep the repurchase from going to a competitor</td></tr>
          <tr><td><b>Viewed or added to cart, did not buy</b><div className="small mut">last 30 days</div></td><td>Core generic terms</td><td>Most likely to come back and buy</td></tr>
          <tr><td><b>Bought our other oils, never rosehip</b><div className="small mut">last 365 days</div></td><td>Rosehip terms</td><td>Cross-sell to people who already trust the brand</td></tr>
        </tbody></table></div>
        <p><b>Limits:</b> one audience per campaign; no exclusions; audiences need a minimum size (vendors cite about 2,000 shoppers, not confirmed by Amazon), so rosehip’s audiences may be too small; boosting past buyers can pay for sales we would have had anyway; the boost counts as one lever under the one-change-per-Monday rule.</p>
        <p><b>Already in place, not the same thing:</b> the banner campaign has a +30% boost for shoppers who clicked or added to cart (set in the console), and two Display campaigns target 30-day viewers and 60-day buyers. This plan adds AMC-built audiences to the product-ad campaigns.</p>
        <p style={{ marginBottom: 4 }}><b>Steps when we pick it up:</b></p>
        <ol className="small" style={{ marginTop: 0 }}>
          <li>Sizing query for each audience over 90 and 365 days, read-only, with the AMC client the engine already has (<code>amc.py run</code>).</li>
          <li>Confirm Amazon’s real minimum audience size in the console or the AMC docs.</li>
          <li>Create the largest audience that clears it, and attach it to one campaign at a 20 to 30% boost.</li>
          <li>Judge it with the hypothesis pulse over 14 days (the rest of the family is the control), and with AMC’s matched audience column on sponsored ads traffic.</li>
          <li>Keep, widen to more campaigns, or remove.</li>
        </ol>
        <p className="small mut">Sources: <a href="https://advertising.amazon.com/resources/whats-new/amc-audiences-for-sponsored-ads" target="_blank" rel="noreferrer">Amazon: AMC audiences for sponsored ads</a> · <a href="https://tinuiti.com/blog/amazon/amc-sponsored-ads/" target="_blank" rel="noreferrer">Tinuiti guide</a> · <a href="https://www.intentwise.com/blog/amazon-marketing-cloud/is-your-amc-audience-ready-for-bid-boosting/" target="_blank" rel="noreferrer">Intentwise on audience size</a></p>
      </div>

      <h2 id="amc-questions">AMC questions to ask</h2>
      <div className="card" style={{ borderLeft: '4px solid var(--warn)' }}>
        <p style={{ marginTop: 0 }}><Pill s="placeholder" /> <b>Saved ideas, none run yet.</b> Four questions another brand answered from AMC (from Mansour Norouzi’s Claude + AMC post, Oct 2026), turned into rosehip questions. Each one feeds a decision we already make. <b>Nothing new to set up:</b> they run through our own Ads API connection with the engine’s AMC client, the same way the 19 saved rosehip queries do. Ask Claude the question, it writes the SQL and runs it.</p>
        <div style={{ overflowX: 'auto' }}><table className="kw"><thead><tr><th>Question for rosehip</th><th>What the answer decides</th><th>What we have</th></tr></thead><tbody>
          {AMC_Q.map((q) => (<tr key={q.q}><td><b>{q.q}</b><div className="small mut">{q.how}</div></td><td className="small">{q.decides}</td><td className="small">{q.have}</td></tr>))}
        </tbody></table></div>
        <p className="small"><b>Their findings, as a hint of what to look for:</b> a Best Deal day nearly doubled orders but 2 of 3 buyers were returning customers, so for that product a deal was a reorder tool, not a new-customer tool. Customers reordered later than assumed (day 51 to 130 depending on the product). Coffee buyers who started on a 2-pack or bigger repeated about twice as often, and the best seller had the lowest repeat rate. December brought the most new customers and the weakest repeat.</p>
        <p className="small"><b>Limits:</b> AMC hides any result row with too few shoppers, so per-size splits for the small sizes may come back empty; new-to-brand looks back a fixed window, not forever; recent days keep filling in.</p>
      </div>

      <h2>Everything else we decided</h2>
      {ITEMS.map((it) => (
        <div key={it.id} className="card" id={it.id}>
          <p style={{ margin: 0 }}><b>{it.title}</b> <Pill s={it.status} /> {it.where !== '-' && <span className="small mut"> · {it.where}</span>}</p>
          <p className="small" style={{ marginBottom: it.todo ? 4 : 0 }}>{it.what}</p>
          {it.todo && <ul className="small" style={{ margin: 0 }}>{it.todo.map((t, i) => <li key={i}>{t}</li>)}</ul>}
        </div>
      ))}
    </>
  );
}

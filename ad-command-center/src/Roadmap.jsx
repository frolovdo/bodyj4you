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
  },
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
  },
  { id: 'amc-recurring', status: 'planned', title: 'AMC queries on a schedule', where: 'Engine',
    what: 'The 19 saved rosehip AMC queries run by hand today. Run the useful ones weekly and push the results, starting with the audience sizing query below.' },
  { id: 'tags', status: 'later', title: 'Tags on campaigns, targets and terms', where: '-',
    what: 'Naming and families cover most of it today.' },
  { id: 'skip', status: 'skip', title: 'Flow-canvas automation and widget dashboards', where: '-',
    what: 'The scheduled jobs plus the approval queue already do the automation, and a dashboard builder is product work with little payoff for one account.' },
];

function Pill({ s }) {
  const [label, color] = STATUS[s];
  return <span className="pill" style={{ borderColor: color, color }}> {label}</span>;
}

export default function Roadmap() {
  return (
    <>
      <h2 id="audiences">AMC audiences as bid boosts</h2>
      <div className="card" style={{ borderLeft: '4px solid var(--accent)' }}>
        <p style={{ marginTop: 0 }}><Pill s="next" /> <b>Sized 2026-10-19: all three audiences are big enough.</b> Nothing is attached to a campaign yet; the first one waits for the owner’s go.</p>
        <p><b>What it is:</b> an audience built in Amazon Marketing Cloud, attached to a product-ad or banner campaign as a bid boost. When a shopper in the audience searches one of our terms, the bid goes up by the boost. It targets no one and excludes no one; it only pays more for people we already know.</p>
        <p><b>Why rosehip:</b> it gets used up and rebought, so the shoppers worth most are ones we already reached.</p>
        <div style={{ overflowX: 'auto' }}><table className="kw"><thead><tr><th>Audience</th><th>Shoppers</th><th>Boost on</th><th>Why</th></tr></thead><tbody>
          <tr><td><b>Past rosehip buyers due to reorder</b><div className="small mut">last order 45 to 365 days ago</div></td><td><b>25,272</b><div className="small mut">45-90d 3,030 · 90-180d 7,389 · 180-365d 14,853</div></td><td>Branded and core rosehip terms</td><td>Keep the repurchase from going to a competitor</td></tr>
          <tr><td><b>Clicked a rosehip ad, did not buy</b><div className="small mut">last 30 days</div></td><td><b>4,910</b><div className="small mut">of 6,649 clickers</div></td><td>Core generic terms</td><td>Most likely to come back and buy</td></tr>
          <tr><td><b>Bought our other oils, never rosehip</b><div className="small mut">last 365 days</div></td><td><b>91,690</b></td><td>Rosehip terms</td><td>Cross-sell to people who already trust the brand</td></tr>
        </tbody></table></div>
        <p><b>Limits:</b> one audience per campaign; no exclusions; audiences need a minimum size (vendors cite about 2,000 shoppers, not confirmed by Amazon), so rosehip’s audiences may be too small; boosting past buyers can pay for sales we would have had anyway; the boost counts as one lever under the one-change-per-Monday rule.</p>
        <p><b>Already in place, not the same thing:</b> the banner campaign has a +30% boost for shoppers who clicked or added to cart (set in the console), and two Display campaigns target 30-day viewers and 60-day buyers. This plan adds AMC-built audiences to the product-ad campaigns.</p>
        <p style={{ marginBottom: 4 }}><b>Steps when we pick it up:</b></p>
        <ol className="small" style={{ marginTop: 0 }}>
          <li><s>Sizing query for each audience</s> Done 2026-10-19 (table above).</li>
          <li><s>Confirm Amazon’s real minimum audience size</s> Amazon publishes none; the only bid-boost figure found is 2,000 shoppers (Intentwise). All three clear it.</li>
          <li>Create the largest audience that clears it, and attach it to one campaign at a 20 to 30% boost.</li>
          <li>Judge it with the hypothesis pulse over 14 days (the rest of the family is the control), and with AMC’s matched audience column on sponsored ads traffic.</li>
          <li>Keep, widen to more campaigns, or remove.</li>
        </ol>
        <p className="small mut">Sources: <a href="https://advertising.amazon.com/resources/whats-new/amc-audiences-for-sponsored-ads" target="_blank" rel="noreferrer">Amazon: AMC audiences for sponsored ads</a> · <a href="https://tinuiti.com/blog/amazon/amc-sponsored-ads/" target="_blank" rel="noreferrer">Tinuiti guide</a> · <a href="https://www.intentwise.com/blog/amazon-marketing-cloud/is-your-amc-audience-ready-for-bid-boosting/" target="_blank" rel="noreferrer">Intentwise on audience size</a></p>
      </div>

      <p className="small mut">Shopper counts: AMC, read-only, queries in <code>sp-api/intel/AMC/rosehip/audiences/</code>. They count only shoppers who saw one of our ads (the all-purchases table is a paid AMC add-on we do not have), so real audiences are larger. “Viewed or added to cart” could not be counted, because AMC records views and carts for us only next to an order; “clicked, did not buy” replaces it.</p>

      <h2>Roadmap: everything else we decided</h2>
      <p className="small mut">What we decided to build next and why. Edit <code>ad-command-center/src/Roadmap.jsx</code> to change it.</p>
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

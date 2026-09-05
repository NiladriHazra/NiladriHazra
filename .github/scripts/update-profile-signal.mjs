import fs from 'node:fs/promises';

const username = process.env.GITHUB_USERNAME || 'NiladriHazra';
const headers = { Accept: 'application/vnd.github+json', 'User-Agent': `${username}-profile` };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
async function github(path) {
  const response = await fetch(`https://api.github.com${path}`, { headers });
  if (!response.ok) throw new Error(`GitHub ${response.status}: ${path}`);
  return response.json();
}
const e = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const n = value => new Intl.NumberFormat('en-US').format(value);
const repos = [];
for (let page = 1; ; page++) {
  const batch = await github(`/users/${username}/repos?type=owner&per_page=100&page=${page}`);
  repos.push(...batch);
  if (batch.length < 100) break;
}
const [user, prSearch, portrait] = await Promise.all([
  github(`/users/${username}`),
  github(`/search/issues?q=${encodeURIComponent(`author:${username} type:pr is:public`)}&per_page=1`),
  fs.readFile(new URL('../../assets/portrait-ascii.json', import.meta.url), 'utf8').then(JSON.parse),
]);
const owned = repos.filter(repo => !repo.fork);
const stars = owned.reduce((sum, repo) => sum + repo.stargazers_count, 0);
const forks = owned.reduce((sum, repo) => sum + repo.forks_count, 0);
const rows = [
  ['Role', 'Full-stack & mobile engineer'],
  ['Location', 'Kolkata, India'],
  ['Focus', 'Products, systems, AI agents'],
  null,
  ['Languages', 'TypeScript, JavaScript, SQL'],
  ['Frontend', 'React, Vite, TanStack, Tailwind'],
  ['Mobile', 'React Native, Expo'],
  ['Backend', 'Bun, Postgres, Drizzle'],
  ['Auth / Jobs', 'Better Auth, Trigger.dev'],
  ['AI', 'Vercel AI SDK, OpenAI, Claude'],
  null,
  ['Building', 'Fast web & mobile experiences'],
  ['Exploring', 'AI-agent workflows'],
  ['Values', 'Strict types, small APIs'],
  null,
  'Contact',
  ['Website', 'niladri.in'],
  ['X / Twitter', `@${user.twitter_username || 'byteHumi'}`],
  ['GitHub', username],
  null,
  'GitHub Stats',
  ['Public repos', `${n(user.public_repos)}  |  Followers: ${n(user.followers)}`],
  ['Owned stars', `${n(stars)}  |  Forks: ${n(forks)}`],
  ['Public PRs', n(prSearch.total_count)],
];
function render(mobile = false) {
  const width = mobile ? 640 : 1120;
  const height = mobile ? 1150 : 610;
  const left = mobile ? 38 : 454;
  const top = mobile ? 594 : 62;
  const right = width - 30;
  const text = (x,y,value,fill='#c9d1d9',size=16,extra='') => `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" ${extra}>${e(value)}</text>`;
  const portraitX = mobile ? 117 : 28;
  const portraitY = mobile ? 54 : 46;
  let art = '';
  portrait.forEach((row,y) => row.forEach((pixel,x) => {
    if (pixel.c !== ' ') art += text(portraitX+x*7.5,portraitY+y*13.2,pixel.c,pixel.color,13);
  }));
  let info = text(left,top,`${username.toLowerCase()}@github`, '#c9d1d9',17,'font-weight="700"');
  info += `<path d="M${left} ${top+12} H${right}" stroke="#68717c"/>`;
  rows.forEach((row,i) => {
    const y = top+38+i*21;
    if (!row) return;
    if (typeof row === 'string') {
      info += text(left,y,`— ${row}`);
      info += `<path d="M${left+row.length*9.7+30} ${y-5} H${right}" stroke="#68717c"/>`;
    } else {
      info += text(left,y,row[0]+':','#ffad66');
      info += text(left+140,y,'·'.repeat(Math.max(1,Math.floor((right-left-140-row[1].length*9.6)/9.6))),'#525c69');
      info += text(right,y,row[1],'#a6cceb',16,'text-anchor="end"');
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
<title id="title">Niladri Hazra — developer terminal</title>
<desc id="desc">ASCII portrait of Niladri Hazra. Full-stack and mobile engineer in Kolkata, India. TypeScript, React, React Native, Bun, Postgres, and AI-agent workflows. ${n(user.public_repos)} public repositories, ${n(user.followers)} followers, ${n(stars)} stars on owned public repositories, ${n(prSearch.total_count)} public pull requests.</desc>
<rect width="100%" height="100%" rx="16" fill="#16191f"/>
<g font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace">${art}${info}</g>
</svg>\n`;
}
await Promise.all([
  fs.writeFile(new URL('../../assets/profile-signal.svg', import.meta.url),render()),
  fs.writeFile(new URL('../../assets/profile-signal-mobile.svg', import.meta.url),render(true)),
]);
console.log(`Rendered desktop and mobile profile cards: ${user.public_repos} repos, ${stars} stars, ${prSearch.total_count} PRs.`);

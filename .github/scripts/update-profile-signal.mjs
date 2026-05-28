import fs from "node:fs";

const username = process.env.GITHUB_USERNAME || "NiladriHazra";
const token = process.env.GITHUB_TOKEN;

const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": `${username}-profile-readme`,
};

if (token) headers.Authorization = `Bearer ${token}`;

async function github(path) {
  const response = await fetch(`https://api.github.com${path}`, { headers });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${path}`);
  }

  return response.json();
}

async function githubPaged(path, limit = 300) {
  const pages = [];
  let page = 1;

  while (pages.length < limit) {
    const separator = path.includes("?") ? "&" : "?";
    const batch = await github(`${path}${separator}per_page=100&page=${page}`);
    if (!Array.isArray(batch) || batch.length === 0) break;
    pages.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }

  return pages.slice(0, limit);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function compactNumber(value) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function replaceBlock(readme, name, content) {
  const start = `<!-- ${name}:start -->`;
  const end = `<!-- ${name}:end -->`;
  const pattern = new RegExp(`${start}[\\s\\S]*?${end}`);

  if (!pattern.test(readme)) {
    throw new Error(`Missing README block: ${name}`);
  }

  return readme.replace(pattern, `${start}\n${content.trim()}\n${end}`);
}

async function topRepos() {
  const repos = await githubPaged(`/users/${username}/repos?type=owner&sort=updated`);

  return repos
    .filter((repo) => !repo.fork && !repo.archived && repo.name !== username)
    .sort((a, b) => {
      if (b.stargazers_count !== a.stargazers_count) {
        return b.stargazers_count - a.stargazers_count;
      }
      if (b.forks_count !== a.forks_count) return b.forks_count - a.forks_count;
      return new Date(b.updated_at) - new Date(a.updated_at);
    });
}

async function pullRequestCount() {
  const query = encodeURIComponent(`author:${username} type:pr`);
  const result = await github(`/search/issues?q=${query}&per_page=1`);
  return result.total_count || 0;
}

function metricCard({ x, y, label, value, width = 148 }) {
  return `
    <rect x="${x}" y="${y}" width="${width}" height="74" rx="6" fill="#161b22" stroke="#30363d"/>
    <text x="${x + 18}" y="${y + 28}" fill="#8b949e" font-size="13">${escapeHtml(label)}</text>
    <text x="${x + 18}" y="${y + 56}" fill="#f0f6fc" font-size="25" font-weight="700">${escapeHtml(value)}</text>
  `;
}

function repoRow(repo, index) {
  const y = 128 + index * 43;
  const rowFill = index % 2 === 0 ? "#161b22" : "#0d1117";
  const language = repo.language || "Mixed";

  return `
    <rect x="458" y="${y}" width="470" height="42" rx="6" fill="${rowFill}" stroke="#30363d"/>
    <text x="478" y="${y + 26}" fill="#f0f6fc" font-size="15" font-weight="650">${escapeHtml(repo.name)}</text>
    <text x="690" y="${y + 26}" text-anchor="end" fill="#f0f6fc" font-size="15" font-weight="700">${formatNumber(repo.stargazers_count)}</text>
    <text x="770" y="${y + 26}" text-anchor="end" fill="#c9d1d9" font-size="15" font-weight="650">${formatNumber(repo.forks_count)}</text>
    <text x="820" y="${y + 26}" fill="#8b949e" font-size="14">${escapeHtml(language)}</text>
  `;
}

function renderSignalSvg(repos, prs) {
  const totalStars = repos.reduce((sum, repo) => sum + repo.stargazers_count, 0);
  const totalForks = repos.reduce((sum, repo) => sum + repo.forks_count, 0);
  const topRepo = repos[0];
  const topFour = repos.slice(0, 4);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="980" height="340" viewBox="0 0 980 340" role="img" aria-labelledby="title desc">
  <title id="title">${username} GitHub signal</title>
  <desc id="desc">Public GitHub stats and top repositories generated from the GitHub API.</desc>
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; }
  </style>

  <rect width="980" height="340" rx="8" fill="#0d1117"/>
  <rect x="1" y="1" width="978" height="338" rx="8" fill="none" stroke="#30363d"/>
  <rect x="26" y="27" width="928" height="286" rx="8" fill="#0d1117" stroke="#30363d"/>
  <rect x="52" y="106" width="316" height="1" fill="#30363d"/>

  <text x="52" y="70" fill="#f0f6fc" font-size="24" font-weight="750">Overview</text>
  <text x="52" y="96" fill="#8b949e" font-size="13">public repos, stars, forks, and PRs</text>

  ${metricCard({ x: 52, y: 126, label: "public stars", value: compactNumber(totalStars) })}
  ${metricCard({ x: 216, y: 126, label: "public PRs", value: formatNumber(prs) })}
  ${metricCard({ x: 52, y: 214, label: "own repos", value: formatNumber(repos.length) })}
  ${metricCard({ x: 216, y: 214, label: "total forks", value: formatNumber(totalForks) })}

  <text x="52" y="304" fill="#8b949e" font-size="13">top repo</text>
  <text x="114" y="304" fill="#f0f6fc" font-size="14" font-weight="700">${escapeHtml(topRepo.name)}</text>
  <text x="928" y="96" text-anchor="end" fill="#8b949e" font-size="13">stars / forks / stack</text>
  <text x="458" y="112" fill="#f0f6fc" font-size="19" font-weight="750">Repos with traction</text>
  <text x="690" y="112" text-anchor="end" fill="#8b949e" font-size="12">stars</text>
  <text x="770" y="112" text-anchor="end" fill="#8b949e" font-size="12">forks</text>
  <text x="820" y="112" fill="#8b949e" font-size="12">stack</text>

  ${topFour.map(repoRow).join("\n")}
</svg>
`;
}

function renderSignalMobileSvg(repos, prs) {
  const totalStars = repos.reduce((sum, repo) => sum + repo.stargazers_count, 0);
  const totalForks = repos.reduce((sum, repo) => sum + repo.forks_count, 0);
  const topRepo = repos[0];
  const topFour = repos.slice(0, 4);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="660" viewBox="0 0 640 660" role="img" aria-labelledby="title desc">
  <title id="title">${username} GitHub signal mobile</title>
  <desc id="desc">Public GitHub stats and top repositories generated from the GitHub API.</desc>
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; }
  </style>

  <rect width="640" height="660" rx="8" fill="#0d1117"/>
  <rect x="1" y="1" width="638" height="658" rx="8" fill="none" stroke="#30363d"/>
  <rect x="28" y="30" width="584" height="600" rx="8" fill="#0d1117" stroke="#30363d"/>

  <text x="52" y="74" fill="#f0f6fc" font-size="26" font-weight="750">Overview</text>
  <text x="52" y="102" fill="#8b949e" font-size="14">public repos, stars, forks, and PRs</text>
  <rect x="52" y="118" width="536" height="1" fill="#30363d"/>

  ${metricCard({ x: 52, y: 146, label: "public stars", value: compactNumber(totalStars), width: 250 })}
  ${metricCard({ x: 338, y: 146, label: "public PRs", value: formatNumber(prs), width: 250 })}
  ${metricCard({ x: 52, y: 234, label: "own repos", value: formatNumber(repos.length), width: 250 })}
  ${metricCard({ x: 338, y: 234, label: "total forks", value: formatNumber(totalForks), width: 250 })}

  <text x="52" y="344" fill="#8b949e" font-size="14">top repo</text>
  <text x="124" y="344" fill="#f0f6fc" font-size="15" font-weight="700">${escapeHtml(topRepo.name)}</text>

  <text x="52" y="394" fill="#f0f6fc" font-size="21" font-weight="750">Repos with traction</text>
  <text x="400" y="394" text-anchor="end" fill="#8b949e" font-size="12">stars</text>
  <text x="474" y="394" text-anchor="end" fill="#8b949e" font-size="12">forks</text>
  <text x="520" y="394" fill="#8b949e" font-size="12">stack</text>

  ${topFour.map((repo, index) => {
    const y = 412 + index * 48;
    const rowFill = index % 2 === 0 ? "#161b22" : "#0d1117";
    return `
  <rect x="52" y="${y}" width="536" height="44" rx="6" fill="${rowFill}" stroke="#30363d"/>
  <text x="72" y="${y + 28}" fill="#f0f6fc" font-size="15" font-weight="650">${escapeHtml(repo.name)}</text>
  <text x="400" y="${y + 28}" text-anchor="end" fill="#f0f6fc" font-size="15" font-weight="700">${formatNumber(repo.stargazers_count)}</text>
  <text x="474" y="${y + 28}" text-anchor="end" fill="#c9d1d9" font-size="15" font-weight="650">${formatNumber(repo.forks_count)}</text>
  <text x="520" y="${y + 28}" fill="#8b949e" font-size="14">${escapeHtml(repo.language || "Mixed")}</text>`;
  }).join("\n")}
</svg>
`;
}

function renderReadmeSignal() {
  return `<picture>
  <source media="(max-width: 700px)" srcset="./assets/profile-signal-mobile.svg" />
  <img src="./assets/profile-signal.svg" alt="GitHub signal: public stars, pull requests, forks, and top repositories" width="100%" />
</picture>`;
}

const [repos, prs] = await Promise.all([topRepos(), pullRequestCount()]);

const readmePath = new URL("../../README.md", import.meta.url);
const svgPath = new URL("../../assets/profile-signal.svg", import.meta.url);
const mobileSvgPath = new URL("../../assets/profile-signal-mobile.svg", import.meta.url);
let readme = await fs.promises.readFile(readmePath, "utf8");

readme = replaceBlock(readme, "signal", renderReadmeSignal());

await fs.promises.mkdir(new URL("../../assets/", import.meta.url), { recursive: true });
await fs.promises.writeFile(svgPath, renderSignalSvg(repos, prs));
await fs.promises.writeFile(mobileSvgPath, renderSignalMobileSvg(repos, prs));
await fs.promises.writeFile(readmePath, readme);

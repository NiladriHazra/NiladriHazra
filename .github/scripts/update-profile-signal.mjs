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

function renderMetric(label, valueHtml) {
  return [
    "      <tr>",
    `        <td><sub>${escapeHtml(label)}</sub></td>`,
    `        <td align="right"><strong>${valueHtml}</strong></td>`,
    "      </tr>",
  ].join("\n");
}

function renderRepos(repos) {
  return [
    '    <table width="100%">',
    "      <tr>",
    "        <th align=\"left\">repo</th>",
    "        <th align=\"right\">stars</th>",
    "        <th align=\"right\">forks</th>",
    "        <th align=\"left\">stack</th>",
    "      </tr>",
    ...repos.slice(0, 4).flatMap((repo) => [
      "      <tr>",
      `        <td><a href="${repo.html_url}">${escapeHtml(repo.name)}</a></td>`,
      `        <td align="right"><strong>${formatNumber(repo.stargazers_count)}</strong></td>`,
      `        <td align="right">${formatNumber(repo.forks_count)}</td>`,
      `        <td>${escapeHtml(repo.language || "Mixed")}</td>`,
      "      </tr>",
    ]),
    "    </table>",
  ].join("\n");
}

function renderSignal(repos, prs) {
  const totalStars = repos.reduce((sum, repo) => sum + repo.stargazers_count, 0);
  const totalForks = repos.reduce((sum, repo) => sum + repo.forks_count, 0);
  const topRepo = repos[0];

  return [
    '<table width="100%">',
    "  <tr>",
    '    <td width="38%" valign="top">',
    "      <h4>Signal</h4>",
    '      <table width="100%">',
    renderMetric("public stars", formatNumber(totalStars)),
    renderMetric("own repos", formatNumber(repos.length)),
    renderMetric("public PRs", formatNumber(prs)),
    renderMetric("total forks", formatNumber(totalForks)),
    renderMetric(
      "top repo",
      `<a href="${topRepo.html_url}">${escapeHtml(topRepo.name)}</a>`,
    ),
    "      </table>",
    "    </td>",
    '    <td width="62%" valign="top">',
    "      <h4>Repos with traction</h4>",
    renderRepos(repos),
    "    </td>",
    "  </tr>",
    "</table>",
  ].join("\n");
}

const [repos, prs] = await Promise.all([topRepos(), pullRequestCount()]);

const readmePath = new URL("../../README.md", import.meta.url);
let readme = await fs.promises.readFile(readmePath, "utf8");

readme = replaceBlock(readme, "signal", renderSignal(repos, prs));

await fs.promises.writeFile(readmePath, readme);

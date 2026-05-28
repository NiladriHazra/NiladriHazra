import fs from "node:fs";

const username = process.env.GITHUB_USERNAME || "NiladriHazra";
const token = process.env.GITHUB_TOKEN;

const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": `${username}-profile-readme`,
};

if (token) headers.Authorization = `Bearer ${token}`;

async function github(path, extraHeaders = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: { ...headers, ...extraHeaders },
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${path}`);
  }

  return response.json();
}

async function githubPaged(path, limit = 100) {
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

function firstLine(value) {
  return String(value || "")
    .split("\n")[0]
    .trim();
}

function escapeTable(value) {
  return String(value || "")
    .replaceAll("|", "\\|")
    .replace(/\s+/g, " ")
    .trim();
}

function repoBadge(repo, metric, label, color) {
  return `![${label}](https://img.shields.io/github/${metric}/${repo}?style=flat&label=${label}&color=${color})`;
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
  const repos = await githubPaged(`/users/${username}/repos?type=owner&sort=updated`, 300);

  return repos
    .filter((repo) => !repo.fork && !repo.archived && repo.name !== username)
    .sort((a, b) => {
      if (b.stargazers_count !== a.stargazers_count) {
        return b.stargazers_count - a.stargazers_count;
      }
      if (b.forks_count !== a.forks_count) return b.forks_count - a.forks_count;
      return new Date(b.updated_at) - new Date(a.updated_at);
    })
    .slice(0, 4);
}

async function recentPullRequests() {
  const query = encodeURIComponent(`author:${username} type:pr`);
  const result = await github(`/search/issues?q=${query}&sort=updated&order=desc&per_page=3`);
  return result.items || [];
}

async function recentCommits() {
  const query = encodeURIComponent(`author:${username}`);
  const result = await github(
    `/search/commits?q=${query}&sort=author-date&order=desc&per_page=12`,
    { Accept: "application/vnd.github.cloak-preview+json" },
  );

  return (result.items || [])
    .filter((item) => item.repository?.full_name !== `${username}/${username}`)
    .slice(0, 3);
}

function renderRepos(repos) {
  const lines = [
    "| repo | signal | stack |",
    "| --- | --- | --- |",
    ...repos.map((repo) => {
      const fullName = `${repo.owner.login}/${repo.name}`;
      const signal = [
        repoBadge(fullName, "stars", "stars", "f0b75e"),
        repoBadge(fullName, "forks", "forks", "8ea3b0"),
      ].join(" ");
      return `| [${escapeTable(repo.name)}](${repo.html_url}) | ${signal} | ${escapeTable(repo.language || "Mixed")} |`;
    }),
  ];

  return lines.join("\n");
}

function renderActivity(prs, commits) {
  const prLines = prs.map((pr) => {
    const repo = pr.repository_url.replace("https://api.github.com/repos/", "");
    return `- PR: [${firstLine(pr.title)}](${pr.html_url}) in \`${repo}\``;
  });

  const commitLines = commits.map((commit) => {
    return `- Commit: [${firstLine(commit.commit.message)}](${commit.html_url}) in \`${commit.repository.full_name}\``;
  });

  return [...prLines, ...commitLines].join("\n");
}

const [repos, prs, commits] = await Promise.all([
  topRepos(),
  recentPullRequests(),
  recentCommits(),
]);

const readmePath = new URL("../../README.md", import.meta.url);
let readme = await fs.promises.readFile(readmePath, "utf8");

readme = replaceBlock(readme, "repos", renderRepos(repos));
readme = replaceBlock(readme, "activity", renderActivity(prs, commits));

await fs.promises.writeFile(readmePath, readme);

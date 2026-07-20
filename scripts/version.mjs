#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const stableVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function discoverPackageFiles() {
  const rootManifest = JSON.parse(
    readFileSync(resolve(repoRoot, "package.json"), "utf8"),
  );
  const workspaceFiles = rootManifest.workspaces.flatMap((workspace) => {
    if (workspace.endsWith("/*")) {
      const workspaceRoot = workspace.slice(0, -2);
      return readdirSync(resolve(repoRoot, workspaceRoot), {
        withFileTypes: true,
      })
        .filter(
          (entry) =>
            entry.isDirectory() &&
            existsSync(
              resolve(repoRoot, workspaceRoot, entry.name, "package.json"),
            ),
        )
        .map((entry) => `${workspaceRoot}/${entry.name}/package.json`);
    }
    return existsSync(resolve(repoRoot, workspace, "package.json"))
      ? [`${workspace}/package.json`]
      : [];
  });
  return ["package.json", ...workspaceFiles.sort()];
}

const packageFiles = discoverPackageFiles();
const chartFiles = [
  "deploy/helm/operator/Chart.yaml",
  "deploy/helm/participant/Chart.yaml",
];
const firstPartyValuesFiles = [
  "deploy/helm/operator/values.yaml",
  "deploy/helm/participant/values.yaml",
];
const firstPartyRepositories = [
  "ghcr.io/connected-intelligent-systems/tx-bootstrap-operator-console",
  "ghcr.io/connected-intelligent-systems/tx-bootstrap-operator-onboarding-service",
  "ghcr.io/connected-intelligent-systems/tx-bootstrap-participant-init",
  "ghcr.io/connected-intelligent-systems/tx-bootstrap-participant-portal-backend",
  "ghcr.io/connected-intelligent-systems/tx-bootstrap-federated-catalog",
];

function path(relativePath) {
  return resolve(repoRoot, relativePath);
}

function read(relativePath) {
  return readFileSync(path(relativePath), "utf8");
}

function write(relativePath, contents) {
  writeFileSync(path(relativePath), contents);
}

function parseStableVersion(value, source) {
  const version = value.trim();
  if (!stableVersionPattern.test(version)) {
    throw new Error(
      `${source} must contain a stable semantic version (x.y.z), found: ${version}`,
    );
  }
  return version;
}

function updatePackageJson(contents, version) {
  const manifest = JSON.parse(contents);
  manifest.version = version;
  for (const dependencyType of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
  ]) {
    for (const name of Object.keys(manifest[dependencyType] ?? {})) {
      if (name.startsWith("@tx-bootstrap/")) {
        manifest[dependencyType][name] = version;
      }
    }
  }
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function updatePackageLock(contents, version) {
  const lock = JSON.parse(contents);
  lock.version = version;
  for (const [workspacePath, manifest] of Object.entries(lock.packages ?? {})) {
    if (
      workspacePath === "" ||
      packageFiles.includes(`${workspacePath}/package.json`)
    ) {
      manifest.version = version;
    }
    for (const dependencyType of [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
    ]) {
      for (const name of Object.keys(manifest[dependencyType] ?? {})) {
        if (name.startsWith("@tx-bootstrap/")) {
          manifest[dependencyType][name] = version;
        }
      }
    }
  }
  return `${JSON.stringify(lock, null, 2)}\n`;
}

function updatePythonProject(contents, version) {
  const updated = contents.replace(
    /(\[project\][\s\S]*?\nversion\s*=\s*)"[^"]+"/,
    `$1"${version}"`,
  );
  if (updated === contents && !contents.includes(`version = "${version}"`)) {
    throw new Error(
      "Could not locate [project].version in apps/federated-catalog/pyproject.toml",
    );
  }
  return updated;
}

function updatePythonLock(contents, version) {
  const updated = contents.replace(
    /(\[\[package\]\]\nname = "tx-bootstrap-federated-catalog"\nversion = )"[^"]+"/,
    `$1"${version}"`,
  );
  if (
    updated === contents &&
    !contents.includes(
      `name = "tx-bootstrap-federated-catalog"\nversion = "${version}"`,
    )
  ) {
    throw new Error(
      "Could not locate the federated catalog package in uv.lock",
    );
  }
  return updated;
}

function updateChart(contents, version, chartFile) {
  let updated = contents.replace(/^version:\s*.*$/m, `version: ${version}`);
  updated = updated.replace(/^appVersion:\s*.*$/m, `appVersion: "${version}"`);
  if (
    !updated.includes(`version: ${version}`) ||
    !updated.includes(`appVersion: "${version}"`)
  ) {
    throw new Error(`Could not update chart metadata in ${chartFile}`);
  }
  return updated;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function updateFirstPartyImageDefaults(contents) {
  let updated = contents;
  for (const repository of firstPartyRepositories) {
    const imagePattern = new RegExp(
      `(repository:\\s*${escapeRegExp(repository)}\\s*\\n\\s*tag:)\\s*[^\\n]+`,
    );
    if (imagePattern.test(updated)) {
      updated = updated.replace(imagePattern, '$1 ""');
    }
  }
  return updated;
}

function expectedFiles(version) {
  const files = new Map();
  files.set("VERSION", `${version}\n`);
  for (const packageFile of packageFiles) {
    files.set(packageFile, updatePackageJson(read(packageFile), version));
  }
  files.set(
    "package-lock.json",
    updatePackageLock(read("package-lock.json"), version),
  );
  files.set(
    "apps/federated-catalog/pyproject.toml",
    updatePythonProject(read("apps/federated-catalog/pyproject.toml"), version),
  );
  files.set(
    "apps/federated-catalog/uv.lock",
    updatePythonLock(read("apps/federated-catalog/uv.lock"), version),
  );
  for (const chartFile of chartFiles) {
    files.set(chartFile, updateChart(read(chartFile), version, chartFile));
  }
  for (const valuesFile of firstPartyValuesFiles) {
    files.set(valuesFile, updateFirstPartyImageDefaults(read(valuesFile)));
  }
  return files;
}

function check(version, tag) {
  const mismatches = [];
  for (const [relativePath, expected] of expectedFiles(version)) {
    if (read(relativePath) !== expected) {
      mismatches.push(relativePath);
    }
  }

  if (tag !== undefined) {
    const tagVersion = tag.startsWith("v") ? tag.slice(1) : tag;
    if (tagVersion !== version) {
      mismatches.push(`release tag ${tag} (expected v${version})`);
    }
  }

  if (mismatches.length > 0) {
    throw new Error(
      `Version ${version} is not synchronized:\n${mismatches.map((item) => `- ${item}`).join("\n")}\nRun: npm run version:set -- ${version}`,
    );
  }
  process.stdout.write(`Version ${version} is synchronized.\n`);
}

function setVersion(version) {
  for (const [relativePath, contents] of expectedFiles(version)) {
    write(relativePath, contents);
  }
  process.stdout.write(`Set tx-bootstrap version to ${version}.\n`);
}

function argumentValue(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  if (index === args.length - 1) throw new Error(`${name} requires a value`);
  return args[index + 1];
}

const [command, ...args] = process.argv.slice(2);

try {
  if (command === "set") {
    const version = parseStableVersion(args[0] ?? "", "version argument");
    setVersion(version);
  } else if (command === "check") {
    const version = parseStableVersion(read("VERSION"), "VERSION");
    check(version, argumentValue(args, "--tag"));
  } else if (command === "print") {
    const version = parseStableVersion(read("VERSION"), "VERSION");
    const developmentSha = argumentValue(args, "--dev-sha");
    process.stdout.write(
      developmentSha
        ? `${version}-dev.sha.${developmentSha}\n`
        : `${version}\n`,
    );
  } else {
    throw new Error(
      "Usage: version.mjs <set x.y.z | check [--tag vX.Y.Z] | print [--dev-sha SHA]>",
    );
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}

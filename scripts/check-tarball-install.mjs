import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// v0.7.0-beta.3 release-fix：靜默 Windows 下 npm spawn 的 DEP0190 DeprecationWarning
// （execFileSync('npm.cmd', args, { shell: true }) 在 Node 22+ 是必要的，但會觸發
// shell:true 的安全警告。本指令碼呼叫的 npm 引數完全固定、無使用者輸入，零風險）。
const originalEmit = process.emit;
process.emit = function patchedEmit(event, ...args) {
  if (event === "warning" && args[0] && typeof args[0].name === "string" && args[0].name === "DeprecationWarning" && /DEP0190/.test(String(args[0].message || ""))) {
    return false;
  }
  return originalEmit.apply(this, [event, ...args]);
};

// 跨平臺 npm 呼叫：
//   - Windows 下 execFileSync 不解析 PATHEXT，直接調 'npm' 會 ENOENT。
//   - Node 22+ 拒絕直接 spawn .cmd / .bat（EINVAL），必須用 shell:true。
//   - 用 shell:true 會觸發 DEP0190 DeprecationWarning 但這是 Node 自身的限制，
//     命令引數固定（無使用者輸入）拼接風險為零。
const NPM_CMD = process.platform === "win32" ? "npm.cmd" : "npm";
const NPM_OPTS = process.platform === "win32" ? { shell: true } : {};

const root = join(import.meta.dirname, "..");
const expected = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const temp = mkdtempSync(join(tmpdir(), "dsh-project-brain-install-"));
const installRoot = join(temp, "consumer");

try {
  console.log("=== dsh-project-brain clean tarball install ===");
  const filename = execFileSync(NPM_CMD, ["pack", "--pack-destination", temp], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    ...NPM_OPTS,
  }).trim().split(/\r?\n/).pop();
  const tarball = join(temp, filename);
  if (!existsSync(tarball)) throw new Error("npm pack did not create " + tarball);

  execFileSync(NPM_CMD, [
    "install",
    "--prefix", installRoot,
    "--ignore-scripts",
    "--omit=dev",
    tarball,
  ], { cwd: temp, stdio: "inherit", ...NPM_OPTS });

  const installedRoot = join(installRoot, "node_modules", expected.name);
  const installed = JSON.parse(readFileSync(join(installedRoot, "package.json"), "utf8"));
  const required = [
    installed.main,
    installed.exports && installed.exports["./client"] && installed.exports["./client"].default,
    "cordis.patch.yml",
  ].filter(Boolean);
  if (installed.version !== expected.version) throw new Error(`version mismatch: ${installed.version} != ${expected.version}`);
  for (const file of required) {
    if (!existsSync(join(installedRoot, file))) throw new Error("installed package missing " + file);
  }
  console.log(`CLEAN_TARBALL_INSTALL_PASS (${expected.name}@${expected.version})`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}

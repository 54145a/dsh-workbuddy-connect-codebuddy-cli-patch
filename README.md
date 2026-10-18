# @54145a/dsh-workbuddy-connect —— 补丁分支（支持 CodeBuddy CLI 登录态）

[English](./README.en.md) | 中文

本仓库是 [dsh-workbuddy-connect](https://github.com/corrinehu/dsh-workbuddy-connect)（上游）的**补丁分支**，以 `@54145a/dsh-workbuddy-connect` 为名发布到 npm，基线为上游 **v0.7.8**。

上游只从 **WorkBuddy / WorkBuddy AI 桌面 App** 读取登录态。本补丁在此之上追加一个来源：**CodeBuddy CLI 的登录态**。以前必须装桌面 App 才能用 → 现在只装了 CodeBuddy CLI 并登录也能用。

> 上游文档（安装、版本兼容表、已知限制、免责声明）请见
> <https://github.com/corrinehu/dsh-workbuddy-connect>。
> 本文件只说明**补丁改了什么、怎么装、以及它的边界**。

## 安装

```sh
# Web profile（内核 0.2.1-rc.2 → 本包 0.7.8）
dsh plugin --profile web add @54145a/dsh-workbuddy-connect
dsh web

# 或直接从仓库源码安装
dsh plugin --profile web add github:54145a/dsh-workbuddy-connect
```

登录一次即可 —— **桌面 App 或 CodeBuddy CLI 均可**：

```sh
codebuddy login          # 或者登录 WorkBuddy 桌面 App
```

## 这个补丁做什么

CodeBuddy CLI 与 WorkBuddy 桌面 App 把凭据写进**同一个目录**，只是文件名不同：

| 来源 | 文件（同一目录下） |
|---|---|
| WorkBuddy 桌面 App（国内版） | `workbuddy-desktop.info` |
| WorkBuddy AI 桌面 App（国际版） | `workbuddy-desktop-ai.info` |
| **CodeBuddy CLI（本补丁新增）** | `Tencent-Cloud.coding-copilot.info` |

目录本身（`CodeBuddyExtension/Data/Public/auth/`）及每个平台下的探测顺序完全沿用上游实现：macOS 的 `Application Support`、Windows 的 Local→Roaming AppData、Linux 的 XDG config→data home、WSL 优先挂载的 Windows 用户目录。补丁只是把 CLI 文件名**追加在每个桌面候选之后**，不新增任何路径规则。

**桌面 App 仍然是身份权威**：只有当所有桌面候选都取不到凭据时，才会去读 CLI 文件。

## 行为契约

按重要程度排列，这些是本补丁刻意划定的边界：

1. **桌面优先，CLI 兜底。** 桌面 App 已登录时永远用桌面凭据，CLI 文件连读都不读。桌面 App 登出（文件仍是合法 JSON 但没有 token）时，才回落到 CLI。
2. **损坏仍然报错，不被 CLI 掩盖。** 桌面文件存在但不可解析、或加密凭据解密失败时，照上游语义**抛错**。桌面文件是身份权威，坏文件是需要修的问题，不是绕过的理由。
3. **跨区只跳过，不报错。** 两个产品共用一个目录，所以「国际版插件遇到国内版 CLI 登录态」是**共存**而非配置错误：区域不匹配的 CLI 文件被静默跳过（`current()` 里那个 `credential-region-mismatch` 抛错只保留给**桌面**文件被指错产品的情况）。两版的 CLI 登录态各自只对自己那版生效。
4. **显式路径不被拓宽。** 配置项 `authFile` / 环境变量 `WORKBUDDY_AUTH_FILE`（国际版 `WORKBUDDY_AI_AUTH_FILE`）指定的路径**原样使用**，不会顺带追加 CLI 文件。即使该路径指向的正是 CLI 文件名，也按桌面语义处理。
5. **绝不回写 CLI 文件。** CLI 的登录文件由 CLI 自己拥有。刷新后的凭据写入插件自留副本（`$DSH_HOME` 下），与上游处理桌面文件的方式一致。
6. **状态里仍显示 `desktop`。** 本补丁**不**新增 `cli` 来源标签 —— CLI 凭据在读入时就进入「桌面」槽位，所以 `status` / `doctor` 的 `source` 字段在 CLI 登录时依旧输出 `desktop`。改动面越小越容易随上游 rebase。

## 与上游的差异（改动清单）

相对上游 v0.7.8：

| 文件 | 改动 |
|---|---|
| `src/auth.ts` | 核心：`CLI_AUTH_FILENAME` 常量、候选列表追加 CLI 文件、`readDesktop()` 拆成「上游桌面段（逐字保留）+ 区域过滤的 CLI 段」 |
| `src/bin.ts` | 仅文案：doctor 提示提及 CLI |
| `src/client/locales.ts` | 仅文案：`intro` / `signedOutHint` 中英各 2 条提及 CLI |
| `package.json` | 包名改为 `@54145a/dsh-workbuddy-connect`、作者/仓库指向本 fork |
| `cordis.patch.yml` | patch 条目的 `name` 随包名改为带 scope 形式 |
| `tests/*.spec.ts` | 改写 2 处受候选追加影响的断言，新增 CLI 兜底用例 |
| `.github/workflows/release.yml` | 新增：打 tag 触发发布到 npm |

**未改动**：`upstream.ts`、`variants.ts`、`status-paths.ts`、`desktop-credential-protection.ts`、`catalog.ts`、`web-status.ts`。路由 `/plugins/dsh-workbuddy-connect/...` 是硬编码字面量，与包名无关，因此改 scope 不影响它。

## 发布（维护者）

打 tag 即触发 `.github/workflows/release.yml`：

```sh
# 1. 先 bump 版本并重建
npm version 0.7.9 --no-git-tag-version   # 或手动改 package.json
pnpm check                               # typecheck + 测试 + 构建，重建 lib/
git commit -am "chore: release 0.7.9"
git push

# 2. 打 tag 并推送 —— 这一步触发发布
git tag v0.7.9
git push origin v0.7.9
```

workflow 会在 `v*` tag 上：安装依赖 → 跑 `pnpm check` → `pnpm publish --access public --provenance`（用仓库 secret `NPM_TOKEN`）。

全程只用 pnpm，不混用 npm。这里有个**必须 pin pnpm 12** 的理由，不是随手选的版本：

- `--provenance` 需要 pnpm **≥ 12**（pnpm 10/11 的 `publish` 没有该参数）。上游 `diagnostics.yml` pin 的是 pnpm 10 —— 那是"跑测试"的版本，不能照抄来发布。
- pnpm **拒绝**从**项目级** `.npmrc` 展开 `${NODE_AUTH_TOKEN}`（安全策略：仓库可控的文件不得读取凭据）。所以认证依赖 `actions/setup-node` 把 `.npmrc` 写到 `$RUNNER_TEMP`（仓库之外）并导出 `NPM_CONFIG_USERCONFIG`，pnpm 才会按用户级配置展开。
- workflow 显式设 `NPM_CONFIG_REGISTRY=https://registry.npmjs.org/`：发布是唯一"落错 registry 不是性能问题"的操作。
- `--no-git-checks` 是**必需**而非走捷径：`actions/checkout` 在 tag 上是 detached HEAD，而 pnpm 默认的 `publish-branch` 检查（`master|main`）要求已附加到分支，否则报 `ERR_PNPM_GIT_UNKNOWN_BRANCH`。工作树是否干净已由前面的 `pnpm check` 保证。

**前置配置（一次性）**：在 GitHub 仓库 Settings → Secrets and variables → Actions 添加 `NPM_TOKEN`，值为 npm **Automation** 类型的 token（该类型绕过 OTP，适合 CI）。token 需有 `@54145a` scope 的发布权。

## 使用

```sh
dsh plugin --profile web exec dsh-workbuddy-connect doctor --json
dsh plugin --profile web exec dsh-workbuddy-connect status --json
```

`exec` 后的命令名是包的 **bin 名**（`dsh-workbuddy-connect`），与包名带不带 scope 无关。

仅用 CodeBuddy CLI 登录时，`doctor` 会报告：

```json
{
  "desktopAuthFile": {
    "path": "/home/<user>/.local/share/CodeBuddyExtension/Data/Public/auth/Tencent-Cloud.coding-copilot.info",
    "present": true,
    "format": "plaintext"
  },
  "signIn": "signed-in"
}
```

`path` 指向**实际命中的那个文件**（这里就是 CLI 文件），这是上游既有的诊断语义。

## 已知边界与风险

- **refresh_token 轮换竞争（真实存在，本补丁不处理）。** CLI 与 WorkBuddy 的刷新端点相同，且刷新会**轮换** refresh_token：一次实测中 refresh_token 从 1088 字符变为 700 字符。如果插件、真正的 CodeBuddy CLI、乃至 `dsh-codebuddy-cli` 同时持有同一账号的刷新链，先刷新的一方会让另一方手里的 refresh_token 失效。这**与上游现状同级**（上游同样与桌面 App 共享刷新链），因此不改代码，只在此警示：出现莫名的「登录失效」时重新登录一次即可。
- **CLI 文件格式依赖真机。** 已实测 CodeBuddy CLI 2.63.x 的国内账号文件为**明文 JSON**（`auth.domain = "www.codebuddy.cn"`），上游现成的解析器可直接读取。若 CLI 未来改为加密信封或换 schema，该文件会被判为 `unrecognized`/`encrypted` 而**静默跳过**（兜底段永不抛错），表现为「CLI 登录态用不了」而非报错。
- **XDG 边缘情形。** 本机实测 CLI 写在 `~/.local/share`（data home），上游的 Linux 候选两者都探测，所以正常命中。若你设了非默认 `XDG_CONFIG_HOME`/`XDG_DATA_HOME` 而 CLI 只认其中之一，兜底可能漏 —— 此时用 `WORKBUDDY_AUTH_FILE` 直指 CLI 文件即可（会按桌面语义处理，见契约 4）。
- **国际版 `doctor` 的 `present` 标志偏乐观。** 仅有国内版 CLI 文件时，国际版的 `present` 仍显示 `true`（文件确实存在），但该凭据会被区域跳过、`signIn` 仍是 `signed-out`。纯展示层面的不精确，已接受。
- **peer 依赖按内核线绑定。** 本包面向 DSH 内核 **0.2.1-rc.2**。内核 0.2.1-rc.1 请用上游 0.7.7，0.2.0-rc.2 请用上游 0.7.6。装错内核线会导致 DSH 启动失败。
- **未覆盖 CLI 的其他能力。** 只做登录态复用，不涉及 CLI 的 `X-IDE-Type: cli` 客户端身份、多账号、每日签到与积分面板。

## 验证

- 单元测试：`pnpm check`（typecheck + 804 项测试 + 构建）全绿；新增的 CLI 兜底用例在**未打补丁**的代码上会失败，确保不是空测试。
- 真机（本机无 WorkBuddy 桌面 App，仅有 CodeBuddy CLI 登录）：装进真实 DSH Web profile 后，`GET /plugins/dsh-workbuddy-connect/status` 返回 `signed-in`、真实账号与 `catalog.source: live`；auth 目录下**只有** CLI 文件，无桌面文件、无插件自留副本 —— 该登录态只能来自 CLI。
- 刷新链路：用 CLI 凭据走 WorkBuddy 的刷新端点成功换发新 access token，且**原始 CLI 文件字节级未被修改**（前后 sha256 一致）。

## 许可证

同上游，[MIT](./LICENSE)。

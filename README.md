# arnav.tech — Article Backup

Offline backup of all articles from **[arnav.tech](https://arnav.tech)** (Arnav Gupta's tech blog).

Each article is stored as a self-contained Markdown file with all images downloaded locally — no external CDN links.

**21 / 21** articles backed up &nbsp;·&nbsp; fully complete ✅

---

## Articles

| Date | Title | Tags | Status |
|------|-------|------|--------|
| 2026-06-03 | [Using Howdy on Linux like Windows Hello](articles/using-howdy-on-linux-like-windows-hello/index.md) | `face authentication` `howdy` `Ubuntu` | ✅ backed up |
| 2026-03-08 | [Under the Hood: How 2FA TOTP Authenticator Apps Work](articles/under-the-hood-how-totp-works-and-how-twofac-generates-your-2fa-codes/index.md) | `Kotlin` `Cryptography` `OTP` `2FA` | ✅ backed up |
| 2026-03-03 | [Architecting TwoFac: My Journey into Kotlin Multiplatform Module Structure](articles/architecting-twofac-my-journey-into-kotlin-multiplatform-module-structure/index.md) | `Kotlin` `Kotlin Multiplatform` `Security` | ✅ backed up |
| 2026-02-18 | [How Personal AI Agents and Agent Orchestrators like OpenClaw or GasTown are Made](articles/how-personal-ai-agents-and-agent-orchestrators-like-openclaw-or-gastown-are-made/index.md) | `ai-agent` `Agent-Orchestration` `openclaw` | ✅ backed up |
| 2026-02-10 | [env.sync.local - Syncing API keys and secrets between devices in my home LAN](articles/envsynclocal-syncing-api-keys-and-secrets-between-devices-in-my-home-lan/index.md) | `ssh` `scp` `encryption` `secrets` | ✅ backed up |
| 2026-01-31 | [Running llama.cpp (compiled from source) on AMD Strix Halo 395](articles/running-llamacpp-compiled-from-source-on-amd-strix-halo-395/index.md) | `Vulkan` `LLaMa` `inference` | ✅ backed up |
| 2026-01-28 | [sideproject diaries: sharetime.zone - A Simple Timezone Sharing Tool](articles/sideproject-diaries-sharetimezone-a-simple-timezone-sharing-tool/index.md) | `timezone` `Vue.js` `Netlify` | ✅ backed up |
| 2025-12-18 | [Beyond Copilot, Cursor and Claude Code: The Unbundled Coding AI Tools Stack](articles/beyond-copilot-cursor-and-claude-code-the-unbundled-coding-ai-tools-stack/index.md) | `agentic AI` `cursor` `copilot` | ✅ backed up |
| 2025-08-17 | [The AI Revolution: Following the Path of Microchips and Cloud Computing](articles/the-ai-revolution-following-the-path-of-microchips-and-cloud-computing/index.md) | `ai wave` `Microchips` `Cloud Computing` | ✅ backed up |
| 2025-06-21 | [My Next Project: Building the Open-Source, Cross-Platform Authenticator I Always Wanted](articles/my-next-project-building-the-open-source-cross-platform-authenticator-i-always-wanted/index.md) | `Open Source` `authentication` | ✅ backed up |
| 2025-01-23 | [Evaluating SotA LLM Models trying to solve a net-new LeetCode style puzzle](articles/evaluating-sota-llm-models-trying-to-solve-a-net-new-leetcode-style-puzzle/index.md) | `llm` `leetcode` `Model Evaluation` | ✅ backed up |
| 2024-08-09 | [Making one Jest test file depend on outputs from another](articles/making-one-jest-test-file-depend-on-outputs-from-another/index.md) | `Jest` `TypeScript` `Testing` | ✅ backed up |
| 2024-01-28 | [Using Clickhouse as an events store on Railway.app](articles/using-clickhouse-as-an-events-store-on-railwayapp/index.md) | `ClickHouse` `Databases` `railway-app` | ✅ backed up |
| 2024-01-02 | [MX Master on Mac OS - Jittery Cursor Position and Jumping Pointer](articles/mx-master-on-mac-os-jittery-cursor-position-and-jumping-pointer/index.md) | `mx master` `mouse` `macOS` | ✅ backed up |
| 2023-11-10 | [Nesting test files under the main file in Project View of Visual Studio Code and Jetbrains IDEs](articles/nesting-test-files-under-the-main-file-in-project-view-of-visual-studio-code-and-jetbrains-ides/index.md) | `Go Language` `Testing` `IDEs` | ✅ backed up |
| 2023-07-26 | [Understanding the shift of Frontend Development towards Declarative UI and redux-like state management](articles/understanding-the-shift-of-frontend-development-towards-declarative-ui/index.md) | `React` `Flutter` `Frontend Development` | ✅ backed up |
| 2023-07-03 | [Asking ChatGPT to build a YouTube Download App for me.](articles/asking-chatgpt-to-build-a-youtube-download-app-for-me/index.md) | `chatgpt` `openai` `generative ai` | ✅ backed up |
| 2023-01-02 | [Publishing a Kotlin Multiplatform Project in all platforms (Win, Mac, Linux, JVM, JS) with Github Actions](articles/publishing-a-kotlin-multiplatform-project-in-all-platforms-win-mac-linux-jvm-js-with-github-actions/index.md) | `github-actions` `Kotlin` `multiplatform` | ✅ backed up |
| 2022-12-27 | [Validating Github Actions Workflow files in Jetbrains IDEs](articles/validating-github-actions-workflow-files-in-jetbrains-ides/index.md) | `github-actions` `Jetbrains` `json-schema` | ✅ backed up |
| 2022-12-21 | [Creating and Publishing Visual Studio Code Color Themes](articles/creating-and-publishing-visual-studio-code-color-themes/index.md) | `Visual Studio Code` `vscode extensions` | ✅ backed up |
| 2022-04-26 | [Managing libraries and dependencies in Android projects with Gradle version catalog](articles/managing-libraries-and-dependencies-in-android-projects-with-gradle-version-catalog/index.md) | `#android` `#gradle` `#kotlin` | ✅ backed up |

---

## Structure

```
articles/
├── index.json                         ← master index (urls, dates, backup status)
└── <article-slug>/
    ├── index.md                       ← full article markdown, images rewritten to local paths
    └── images/
        └── *.png / *.jpg / *.gif      ← all embedded images downloaded locally
scripts/
└── import-backups.js                  ← imports .md files from hashnode-backups, downloads images
```

## Scripts

```bash
# Import / re-import from championswimmer/hashnode-backups (idempotent)
node scripts/import-backups.js

# Use a custom local clone of the backup repo
node scripts/import-backups.js --backups-dir /path/to/hashnode-backups
```

## Source

- Live blog: [arnav.tech](https://arnav.tech)
- Upstream backup (Hashnode export): [github.com/championswimmer/hashnode-backups](https://github.com/championswimmer/hashnode-backups)

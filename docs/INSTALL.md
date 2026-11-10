# Install the preview

Tested baseline: DSH 0.2.1-rc.3. Node.js 22.19+ is needed for local builds/demos. Later DSH versions are not automatically covered by that result.

## DSH CLI

From the extracted repository root:

```sh
npm run build:client
dsh plugin --profile desktop add ./dsh-plugin
```

Use your actual profile (`web`, for example). Restart DSH. The UI entry is **展开结构图**, not the built-in **轨迹** tab. The composer dock contains selection follow-ups and **新话题支线**.

The package contains a built `client.js`. A release tarball, if attached, can also be installed with `dsh plugin --profile desktop add ./local-conversation-structure-ui-0.1.0-preview.1.tgz`.

## Windows Desktop without a DSH CLI

Install Node.js/pnpm if unavailable. Locate the DSH home directory actually used by your app; do not assume it is the default. The directory must contain `profiles/desktop/package.json`.

Quit DSH, then run from this repository:

```powershell
npm run build:client
.\scripts\install-desktop.ps1 -DshHome 'YOUR_EXISTING_DSH_HOME' -Profile desktop
```

Replace `YOUR_EXISTING_DSH_HOME` with your real path. The script adds a local dependency and the package's bundle entry to the existing profile. It backs up the manifest and lockfile. It does not edit ACLs, credentials or conversations, and does not terminate running applications. Reopen DSH afterward. This installation helper has not yet been independently tested against a fresh Desktop installation.

Keep the checkout where you installed it: the profile links to that directory. Updating the code requires rebuilding the Client and reopening DSH.

## Using it

- Selected text: highlight a supported passage in a completed answer, type a question in the plugin input, press Enter or click **深入追问**.
- New topic: click **新话题支线**, set the main topic name and write your question. In a child Session, choose a parallel topic under the root or a nested topic under the current branch.
- Return: enter an optional short conclusion and click the return button. An empty conclusion pauses the branch.
- Overview: open **展开结构图**. Click a branch to inspect it, then **查看完整支线** to enter its Session.
- Motion: the switch is saved in the current profile. The operating system's reduced-motion preference takes priority.

## Optional Skill

The repository includes `.dsh/skills/conversation-structure/SKILL.md`. Use this checkout as the DSH workspace for project Skill discovery. Skill operations store local state under `data/`; they do not install the UI or automatically create UI child Sessions.

Import local state JSON in **Skill 历史总览（只读）** for a read-only outline. Importing does not establish a live two-way bridge.

## Uninstall

With the DSH CLI, run `dsh plugin --profile desktop remove @local/conversation-structure-ui` and restart. For a manually installed profile, remove this dependency and this exact name from `dsh.profile.bundles`; leave unrelated entries intact. The local checkout and DSH child Sessions are separate from plugin activation.

Installation mechanism reference: [DSH package and install guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md).

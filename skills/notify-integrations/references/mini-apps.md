# Personal mini apps

A mini app is a small offline web package (HTML, CSS, JavaScript, images) signed
for your own account and installed on your phone after you approve it. It is a
developer preview: packages are free, personal and web-only, and running them on
a physical device is still gated. Ordinary websites do not need this; register
them as web apps instead.

## Build, check, publish, offer

```sh
notify mini-apps build ./pickup-notes pickup-notes.json
notify mini-apps validate pickup-notes.json
notify mini-apps publish pickup-notes.json
notify mini-apps offer PACKAGE_ID
```

`build` and `validate` run offline and never overwrite an existing output file.
The package ID is the SHA-256 of the archive bytes; keep the archive you built.
`publish` checks that the signed-in account is the manifest's publisher.
`offer` sends an installation offer to your own phones only (needs `apps:write`
and `notifications:send`); installing still needs approval on the phone.

The source directory holds `manifest.json` plus exactly the files it lists:

```json
{"schemaVersion": 1, "appId": "pickup-notes", "name": "Pickup notes", "version": "1.0.0", "publisher": {"id": "usr_YOUR_ACCOUNT_ID", "name": "Maya Chen"}, "format": "web", "runtime": "notify-web-v1", "entryPoint": "index.html", "files": [{"path": "index.html", "mediaType": "text/html", "sha256": "64-hex-digest-of-the-file", "size": 1234}], "capabilities": ["local-storage"], "ageRating": 4, "commerce": "none"}
```

`publisher.id` is your account's user ID (`notify auth status`). `capabilities`
is empty or `["local-storage"]`; `ageRating` is 4, 9, 13, 16 or 18; `commerce`
must be `none`. Optional: `aliases`, HTTPS `privacyUrl` and `supportUrl`.

## Read and control

```sh
notify mini-apps list
notify mini-apps get PACKAGE_ID
notify mini-apps archive PACKAGE_ID --output pickup-notes-copy.json
notify mini-apps review
notify mini-apps export
notify mini-apps disable PACKAGE_ID --reason "Pausing while I fix the layout"
notify mini-apps remove PACKAGE_ID --reason "Retired"
```

`archive --output` writes the exact published bytes after checking them against
the package ID. `report`, `block`, `disable` and `remove` need `--reason` (1–500
characters).

## Local storage inside the package

The browser SDK's `notifyMini()` detects the storage bridge; it is present only
inside a packaged runtime that declared `local-storage`:

```js
import { notifyMini } from "./vendor/notify/browser.mjs";

const mini = notifyMini();
if (mini) {
  await mini.storage.set("draft", "Collect PKG-42 at 5pm");
  const draft = await mini.storage.get("draft");
  console.log(draft);
}
```

Keys up to 256 bytes, values up to 64 KiB, 256 entries and 1 MiB in total.

## MCP and HTTP

Publishing and archive downloads use the CLI (exact bytes). Metadata and
controls are also MCP tools (`mini_apps_list`, `mini_apps_get`,
`mini_apps_offer`, `mini_apps_disable`, ...):

```mcp
{"tool": "mini_apps_get", "arguments": {"packageId": "PACKAGE_ID"}}
```

```sh
curl -sS https://notify.belweave.ai/api/agent/mini-apps -H "Authorization: Bearer $NOTIFY_TOKEN"
```

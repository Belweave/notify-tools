# Free personal packaged Mini Apps


`notify mini-apps build DIRECTORY OUTPUT` creates a deterministic archive without signing in; `validate ARCHIVE` checks it locally. Existing output files are preserved. Packages must use `format: "web"`, `runtime: "notify-web-v1"`, `commerce: "none"`, a listed HTML entry point, SHA-256 file digests, and an authenticated publisher ID. Only free personal web packages are supported; arbitrary React Native bundles and paid commerce are disabled. Physical-device runtime availability remains gated pending Apple approval.

`publish ARCHIVE` checks the authenticated account before upload. `list`, `keys`, `review`, and `export` read owner-scoped metadata; export does not download archives. `get PACKAGE_ID` reads a package and `archive PACKAGE_ID` prints its archive JSON. Package IDs are lowercase SHA-256 digests. Archive stdout is parsed JSON, not a byte-exact copy suitable for signature verification; retain the original built archive.

`offer PACKAGE_ID` sends an installation offer only to your personal account (requires `apps:write` and `notifications:send`). Installation requires review in Notify. `report`, `block`, `disable`, and `remove` each require `PACKAGE_ID --reason "..."` (1–500 characters). These are explicit server mutations; remove records a removed state. Reads require `apps:read`; publishing and controls require `apps:write`.

The browser SDK exports `notifyMini()` separately from authenticated `notifyApp()` / `window.notify`. It only detects `window.notifyMini.storage`; it performs no sign-in, storage calls, or network requests. The broker is present only in supported packaged web runtimes declaring `local-storage`:

```ts
const mini = notifyMini();
if (mini) {
  await mini.storage.set("draft", "text");
  const draft: string | null = await mini.storage.get("draft");
  await mini.storage.remove("draft");
}
```

Keys must be nonempty and at most 256 UTF-8 bytes, values at most 64 KiB, with 256 entries and a 1 MiB encoded draft quota. Missing values return null; set/remove resolve null. Storage belongs to the signed-in account and app ID; revoked, disabled, stale, or invalid documents reject. This bridge grants no authenticated website access.

This is a package foundation, not a public marketplace, official MCP Apps hosting, arbitrary React Native applets, or an Executor integration. The source directory contains `manifest.json` plus exactly its listed files. Manifest keys are `schemaVersion: 1`, slug `appId`, `name`, semver `version`, `publisher: {id, name}`, `format`, `runtime`, HTML `entryPoint`, `files`, `capabilities` (empty or `["local-storage"]`), `ageRating` (4/9/13/16/18), and `commerce`; optional `aliases`, HTTPS `privacyUrl` and `supportUrl`. File entries contain `path`, `mediaType`, `sha256`, and `size`. Use existing package fixtures/current validator for the exact archive structure; do not fabricate a signed publisher or claim an installed runtime from a successful upload.

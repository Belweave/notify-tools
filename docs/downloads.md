# Public release downloads

Notify Tools owns its CLI/SDK source, GitHub release archives, and the static
download deployment. The Notify application links to this service; it does not
check in or build copies of the release bundle. The source repository can stay
private while the compiled Apache-2.0 release and included licenses are public.

The `notify-tools-downloads` Worker serves only
`notify.belweave.ai/downloads/notify-tools/*`. This more-specific route leaves the
Notify application and API under their existing Worker. It uses static assets,
no application secrets, containers, database, or paid storage service.

For an already reviewed GitHub release, download its archive and `SHA256SUMS`
using authenticated maintainer access, verify the GitHub asset digest, and run:

```sh
node scripts/prepare-downloads.mjs 0.12.2 /absolute/path/to/release-directory
wrangler deploy --config wrangler.downloads.jsonc
```

The preparation command verifies the checksum and preserves existing versions in
`dist/download-site`. Before deployment, prepare every previously public version
from its retained release assets too: Workers static deployments replace the
asset inventory. Never overwrite a version or remove older public downloads.
Use the team's installed Wrangler CLI; no CLI runtime dependency is added here.

Verify both public URLs without authentication after deployment, including the
downloaded SHA-256, then update the website install guide for the new version.
GitHub tagging and release creation continue through `.github/workflows/release.yml`.
Public download deployment is a separate maintainer step; it does not alter the
CLI version, create a tag, or change repository visibility.

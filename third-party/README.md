# Upstream license copies

Some published dependencies omit their license file. The release build uses these verbatim upstream copies for those packages and includes them under `licenses/`.

- OpenCode (`@opencode-ai/client`): [LICENSE at 854b3bb9d7d889f9c6e8c4627405b84d45bbc631](https://github.com/anomalyco/opencode/blob/854b3bb9d7d889f9c6e8c4627405b84d45bbc631/LICENSE).
- OpenTunnel (`@opentunnel/client`, `@opentunnel/protocol`): [LICENSE at 4b066b2ed40a4e0c325e60c68061599f2151d897](https://github.com/anomalyco/opentunnel/blob/4b066b2ed40a4e0c325e60c68061599f2151d897/LICENSE).

Package versions and declared licenses are pinned by `pnpm-lock.yaml`. All other bundled licenses are copied from their installed packages; an unknown missing license fails the build.

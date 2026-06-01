# Remote Git Transport

Typr browser remotes use the GitHub Git Database REST API, not GitHub Contents API sync and not browser smart-HTTP git.

Browser smart-HTTP git to `github.com` is not selected because GitHub does not expose the git transport with browser CORS semantics suitable for token-authenticated apps. Typr also does not send user tokens through a third-party CORS proxy.

The browser adapter talks only to `https://api.github.com` with token auth and uses Git object/ref endpoints:

- blobs: read and create file objects
- trees: read and create tree objects
- commits: read and create commit objects
- refs: read and update branch refs

Local state remains the source of truth. Fetch imports remote commit graphs into the local IndexedDB Git object database and updates `refs/remotes/<remote>/<branch>` only after the required objects are written. Pull is fetch plus a clean-worktree fast-forward checkout. Push uploads local commits and updates the remote ref only after GitHub has accepted the required objects.

Tokens are credentials, not repository config. They are stored in the Git credential store keyed by Typr managed repo id, passed to remote code per request, redacted from messages, and never embedded in remote URLs, local repo config, terminal output, or diagnostics.

Limitations in browser mode:

- Merge and rebase conflict flows are not implemented; pull requires fast-forwardable history and a clean working tree.
- Empty GitHub repositories must be initialized on GitHub first, for example with a README, because GitHub's Git Database API cannot create the first branch reference in an empty repository.
- Remote commits can still be rejected if GitHub's commit metadata is insufficient to reconstruct the exact Git object bytes locally.
- Smart-HTTP clone/fetch/push remains a non-browser transport candidate for a future trusted local agent.

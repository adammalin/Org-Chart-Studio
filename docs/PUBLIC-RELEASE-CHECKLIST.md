# Public-release checklist

## Technical repository checks

- [x] User-facing chart storage starts empty.
- [x] Test fixtures are fictional and never inserted into the user's library.
- [x] Operational charts, rosters, source evidence, databases, and backups are absent from the intended public tree.
- [x] The tracked-file and history scanner blocks chart-shaped data, non-synthetic workforce rows, source evidence, common credentials, ORNL email addresses, and user-specific home paths.
- [x] Git hooks run the scanner before normal commits and pushes.
- [x] macOS and Windows public-install instructions use unauthenticated public GitHub access and an exact commit archive.
- [x] Both command-line installers record the exact revision and archive SHA-256, preserve private state during update, and fall back to a pinned Node runtime verified against the official checksum.
- [x] Everyday CI defines matching Mac and Windows fresh-install, update-preservation, forced-portable-runtime, and Electron/GUI/storage/AI smoke jobs.
- [ ] Push the current scripts and retain passing Mac and Windows command-line install jobs before claiming platform parity.
- [ ] Complete a human start/update check on a managed Windows 10 or 11 computer before a broader pilot.
- [x] The package is marked private and `UNLICENSED` to prevent accidental package publication or an implied open-source license.
- [x] Confirm the final root commit passes the complete tests, lint, desktop smoke test, tracked scan, and reachable-history scan.
- [x] Confirm the remote's reachable history contains only the intended root commit and no unintended branches, tags, releases, issues, pull requests, Actions artifacts, repository secrets, or variables.
- [ ] Confirm every pre-rewrite commit identifier returns `404 Not Found`, or ask GitHub Support to purge the unreachable pre-rewrite objects and cached views. Rewriting and force-pushing a branch does not immediately delete those server-side objects. Follow GitHub's [sensitive-data removal guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).
- [x] Confirm an unauthenticated Mac install through the public GitHub API and archive with credentials removed from the environment, including dependency install, build, and Electron smoke verification.

## Required owner and institutional decisions

- [ ] Obtain authority to distribute the software and select approved license or other distribution terms.
- [ ] Complete applicable software-release, cybersecurity, privacy, records-management, export-control, accessibility, content, and legal review.
- [ ] Approve the product name and draft ORNL-inspired visual treatment; approved logo artwork is not included.
- [ ] Define a public support and vulnerability-reporting contact before broad promotion.
- [ ] Decide whether repository issues, discussions, forking, and Actions should be enabled for the public audience.

The repository was made public before the unreachable-object purge and owner/institutional decisions were resolved. Current visibility must not be represented as completed release approval.

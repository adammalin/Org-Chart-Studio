# Agent workflow commands

This source candidate has 38 desktop operations and 42 browser page tools. Discover actual running capabilities; published builds and pinned desktop installers may lag source. Browser tools require the current workspace ID and reject an old connection even when a reopened file has the same workspace ID.

| Operation | Use |
| --- | --- |
| stage_chart_patch | Whitelisted chart/unit/relationship/support-entry fields, exact saved-chart guards, stable request ID, normal review proposal. No geometry, identifiers, source-file list or approval history replacement. |
| get_chart_proposal | Compact differences and a digest of exact reviewed content. Runtime source storage paths are excluded so a full portable Open preserves the digest. |
| start_validation_batch | Up to 200 chart structure checks; does not compare sources. |
| start_source_check_batch | Queue AI comparison records after actual source comparison, preserving URL/locator/revision, coverage and saved-chart guards. |
| continue_agent_batch | At most 25 items, default ten. Compact receipts omit queued source-check inputs and show finding counts plus at most ten shortened findings per chart; use validate_chart for full detail. Per-item durable progress and idempotent source-check receipts; a 90-second crash lease prevents concurrent runners. busy means retry the same job after retryAfterMs, not completion. Failed items remain reported. |
| list_agent_operations / get_agent_operation | Discover the 20 most recently updated in-scope workflows and inspect one durable receipt/progress record. |
| prepare_reviewed_apply | Bind up to ten exact proposal IDs and digests to a visible review set. Does not apply. The UI applies atomically with stale checks, checkpoints and undo history. No AI human-review or Current designation. |
| prepare_library_download (browser) | Full working file, visible download link, revision/bytes/SHA-256 receipt. Requires all-chart scope and retained-source access. Encrypted libraries/selection use visible passphrase controls. |
| confirm_library_download (browser) | After observing and hashing the actual downloaded file, record agent-reported-download. This is not an app-verified disk write or cloud-sync confirmation. |

Use a unique agent-prefixed requestId for new operations. Reuse the exact inputs and ID after uncertain responses. Changing inputs requires a new ID. Pause and scope are rechecked on continuation and application; imported workflow records never grant access. Source-check jobs do not retrieve external websites or manufacture verification. Source evidence and chart authority remain the user's responsibility and the agent's actual comparison task.

Full .orgchart-workspace export/Open preserves jobs and idempotence receipts alongside pending reviews, retained sources and history. Legacy library backups and Merge are different operations; save a complete working file for continued agent work. Keep rollback files.

Browser connection health is in Browser AI control. Late host injection, document start and a changed workspace connection register tools. Healthy focus leaves handles intact; Reconnect tools forces registration and retains access settings. Rediscover tools and reread workspace status after reload/reconnect. Never automatically replay arbitrary writes or grant permissions. Some hosts may still need their own reconnect.

Prepared downloads expire when replaced or the workspace connection changes. A newer revision stays dirty after confirming an older file. Linked-file saves guard against an external writer and verify readback bytes; native pickers may require user interaction. Browser recovery is not a portable file save. No browser flow confirms OneDrive/Dropbox synchronization.

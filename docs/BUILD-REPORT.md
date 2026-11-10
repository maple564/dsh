# Release preparation checks

Date: 2026-11-10. Candidate: 0.1.0-preview.1.

- Node v26.8.1, npm test: 27 passed, 0 failed in the source checkout.
- Client rebuilt successfully; generated Client SHA256: eea02e55145684a6f0c106978eff57d0a65346f1e990121f14758a37b42de8cb.
- PowerShell installation helper parsed successfully; installation against a fresh DSH profile was not exercised.
- Allowlisted release directory scanned for common credential patterns and personal workspace paths: no matches. This is not a comprehensive security audit.
- npm pack --ignore-scripts succeeded: 9 package files, including built client.js and license.
- Latest topic/import/motion features still await full DSH GUI acceptance.
- Prepared locally; this report does not claim GitHub publication or hosted CI success.

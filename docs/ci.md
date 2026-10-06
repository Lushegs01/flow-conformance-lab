# CI integration

The committed workflow builds the software, runs unit/integration/CLI tests, exercises both demo targets and retains evidence. GitHub Actions references are pinned to immutable commits resolved from the public v4 tags on 2026-10-06. Workflow permissions are read-only; checkout does not retain repository credentials.

For your own host, replace the demo step with your existing isolated host startup/provisioning and readiness check, then run:

```yaml
- name: Conformance against provisioned implementation
  env:
    FLOW_AUTHORIZATION: ${{ secrets.CONFORMANCE_HOST_AUTHORIZATION }}
    TARGET_URL: https://your-dedicated-test-host.example/jarvis
  run: >-
    node dist/apps/cli/index.js test "$TARGET_URL"
    --allow-remote --config ci-target.json --suite core
    --timeout 5000 --output runs --json
- name: Retain conformance evidence even on failure
  if: always()
  uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02
  with:
    name: host-conformance-evidence
    path: runs/
    retention-days: 7
```

Use the complete Authorization value expected by your host. `ci-target.json` contains IDs and `auth_env`, never the credential. The example URL is a placeholder to replace; no host startup API is assumed. Loopback HTTP targets omit `--allow-remote`.

Do not append `|| true` to the test command: exit 1 means observed failure and exit 2 means incomplete/configuration failure. A failed assertion can coexist with an inconclusive scenario; failure exit 1 takes precedence. Both should block a CI gate that requires evidence.

Do not expose production credentials to untrusted pull-request code, use `pull_request_target` to execute proposed code, or publish run artifacts without considering their business content. The runner redacts known secrets, but redaction is not a general confidentiality classifier.

This workflow has been authored and its underlying commands verified locally. A hosted GitHub Actions run requires placing the repository on GitHub; no remote repository or hosted run was created during implementation.

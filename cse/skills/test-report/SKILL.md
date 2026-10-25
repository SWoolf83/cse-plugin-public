---
name: test-report
description: Record test results against a Cascade package after running verification tests
---

# Test Report Skill

After running tests for a feature or package, use this skill to capture results in Cascade.

## Usage

When you've completed testing, call the `cascade_append_test_results` MCP tool with:

1. `package_id` — the package these tests verify
2. `label` — describe the test run (e.g., "Human-mediated AI acceptance tests")
3. `results` — array of individual test outcomes:
   - `id`: short identifier like "1a", "2b"
   - `name`: what was tested
   - `status`: "pass", "fail", or "skip"
   - `note`: (optional) why it failed or was skipped
   - `procedure`: (optional) one-line description of how to re-run this specific test

## Example

```json
{
  "package_id": "788d1afe-...",
  "label": "Feature acceptance tests",
  "results": [
    { "id": "1a", "name": "DB constraint accepts new value", "status": "pass", "procedure": "INSERT into packages with executor_type='human_mediated_ai'" },
    { "id": "2a", "name": "Dropdown shows option", "status": "pass", "procedure": "Load package detail page, check executor type select" },
    { "id": "5a", "name": "Sheet sync shows names", "status": "skip", "note": "Needs manual sheet sync trigger", "procedure": "Trigger Sync to Sheet, verify assignee column" }
  ]
}
```

The results are stored in the package's `type_data.test_runs[]` and displayed on the package detail page. If tests fail or are skipped, the UI offers a "Re-test" button that creates a new session to re-verify.

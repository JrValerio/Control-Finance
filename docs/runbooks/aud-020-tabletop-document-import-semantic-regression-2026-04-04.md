# AUD-020 Tabletop Drill Evidence - Document Import Semantic Regression

Date (UTC): 2026-04-04
Owner: operations + observability
Scope: single scenario tabletop for document import semantic incident (`source=transactions_import`).

## Scenario

Simulated incident: sudden rise in `parse_failure` with concurrent drop in `sensitive_mutation_success`, while `parse_attempt` volume remains stable.

## Preconditions

- Runbook under test: `docs/runbooks/document-import-semantic-incident.md`
- Signal contract reference: AUD-013 metric `document_financial_observability_events_total{source,signal,reason_class}`

## Drill Checklist (single scenario)

1. Validate trigger pattern across three signals.
   - Expected: pattern confirmed in the same 5-15 minute window.
   - Result: OK.
2. Classify severity and declare incident owner.
   - Expected: severity assigned (P1/P2/P3) and owner identified.
   - Result: OK (P2).
3. Execute first mitigation path (rollback of recent rule/config change).
   - Expected: mitigation action selected and recorded.
   - Result: OK.
4. Evaluate recovery window (30 minutes) using same signals.
   - Expected: `parse_failure` downtrend and `sensitive_mutation_success` recovery.
   - Result: OK.
5. Register closure evidence.
   - Expected: incident template filled with timestamps and notes.
   - Result: OK.

## Expected Outcome

- Team can execute triage, mitigation and closure with a deterministic checklist.
- Incident handling does not require global incident policy expansion.

## Notes and Follow-up

- No scope expansion authorized in this slice.
- Any new runbook beyond this boundary must be proposed in a separate AUD item.
# Contributing
1. Fork, branch, keep changes small.
2. Run `npm test` and `npm run test:local`; never delete or weaken a failing test; explain it.
3. Calculation changes must keep the reference tests in `tests/golden` passing (update them deliberately if a result is meant to change).
4. No dependencies, trackers, hardcoded keys, fabricated numbers or performance claims. Label demo/synthetic data.
5. Live-trading code needs a design discussion first.

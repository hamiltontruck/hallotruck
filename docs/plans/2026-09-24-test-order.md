# TDD execution order

1. Run and confirm the new contract tests fail for the intended missing behavior.
2. Implement the smallest production changes for each contract.
3. Re-run targeted tests to green.
4. Run the wider regression/build suite.
5. Perform mobile smoke before merge.

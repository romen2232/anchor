Feature: Tasks that wait for each other

  Scenario: A task waits for another
    Given "Send report" waits for "Write report"
    When "Write report" is still open
    Then "Send report" is waiting on "Write report"

  Scenario: Skipping releases the wait
    Given "Send report" waits for "Write report"
    When "Write report" is skipped
    Then "Send report" is ready

  Scenario: Circular waits are refused
    Given "A" waits for "B"
    When I make "B" wait for "A"
    Then I am told the tasks would wait for each other forever

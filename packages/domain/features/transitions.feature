Feature: I get gentle heads-ups around my tasks

  Scenario: I get told when to leave
    Given a one-time task "Go to the administrations" on Thursday 19 Nov at 10:00 with 20 minutes travel and 10 minutes prep
    When I check my heads-ups for "Go to the administrations"
    Then I am told "Leave in 15 min" at 09:15

  Scenario: I get told when to wrap up
    Given a routine "Deep work" on Tuesday at 09:00 for 60 minutes
    When I check my heads-ups for "Deep work"
    Then I am told "Wrap up in 5" at 09:55

  Scenario: A task with nothing to get ready for has no leave heads-up
    Given a routine "Deep work" on Tuesday at 09:00 for 60 minutes
    When I check my heads-ups for "Deep work"
    Then I am not told "Leave in 15 min"

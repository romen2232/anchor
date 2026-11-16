Feature: My week is planned ahead

  Scenario: My week is planned ahead
    Given a routine "Gym" on Monday and Wednesday
    And a one-time task "Go to the administrations" on Thursday 19 Nov at 10:00
    When the week of 16 Nov is planned
    Then I see 3 tasks in that week

  Scenario: Late-night tasks belong to the day they start
    Given a routine "Read" on Tuesday at 23:30 for 60 minutes
    When the week of 16 Nov is planned
    Then "Read" appears on Tuesday 17 Nov

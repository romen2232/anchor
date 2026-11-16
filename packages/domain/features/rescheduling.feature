Feature: Rescheduling

  Scenario: Later today, or tomorrow morning
    Given "Read" at 09:00 for 30 minutes
    And my day is full until 23:59
    When I move "Read" to later today at 23:00
    Then "Read" moves to tomorrow's first free slot

  Scenario: Split a big task
    Given "Deep work" at 09:00 for 60 minutes
    When I split it
    Then I have two 30 minute parts

  Scenario: Tomorrow's first free slot skips what is already planned
    Given "Read" at 09:00 for 30 minutes
    And my day is full until 23:59
    And tomorrow starts with "Standup" for 30 minutes
    When I move "Read" to later today at 23:00
    Then "Read" moves to tomorrow at 08:30

  Scenario: Split what is left of a task in progress
    Given "Deep work" at 09:00 for 60 minutes
    When it is 09:30 and I split it
    Then the parts are 09:00-09:45 and 09:45-10:00

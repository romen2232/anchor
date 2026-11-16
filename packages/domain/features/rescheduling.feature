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

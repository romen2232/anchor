Feature: Today view

  Scenario: One thing at a time
    Given "Gym" 07:00-08:00, "Deep work" 09:00-10:00 and "Lunch" 13:00
    When it is 09:15
    Then Now is "Deep work"
    And Next is "Lunch"
    And the timeline shows all three

  Scenario: Open tasks are kept, kindly
    Given "Gym" 07:00-08:00 is still open
    When it is 09:15
    Then "Gym" is in Later
    And nothing calls it overdue

Feature: My routine repeats on chosen weekdays

  Scenario: A routine repeats on chosen weekdays
    Given "Gym" repeats every Monday and Wednesday
    Then "Gym" is planned on Monday 16 Nov
    And "Gym" is not planned on Tuesday 17 Nov

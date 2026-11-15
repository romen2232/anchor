Feature: Times follow my local clock

  Scenario: A morning routine follows my clock
    Given I live in Europe/Madrid and have "Gym" at 09:00
    When it is 17 Nov 2026
    Then "Gym" starts at 08:00 UTC

  Scenario: Clocks jump forward
    Given I live in Europe/Madrid and have "Meditate" at 02:30
    When it is 29 Mar 2026
    Then "Meditate" happens at 03:30 local time

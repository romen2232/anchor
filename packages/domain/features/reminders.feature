Feature: Reminders

  Scenario: Reminders escalate, then stop
    Given "Deep work" at 09:00 with full reminders
    Then I get a gentle reminder at 08:50
    And I get an insistent one at 09:00
    And I get one repeat at 09:05
    And I get nothing more

  Scenario: Quiet hours stay quiet
    Given quiet hours 22:00-07:00
    And a non-essential "Stretch" at 06:30
    Then I get no reminders for "Stretch"

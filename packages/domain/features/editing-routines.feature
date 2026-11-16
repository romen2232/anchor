Feature: Editing routines

  Scenario: Changing my routine respects what I already moved
    Given "Gym" at 09:00 every weekday and I snoozed Wednesday's "Gym"
    When I change "Gym" to 10:00
    Then the other upcoming days move to 10:00
    And Wednesday stays as I left it

  Scenario: A day I moved elsewhere is not brought back
    Given "Gym" at 09:00 every weekday and I moved Tuesday's "Gym" to tomorrow
    When I change "Gym" to 10:00
    Then Tuesday gets no new "Gym"
    And the moved "Gym" stays where I put it

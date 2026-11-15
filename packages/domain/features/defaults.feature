Feature: Default scheduling settings

  Scenario: New users get breathing room
    Given I am a new user
    Then each task is followed by a 10 minute buffer

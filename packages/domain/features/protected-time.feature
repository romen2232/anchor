Feature: Protected time

  Scenario: Lunch is protected
    Given a protected "Lunch" 13:00-14:00
    When I try to place a 30 minute task at 13:15
    Then I am warned
    And I am offered 14:00

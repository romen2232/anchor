Feature: My repeating tasks don't pile up

  Scenario: Unfinished repeats don't pile up
    Given "Water plants" was left open on Monday and Tuesday
    When it is Wednesday at 12:00
    Then I see "Water plants" only once

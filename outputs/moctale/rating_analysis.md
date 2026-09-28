# MovieLens rating-pattern results

- Ratings analyzed: 100,836
- Users: 610
- Movies with ratings: 9,724
- Overall mean rating: 3.502 / 5
- Timestamp range (UTC): 1996-03-29 to 2018-09-24

The supplied data are MovieLens community ratings, not Moctale data. Rating timestamps
record when MovieLens ratings were submitted; they do not identify movie release dates
or prove when a movie was watched. See the CSV files for the full rating, genre, and
user summaries. Bayesian movie means shrink low-vote titles toward the dataset mean;
the prior strength is configurable with `--prior-votes` (default: 50).

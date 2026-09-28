"""MovieLens Recommendation System Runner with Moctale Rating Meter.

Provides:
- Moctale Rating System: Categorical consensus (Perfection, Go for it, Timepass, Skip)
  along with Moctale Meter Percentages and Vibe Chart distributions.
- Collaborative Filtering (SVD Matrix Factorization)
- Content-Based Filtering (TF-IDF + Cosine Similarity on genres)
- Bayesian Mean Shrinkage
"""

from __future__ import annotations

import argparse
import os
import pickle
import sys
from pathlib import Path
from typing import Optional

# Ensure UTF-8 output encoding on Windows consoles
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from surprise import Dataset, Reader, SVD

# Moctale Meter Categories and Thresholds
MOCTALE_CATEGORIES = ("Perfection", "Go for it", "Timepass", "Skip")
MOCTALE_EMOJIS = {
    "Perfection": "🌟 Perfection",
    "Go for it": "👍 Go for it",
    "Timepass": "⏳ Timepass",
    "Skip": "⏭️ Skip",
}


def rating_to_moctale(r: float) -> str:
    """Map numerical star rating to Moctale category."""
    if r >= 4.5:
        return "Perfection"
    if r >= 3.5:
        return "Go for it"
    if r >= 2.5:
        return "Timepass"
    return "Skip"


class MovieRecommender:
    def __init__(self, data_dir: Path = Path("data"), cache_dir: Path = Path("outputs")):
        self.data_dir = Path(data_dir)
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
        self.ratings_df: Optional[pd.DataFrame] = None
        self.movies_df: Optional[pd.DataFrame] = None
        self.links_df: Optional[pd.DataFrame] = None
        self.moctale_stats: Optional[pd.DataFrame] = None
        self.svd_model: Optional[SVD] = None
        self.tfidf_matrix = None
        self.tfidf_vectorizer = None
        self._movie_id_to_idx = {}
        self._movie_idx_to_id = {}

        self.load_data()
        self.init_moctale_meter()
        self.init_content_based()

    def load_data(self) -> None:
        ratings_path = self.data_dir / "ratings.csv"
        movies_path = self.data_dir / "movies.csv"
        links_path = self.data_dir / "links.csv"

        if not ratings_path.exists() or not movies_path.exists():
            raise FileNotFoundError(f"Missing data files in {self.data_dir}")

        self.ratings_df = pd.read_csv(ratings_path)
        self.movies_df = pd.read_csv(movies_path)
        
        if links_path.exists():
            self.links_df = pd.read_csv(links_path)
            self.movies_df = self.movies_df.merge(self.links_df, on="movieId", how="left")
            self.movies_df["imdbId"] = self.movies_df["imdbId"].apply(
                lambda x: f"{int(x):07d}" if pd.notnull(x) else ""
            )
        else:
            self.movies_df["imdbId"] = ""
            self.movies_df["tmdbId"] = ""

        # Precompute mappings for fast lookup
        for idx, row in self.movies_df.iterrows():
            self._movie_id_to_idx[row["movieId"]] = idx
            self._movie_idx_to_id[idx] = row["movieId"]

    def init_moctale_meter(self) -> None:
        """Compute Moctale meter percentages and dominant verdict for each movie."""
        df = self.ratings_df.copy()
        df["moctale_cat"] = df["rating"].apply(rating_to_moctale)
        
        counts = df.groupby(["movieId", "moctale_cat"]).size().unstack(fill_value=0)
        for col in MOCTALE_CATEGORIES:
            if col not in counts.columns:
                counts[col] = 0

        totals = counts.sum(axis=1)
        pcts = counts.div(totals, axis=0) * 100
        pcts = pcts.round(1)
        pcts["total_votes"] = totals
        pcts["dominant_verdict"] = pcts[list(MOCTALE_CATEGORIES)].idxmax(axis=1)
        self.moctale_stats = pcts

    def init_content_based(self) -> None:
        clean_genres = self.movies_df["genres"].fillna("").str.replace("|", " ", regex=False)
        self.tfidf_vectorizer = TfidfVectorizer(token_pattern=r"(?u)\b\w+\b")
        self.tfidf_matrix = self.tfidf_vectorizer.fit_transform(clean_genres)

    def get_svd_model(self, force_retrain: bool = False) -> SVD:
        if self.svd_model is not None and not force_retrain:
            return self.svd_model

        model_cache = self.cache_dir / "svd_model.pkl"
        if model_cache.exists() and not force_retrain:
            try:
                with open(model_cache, "rb") as f:
                    self.svd_model = pickle.load(f)
                return self.svd_model
            except Exception:
                pass

        reader = Reader(rating_scale=(0.5, 5.0))
        data = Dataset.load_from_df(self.ratings_df[["userId", "movieId", "rating"]], reader)
        trainset = data.build_full_trainset()

        model = SVD(n_factors=100, n_epochs=50, lr_all=0.01, reg_all=0.1, random_state=24)
        model.fit(trainset)
        self.svd_model = model

        try:
            with open(model_cache, "wb") as f:
                pickle.dump(model, f)
        except Exception:
            pass

        return self.svd_model

    def get_movie_moctale_info(self, movie_id: int, predicted_rating: Optional[float] = None) -> dict:
        """Extract Moctale meter breakdown and vibe chart for any movie."""
        if self.moctale_stats is not None and movie_id in self.moctale_stats.index:
            row = self.moctale_stats.loc[movie_id]
            verdict = row["dominant_verdict"]
            perfection = float(row["Perfection"])
            goforit = float(row["Go for it"])
            timepass = float(row["Timepass"])
            skip = float(row["Skip"])
            votes = int(row["total_votes"])
        else:
            r = predicted_rating if predicted_rating is not None else 3.5
            verdict = rating_to_moctale(r)
            if verdict == "Perfection":
                perfection, goforit, timepass, skip = 85.0, 15.0, 0.0, 0.0
            elif verdict == "Go for it":
                perfection, goforit, timepass, skip = 25.0, 60.0, 15.0, 0.0
            elif verdict == "Timepass":
                perfection, goforit, timepass, skip = 5.0, 25.0, 55.0, 15.0
            else:
                perfection, goforit, timepass, skip = 0.0, 10.0, 30.0, 60.0
            votes = 0

        # Calculate Moctale Vibe Chart (genre percentages)
        movie_row = self.movies_df[self.movies_df["movieId"] == movie_id]
        vibe_chart = {}
        if not movie_row.empty:
            genres_str = str(movie_row.iloc[0]["genres"])
            if genres_str and genres_str != "(no genres listed)":
                genres = [g.strip() for g in genres_str.split("|") if g.strip()]
                if genres:
                    share = round(100.0 / len(genres), 1)
                    vibe_chart = {g: share for g in genres}

        return {
            "verdict": verdict,
            "verdict_display": MOCTALE_EMOJIS.get(verdict, verdict),
            "perfection_pct": perfection,
            "goforit_pct": goforit,
            "timepass_pct": timepass,
            "skip_pct": skip,
            "vote_count": votes,
            "vibe_chart": vibe_chart,
        }

    def recommend_for_user(self, user_id: int, top_n: int = 5) -> list[dict]:
        """Collaborative Filtering with Moctale Meter classification."""
        if user_id not in self.ratings_df["userId"].values:
            raise ValueError(f"User ID {user_id} not found. Valid IDs: 1 to {self.ratings_df['userId'].max()}")

        svd = self.get_svd_model()
        user_ratings = self.ratings_df[self.ratings_df["userId"] == user_id]
        seen_movie_ids = set(user_ratings["movieId"])

        unseen_movies = self.movies_df[~self.movies_df["movieId"].isin(seen_movie_ids)]

        predictions = []
        for _, row in unseen_movies.iterrows():
            est_rating = svd.predict(user_id, row["movieId"]).est
            predictions.append((row, est_rating))

        predictions.sort(key=lambda x: x[1], reverse=True)
        top_recs = predictions[:top_n]

        results = []
        for row, est_rating in top_recs:
            mid = int(row["movieId"])
            imdb_id = row.get("imdbId", "")
            imdb_url = f"https://www.imdb.com/title/tt{imdb_id}/" if imdb_id else ""
            moctale_info = self.get_movie_moctale_info(mid, predicted_rating=est_rating)
            results.append({
                "movieId": mid,
                "title": row["title"],
                "genres": row["genres"],
                "predicted_rating": round(float(est_rating), 2),
                "predicted_moctale": rating_to_moctale(est_rating),
                "moctale": moctale_info,
                "imdb_url": imdb_url,
            })
        return results

    def find_movie_by_title(self, query: str) -> Optional[dict]:
        query = query.strip()
        exact = self.movies_df[self.movies_df["title"].str.lower() == query.lower()]
        if not exact.empty:
            return exact.iloc[0].to_dict()

        contains = self.movies_df[self.movies_df["title"].str.contains(query, case=False, na=False)]
        if not contains.empty:
            return contains.iloc[0].to_dict()

        return None

    def recommend_by_movie(self, title_or_id: str | int, top_n: int = 5) -> tuple[dict, list[dict]]:
        """Content-Based Filtering with Moctale Meter and Vibe Chart."""
        if isinstance(title_or_id, int) or (isinstance(title_or_id, str) and title_or_id.isdigit()):
            movie_id = int(title_or_id)
            match = self.movies_df[self.movies_df["movieId"] == movie_id]
            if match.empty:
                raise ValueError(f"Movie ID {movie_id} not found.")
            target_movie = match.iloc[0]
        else:
            found = self.find_movie_by_title(str(title_or_id))
            if not found:
                raise ValueError(f"Movie matching '{title_or_id}' was not found in catalog.")
            target_movie = pd.Series(found)

        target_idx = self._movie_id_to_idx[target_movie["movieId"]]
        target_vector = self.tfidf_matrix[target_idx]

        sim_scores = cosine_similarity(target_vector, self.tfidf_matrix).flatten()
        sorted_indices = sim_scores.argsort()[::-1]

        results = []
        for idx in sorted_indices:
            if idx == target_idx:
                continue
            row = self.movies_df.iloc[idx]
            mid = int(row["movieId"])
            imdb_id = row.get("imdbId", "")
            imdb_url = f"https://www.imdb.com/title/tt{imdb_id}/" if imdb_id else ""
            moctale_info = self.get_movie_moctale_info(mid)
            results.append({
                "movieId": mid,
                "title": row["title"],
                "genres": row["genres"],
                "similarity_score": round(float(sim_scores[idx]), 3),
                "moctale": moctale_info,
                "imdb_url": imdb_url,
            })
            if len(results) >= top_n:
                break

        target_mid = int(target_movie["movieId"])
        target_dict = {
            "movieId": target_mid,
            "title": target_movie["title"],
            "genres": target_movie["genres"],
            "moctale": self.get_movie_moctale_info(target_mid),
            "imdb_url": f"https://www.imdb.com/title/tt{target_movie.get('imdbId', '')}/" if target_movie.get("imdbId") else "",
        }
        return target_dict, results

    def get_top_rated_movies(self, top_n: int = 10, min_ratings: int = 50) -> list[dict]:
        """Bayesian-shrunk top rated movies with Moctale meter distribution."""
        global_mean = float(self.ratings_df["rating"].mean())
        stats = self.ratings_df.groupby("movieId")["rating"].agg(["count", "mean"])
        
        prior = 50
        stats["bayesian_score"] = (stats["count"] * stats["mean"] + prior * global_mean) / (stats["count"] + prior)
        stats = stats[stats["count"] >= min_ratings].sort_values("bayesian_score", ascending=False).head(top_n)

        results = []
        for mid, row in stats.iterrows():
            movie_row = self.movies_df[self.movies_df["movieId"] == mid]
            if not movie_row.empty:
                m = movie_row.iloc[0]
                results.append({
                    "movieId": int(mid),
                    "title": m["title"],
                    "genres": m["genres"],
                    "rating_count": int(row["count"]),
                    "raw_average": round(float(row["mean"]), 2),
                    "bayesian_score": round(float(row["bayesian_score"]), 2),
                    "moctale": self.get_movie_moctale_info(int(mid)),
                    "imdb_url": f"https://www.imdb.com/title/tt{m.get('imdbId', '')}/" if m.get("imdbId") else "",
                })
        return results

    def get_user_profile(self, user_id: int) -> dict:
        """User profile with Moctale style breakdown."""
        user_ratings = self.ratings_df[self.ratings_df["userId"] == user_id].copy()
        if user_ratings.empty:
            raise ValueError(f"User {user_id} not found.")

        user_ratings["moctale"] = user_ratings["rating"].apply(rating_to_moctale)
        style_counts = user_ratings["moctale"].value_counts(normalize=True) * 100

        merged = user_ratings.merge(self.movies_df, on="movieId")
        top_favorites = merged.sort_values("rating", ascending=False).head(5)
        
        return {
            "userId": user_id,
            "total_ratings": len(user_ratings),
            "average_rating": round(float(user_ratings["rating"].mean()), 2),
            "moctale_style": {
                "perfection_pct": round(float(style_counts.get("Perfection", 0.0)), 1),
                "goforit_pct": round(float(style_counts.get("Go for it", 0.0)), 1),
                "timepass_pct": round(float(style_counts.get("Timepass", 0.0)), 1),
                "skip_pct": round(float(style_counts.get("Skip", 0.0)), 1),
            },
            "top_favorites": [
                {
                    "title": r["title"],
                    "rating": r["rating"],
                    "moctale_verdict": MOCTALE_EMOJIS.get(rating_to_moctale(r["rating"]), ""),
                    "genres": r["genres"]
                }
                for _, r in top_favorites.iterrows()
            ]
        }


def print_user_recommendations(recommender: MovieRecommender, user_id: int, top_n: int = 5) -> None:
    profile = recommender.get_user_profile(user_id)
    style = profile["moctale_style"]
    print("=" * 76)
    print(f"🎬 Collaborative Filtering Recommendations for User #{user_id}")
    print("=" * 76)
    print(f"User Profile: {profile['total_ratings']} movies rated | Average Rating: {profile['average_rating']:.2f} / 5.0")
    print(f"Moctale Rating Style: 🌟 {style['perfection_pct']}% Perfection | 👍 {style['goforit_pct']}% Go for it | ⏳ {style['timepass_pct']}% Timepass | ⏭️ {style['skip_pct']}% Skip")
    print("\nTop User Favorites:")
    for m in profile["top_favorites"]:
        print(f"  ★ {m['rating']:.1f}/5.0 [{m['moctale_verdict']}] - {m['title']} ({m['genres']})")
    print("-" * 76)
    print(f"Top {top_n} Unseen Recommendations (SVD Matrix Factorization + Moctale Meter):")
    recs = recommender.recommend_for_user(user_id, top_n=top_n)
    for i, r in enumerate(recs, 1):
        m_info = r["moctale"]
        print(f"  {i}. {r['title']}")
        print(f"     Consensus: {m_info['verdict_display']} | Predicted Rating: {r['predicted_rating']:.2f}/5.0")
        print(f"     Moctale Meter: 🌟 {m_info['perfection_pct']}% Perfection | 👍 {m_info['goforit_pct']}% Go for it | ⏳ {m_info['timepass_pct']}% Timepass | ⏭️ {m_info['skip_pct']}% Skip ({m_info['vote_count']} votes)")
        print(f"     Genres: {r['genres']}")
        if r['imdb_url']:
            print(f"     IMDb: {r['imdb_url']}")
    print("=" * 76 + "\n")


def print_content_recommendations(recommender: MovieRecommender, query: str, top_n: int = 5) -> None:
    target, recs = recommender.recommend_by_movie(query, top_n=top_n)
    t_moctale = target["moctale"]
    print("=" * 76)
    print(f"🎯 Content-Based Recommendations (Cold Start Genre Similarity)")
    print("=" * 76)
    print(f"Target Movie: {target['title']}")
    print(f"Moctale Consensus: {t_moctale['verdict_display']} (🌟 {t_moctale['perfection_pct']}% Perfection | 👍 {t_moctale['goforit_pct']}% Go for it)")
    if t_moctale["vibe_chart"]:
        vibes = ", ".join([f"{k}: {v}%" for k, v in t_moctale["vibe_chart"].items()])
        print(f"Moctale Vibe Chart: {vibes}")
    if target["imdb_url"]:
        print(f"IMDb: {target['imdb_url']}")
    print("-" * 76)
    print(f"Top {top_n} Similar Movies (TF-IDF & Cosine Similarity):")
    for i, r in enumerate(recs, 1):
        m_info = r["moctale"]
        print(f"  {i}. {r['title']} [Similarity: {r['similarity_score']*100:.1f}%]")
        print(f"     Moctale Consensus: {m_info['verdict_display']}")
        print(f"     Meter Breakdown: 🌟 {m_info['perfection_pct']}% Perfection | 👍 {m_info['goforit_pct']}% Go for it | ⏳ {m_info['timepass_pct']}% Timepass | ⏭️ {m_info['skip_pct']}% Skip")
        print(f"     Genres: {r['genres']}")
        if r['imdb_url']:
            print(f"     IMDb: {r['imdb_url']}")
    print("=" * 76 + "\n")


def run_interactive(recommender: MovieRecommender) -> None:
    print("\n" + "=" * 76)
    print("🍿 Welcome to the MovieLens + Moctale Recommendation System")
    print("=" * 76)
    while True:
        print("\nChoose an option:")
        print("  1. Personalized Recommendations for a User ID (Collaborative Filtering + Moctale)")
        print("  2. Similar Movie Recommendations by Title (Content-Based + Moctale Vibe)")
        print("  3. Top Rated Movies in Dataset (Bayesian Weighted + Moctale Consensus)")
        print("  4. Exit")
        choice = input("\nEnter choice (1-4): ").strip()

        if choice == "1":
            user_input = input("Enter User ID (1 to 610): ").strip()
            if not user_input.isdigit():
                print("⚠️ Invalid User ID.")
                continue
            user_id = int(user_input)
            try:
                print_user_recommendations(recommender, user_id)
            except Exception as e:
                print(f"⚠️ Error: {e}")

        elif choice == "2":
            query = input("Enter movie title (e.g. 'Toy Story', 'Inception', 'Matrix'): ").strip()
            if not query:
                continue
            try:
                print_content_recommendations(recommender, query)
            except Exception as e:
                print(f"⚠️ Error: {e}")

        elif choice == "3":
            print("\n" + "=" * 76)
            print("⭐ Top 10 Movies by Bayesian-Weighted Rating & Moctale Meter:")
            print("=" * 76)
            top_movies = recommender.get_top_rated_movies(10)
            for i, m in enumerate(top_movies, 1):
                m_info = m["moctale"]
                print(f"  {i}. {m['title']} - Score: {m['bayesian_score']:.2f} ({m['rating_count']} reviews)")
                print(f"     Consensus: {m_info['verdict_display']} (🌟 {m_info['perfection_pct']}% Perfection | 👍 {m_info['goforit_pct']}% Go for it)")
                print(f"     Genres: {m['genres']}")
            print("=" * 76)

        elif choice in ("4", "q", "quit", "exit"):
            print("Exiting MovieLens Recommendation System. Enjoy your movies!")
            break
        else:
            print("⚠️ Invalid choice. Please select 1, 2, 3, or 4.")


def main() -> None:
    parser = argparse.ArgumentParser(description="MovieLens Recommendation System CLI with Moctale Meter")
    parser.add_argument("--user", type=int, help="User ID (1-610) for collaborative filtering")
    parser.add_argument("--movie", type=str, help="Movie title for content-based recommendations")
    parser.add_argument("--top", type=int, default=5, help="Number of recommendations to return (default: 5)")
    parser.add_argument("--top-rated", action="store_true", help="Display top rated movies in the dataset")
    parser.add_argument("--interactive", action="store_true", help="Launch interactive CLI mode")
    args = parser.parse_args()

    recommender = MovieRecommender()

    if args.interactive:
        run_interactive(recommender)
    elif args.user:
        print_user_recommendations(recommender, args.user, top_n=args.top)
    elif args.movie:
        print_content_recommendations(recommender, args.movie, top_n=args.top)
    elif args.top_rated:
        top_movies = recommender.get_top_rated_movies(args.top)
        print("\n" + "=" * 76)
        print(f"⭐ Top {args.top} Movies by Bayesian-Weighted Rating & Moctale Meter:")
        print("=" * 76)
        for i, m in enumerate(top_movies, 1):
            m_info = m["moctale"]
            print(f"  {i}. {m['title']} - Score: {m['bayesian_score']:.2f} ({m['rating_count']} reviews)")
            print(f"     Consensus: {m_info['verdict_display']} (🌟 {m_info['perfection_pct']}% Perfection | 👍 {m_info['goforit_pct']}% Go for it)")
            print(f"     Genres: {m['genres']}")
        print("=" * 76 + "\n")
    else:
        print("\n" + "=" * 76)
        print("🎬 MovieLens Recommendation System + Moctale Meter Demo")
        print("=" * 76)
        print("\n1. Testing Collaborative Filtering for User #1:")
        print_user_recommendations(recommender, 1, top_n=args.top)

        print("\n2. Testing Content-Based Filtering with Moctale Vibe for 'Toy Story (1995)':")
        print_content_recommendations(recommender, "Toy Story (1995)", top_n=args.top)

        print("💡 Tip: Run with `--interactive` for interactive mode, or `--help` for options.\n")


if __name__ == "__main__":
    main()

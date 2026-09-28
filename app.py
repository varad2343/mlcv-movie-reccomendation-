"""Flask Web Application for the MovieLens Recommendation System with Moctale Meter.

Provides an interactive dashboard for:
- Moctale Rating Meter: Perfection, Go for it, Timepass, Skip
- Collaborative Filtering (SVD Matrix Factorization) by User ID
- Content-Based Filtering (TF-IDF + Cosine Similarity) by Movie Title
- Top Bayesian-Weighted Movies
- Moctale & MovieLens Analytics and Charts
"""

from __future__ import annotations

import os
from pathlib import Path

from flask import Flask, jsonify, render_template, request, send_from_directory
from recommend import MovieRecommender

app = Flask(__name__, static_folder="static", template_folder="templates")

# Initialize recommender (loads cached SVD model or fits in ~1.8s)
recommender = MovieRecommender(data_dir=Path("data"), cache_dir=Path("outputs"))


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/stats")
def get_stats():
    ratings = recommender.ratings_df
    movies = recommender.movies_df
    
    total_ratings = len(ratings)
    total_users = int(ratings["userId"].nunique())
    total_movies = len(movies)
    global_mean = round(float(ratings["rating"].mean()), 3)

    return jsonify({
        "total_ratings": total_ratings,
        "total_users": total_users,
        "total_movies": total_movies,
        "global_mean": global_mean,
        "algorithms": [
            {"name": "Moctale Rating System", "type": "Consensus Categorization", "categories": ["Perfection", "Go for it", "Timepass", "Skip"]},
            {"name": "SVD Matrix Factorization", "type": "Collaborative Filtering", "best_rmse": 0.8457},
            {"name": "TF-IDF + Cosine Similarity", "type": "Content-Based Filtering", "features": "Genres"},
            {"name": "Bayesian Mean Shrinkage", "type": "Popularity Ranking", "prior_votes": 50},
        ]
    })


@app.route("/api/movies/search")
def search_movies():
    q = request.args.get("q", "").strip()
    if not q or len(q) < 2:
        return jsonify([])

    # Use regex=False to prevent crashes with parentheses in movie titles (e.g., "(1995)")
    matches = recommender.movies_df[
        recommender.movies_df["title"].str.contains(q, case=False, na=False, regex=False)
    ].head(15)

    results = []
    for _, row in matches.iterrows():
        mid = int(row["movieId"])
        moctale_info = recommender.get_movie_moctale_info(mid)
        results.append({
            "movieId": mid,
            "title": row["title"],
            "genres": row["genres"],
            "moctale": moctale_info,
            "imdb_url": f"https://www.imdb.com/title/tt{row.get('imdbId', '')}/" if row.get("imdbId") else "",
        })
    return jsonify(results)


@app.route("/api/user-profile/<int:user_id>")
def get_user_profile(user_id: int):
    try:
        profile = recommender.get_user_profile(user_id)
        return jsonify({"success": True, "profile": profile})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400


@app.route("/api/recommend/user")
def recommend_user():
    try:
        user_id = int(request.args.get("user_id", 1))
        top_n = min(int(request.args.get("top_n", 5)), 20)
        recs = recommender.recommend_for_user(user_id=user_id, top_n=top_n)
        profile = recommender.get_user_profile(user_id=user_id)
        return jsonify({
            "success": True,
            "user_id": user_id,
            "profile": profile,
            "recommendations": recs,
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400


@app.route("/api/recommend/movie")
def recommend_movie():
    try:
        query = request.args.get("query", "").strip()
        top_n = min(int(request.args.get("top_n", 5)), 20)
        if not query:
            return jsonify({"success": False, "error": "Query movie parameter is required"}), 400

        target, recs = recommender.recommend_by_movie(query, top_n=top_n)
        return jsonify({
            "success": True,
            "target": target,
            "recommendations": recs,
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400


@app.route("/api/top-rated")
def top_rated():
    top_n = min(int(request.args.get("top_n", 12)), 30)
    recs = recommender.get_top_rated_movies(top_n=top_n)
    return jsonify({"success": True, "movies": recs})


@app.route("/outputs/moctale/<path:filename>")
def serve_output(filename: str):
    return send_from_directory("outputs/moctale", filename)


@app.route("/images/<path:filename>")
def serve_images(filename: str):
    return send_from_directory("images", filename)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"🎬 MovieLens Recommender App launching on http://127.0.0.1:{port}")
    app.run(host="127.0.0.1", port=port, debug=False)

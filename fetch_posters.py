from __future__ import annotations

import argparse
import csv
import logging
import os
import sys
import time
from pathlib import Path
from typing import Optional

import requests

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

TMDB_API_URL = "https://api.themoviedb.org/3/movie/{tmdb_id}?api_key={api_key}"
TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500{poster_path}"

def get_poster_path(tmdb_id: str, api_key: str) -> Optional[str]:
    """Fetch the poster_path for a given tmdb_id using TMDB API."""
    url = TMDB_API_URL.format(tmdb_id=tmdb_id, api_key=api_key)
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()
        return data.get("poster_path")
    except requests.exceptions.RequestException as e:
        logger.error(f"Failed to fetch data for tmdb_id {tmdb_id}: {e}")
        return None

def download_image(url: str, save_path: Path) -> bool:
    """Download image from url and save to save_path."""
    try:
        response = requests.get(url, stream=True, timeout=10)
        response.raise_for_status()
        with open(save_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        return True
    except requests.exceptions.RequestException as e:
        logger.error(f"Failed to download image from {url}: {e}")
        return False

def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch movie posters from TMDB.")
    parser.add_argument("--api-key", type=str, help="TMDB API key. Can also be set via TMDB_API_KEY environment variable.")
    parser.add_argument("--limit", type=int, help="Limit the number of posters to fetch.")
    parser.add_argument("--data-dir", type=str, default="data", help="Directory containing links.csv")
    parser.add_argument("--output-dir", type=str, default="posters", help="Directory to save downloaded posters")
    
    args = parser.parse_args()

    api_key = args.api_key or os.environ.get("TMDB_API_KEY")
    if not api_key:
        logger.error("TMDB API key is required. Provide it via --api-key or TMDB_API_KEY environment variable.")
        sys.exit(1)

    data_dir = Path(args.data_dir)
    output_dir = Path(args.output_dir)
    links_file = data_dir / "links.csv"

    if not links_file.exists():
        logger.error(f"Links file not found at {links_file}")
        sys.exit(1)

    output_dir.mkdir(parents=True, exist_ok=True)

    movies = []
    with open(links_file, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("tmdbId"):
                movies.append({"movieId": row["movieId"], "tmdbId": row["tmdbId"]})

    if args.limit:
        movies = movies[:args.limit]

    total_movies = len(movies)
    logger.info(f"Starting poster fetch for {total_movies} movies...")

    success_count = 0
    skip_count = 0
    fail_count = 0

    for i, movie in enumerate(movies, 1):
        movie_id = movie["movieId"]
        tmdb_id = movie["tmdbId"]
        poster_path = output_dir / f"{movie_id}.jpg"

        if poster_path.exists():
            logger.info(f"[{i}/{total_movies}] Skipping movieId {movie_id}, poster already exists.")
            skip_count += 1
            continue

        logger.info(f"[{i}/{total_movies}] Fetching poster for movieId {movie_id} (tmdbId {tmdb_id})...")
        
        poster_url_path = get_poster_path(tmdb_id, api_key)
        if poster_url_path:
            image_url = TMDB_IMAGE_BASE_URL.format(poster_path=poster_url_path)
            if download_image(image_url, poster_path):
                success_count += 1
            else:
                fail_count += 1
        else:
            logger.warning(f"No poster path found for movieId {movie_id} (tmdbId {tmdb_id})")
            fail_count += 1

        # Rate limiting: 0.25s between requests
        time.sleep(0.25)

    logger.info(f"Finished. Success: {success_count}, Skipped: {skip_count}, Failed: {fail_count}")

if __name__ == "__main__":
    main()

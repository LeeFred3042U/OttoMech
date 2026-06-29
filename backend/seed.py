"""Seed Lucknow mechanics into the database."""

from db import get_db, init_db

MECHANICS = [
    {
        "name": "Ravi Sharma",
        "phone": "9876001001",
        "garage_name": "Gomti Auto Care",
        "lat": 26.8496,
        "lng": 81.0062,
        "zone": "Gomti Nagar",
        "rating": 4.6,
    },
    {
        "name": "Amit Verma",
        "phone": "9876001002",
        "garage_name": "Hazratganj Motors",
        "lat": 26.8500,
        "lng": 80.9498,
        "zone": "Hazratganj",
        "rating": 4.5,
    },
    {
        "name": "Suresh Yadav",
        "phone": "9876001003",
        "garage_name": "Alambagh Roadside Garage",
        "lat": 26.8056,
        "lng": 80.9108,
        "zone": "Alambagh",
        "rating": 4.3,
    },
    {
        "name": "Deepak Singh",
        "phone": "9876001004",
        "garage_name": "Indira Nagar Car Clinic",
        "lat": 26.8700,
        "lng": 80.9950,
        "zone": "Indira Nagar",
        "rating": 4.7,
    },
    {
        "name": "Mohit Tiwari",
        "phone": "9876001005",
        "garage_name": "Lalbagh Express Service",
        "lat": 26.8380,
        "lng": 80.9200,
        "zone": "Lalbagh",
        "rating": 4.4,
    },
]


def seed():
    init_db()

    with get_db() as conn:
        with conn.cursor() as cur:
            for mechanic in MECHANICS:
                cur.execute(
                    """
                    INSERT INTO mechanics (
                        name, phone, garage_name, lat, lng, location,
                        zone, is_available, rating
                    )
                    VALUES (
                        %s, %s, %s, %s, %s,
                        ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
                        %s, TRUE, %s
                    )
                    ON CONFLICT (phone) DO UPDATE SET
                        name = EXCLUDED.name,
                        garage_name = EXCLUDED.garage_name,
                        lat = EXCLUDED.lat,
                        lng = EXCLUDED.lng,
                        location = EXCLUDED.location,
                        zone = EXCLUDED.zone,
                        is_available = EXCLUDED.is_available,
                        rating = EXCLUDED.rating;
                    """,
                    (
                        mechanic["name"],
                        mechanic["phone"],
                        mechanic["garage_name"],
                        mechanic["lat"],
                        mechanic["lng"],
                        mechanic["lng"],
                        mechanic["lat"],
                        mechanic["zone"],
                        mechanic["rating"],
                    ),
                )

    print(f"Seeded {len(MECHANICS)} mechanics in Lucknow.")


if __name__ == "__main__":
    seed()

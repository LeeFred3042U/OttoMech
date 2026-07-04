"""Seed 20 Lucknow mechanics into the schema.

Run with:   python seed.py
This resets the DB completely (force_reset=True) so it can be re-run safely.
Mechanics have no static lat/lng — their live location is captured via GPS
when they toggle is_available = TRUE from the dashboard.
"""

from db import get_db, init_db

MECHANICS = [
    {
        "first_name": "Authorized",
        "last_name": "Manager",
        "email": "cargarage24x7@ottomech.local",
        "phone_number": "+919532934337",
        "workshop_name": "The Car Garage - 24x7 Car Repair",
        "address": "Gomti Nagar, Lucknow",
        "zone": "Gomti Nagar",
        "rating": 4.8,
        "is_available": True,
    },
    {
        "first_name": "Authorized",
        "last_name": "Manager",
        "email": "gomechanic.lko@ottomech.local",
        "phone_number": "+919812345671",
        "workshop_name": "GoMechanic - Lucknow H.Q.",
        "address": "Charbagh, Lucknow",
        "zone": "Charbagh",
        "rating": 3.7,
        "is_available": False,
    },
    {
        "first_name": "Authorized",
        "last_name": "Manager",
        "email": "luckyautocare@ottomech.local",
        "phone_number": "+919812345672",
        "workshop_name": "Lucky Auto Care",
        "address": "Pan Dariba Marg, Charbagh, Lucknow",
        "zone": "Charbagh",
        "rating": 4.6,
        "is_available": True,
    },
    {
        "first_name": "Authorized",
        "last_name": "Manager",
        "email": "carmechservice@ottomech.local",
        "phone_number": "+919812345673",
        "workshop_name": "Car Mechanic Service Center",
        "address": "Nishat Ganj, Lucknow",
        "zone": "Nishat Ganj",
        "rating": 4.2,
        "is_available": False,
    },
    {
        "first_name": "Authorized",
        "last_name": "Manager",
        "email": "mechanicnow@ottomech.local",
        "phone_number": "+919812345674",
        "workshop_name": "Mechanic Now Authorised Workshop & Tyre Shop",
        "address": "Faizabad Road, Lucknow",
        "zone": "Faizabad Road",
        "rating": 4.9,
        "is_available": True,
    },
    {
        "first_name": "Authorized",
        "last_name": "Manager",
        "email": "baazservices@ottomech.local",
        "phone_number": "+919812345675",
        "workshop_name": "Baaz Services",
        "address": "Kanpur Road, Lucknow",
        "zone": "Kanpur Road",
        "rating": 3.9,
        "is_available": False,
    },
    {
        "first_name": "Authorized",
        "last_name": "Manager",
        "email": "rycabz@ottomech.local",
        "phone_number": "+919812345676",
        "workshop_name": "Rycabz Car Service Centre",
        "address": "Vibhuti Khand, Gomti Nagar, Lucknow",
        "zone": "Gomti Nagar",
        "rating": 4.4,
        "is_available": True,
    },
    {
        "first_name": "Authorized",
        "last_name": "Manager",
        "email": "honeycarspa@ottomech.local",
        "phone_number": "+919812345677",
        "workshop_name": "Honey Car Spa",
        "address": "Alambagh, Lucknow",
        "zone": "Alambagh",
        "rating": 4.1,
        "is_available": False,
    },
    {
        "first_name": "Authorized",
        "last_name": "Manager",
        "email": "mvvmotors@ottomech.local",
        "phone_number": "+919812345678",
        "workshop_name": "Mvv Motors",
        "address": "Lucknow",
        "zone": "Lucknow",
        "rating": 4.0,
        "is_available": True,
    },
    {
        "first_name": "Authorized",
        "last_name": "Manager",
        "email": "harmanmotors@ottomech.local",
        "phone_number": "+919812345679",
        "workshop_name": "Harman Motors",
        "address": "Lucknow",
        "zone": "Lucknow",
        "rating": 4.7,
        "is_available": False,
    },
    {
        "first_name": "Authorized",
        "last_name": "Manager",
        "email": "wecare@ottomech.local",
        "phone_number": "+919812345680",
        "workshop_name": "We Care Automobiles",
        "address": "Lucknow",
        "zone": "Lucknow",
        "rating": 3.8,
        "is_available": True,
    },
    {
        "first_name": "Authorized",
        "last_name": "Manager",
        "email": "anandmotors@ottomech.local",
        "phone_number": "+919812345681",
        "workshop_name": "Anand Motors Agencies Limited",
        "address": "Lucknow",
        "zone": "Lucknow",
        "rating": 4.3,
        "is_available": False,
    },
    {
        "first_name": "Authorized",
        "last_name": "Manager",
        "email": "dashmesh@ottomech.local",
        "phone_number": "+919812345682",
        "workshop_name": "Dashmesh Motors",
        "address": "Lucknow",
        "zone": "Lucknow",
        "rating": 4.5,
        "is_available": True,
    },
    {
        "first_name": "Authorized",
        "last_name": "Manager",
        "email": "autoclinic@ottomech.local",
        "phone_number": "+919812345683",
        "workshop_name": "The Auto Clinic",
        "address": "Tedhi Pulia, Lucknow",
        "zone": "Tedhi Pulia",
        "rating": 4.2,
        "is_available": False,
    },
    {
        "first_name": "Authorized",
        "last_name": "Manager",
        "email": "motorcaregarage@ottomech.local",
        "phone_number": "+919812345684",
        "workshop_name": "Motor Care Garage",
        "address": "Moti Nagar, Lucknow",
        "zone": "Moti Nagar",
        "rating": 3.6,
        "is_available": True,
    },
    {
        "first_name": "Authorized",
        "last_name": "Manager",
        "email": "citycarrepair@ottomech.local",
        "phone_number": "+919812345685",
        "workshop_name": "City Car Repair",
        "address": "Indira Nagar, Lucknow",
        "zone": "Indira Nagar",
        "rating": 4.9,
        "is_available": True,
    },
    {
        "first_name": "Authorized",
        "last_name": "Manager",
        "email": "roadsidefix@ottomech.local",
        "phone_number": "+919812345686",
        "workshop_name": "Roadside Auto Fix",
        "address": "Aminabad, Lucknow",
        "zone": "Aminabad",
        "rating": 3.9,
        "is_available": False,
    },
    {
        "first_name": "Authorized",
        "last_name": "Manager",
        "email": "premiumauto@ottomech.local",
        "phone_number": "+919812345687",
        "workshop_name": "Premium Auto Works",
        "address": "Jankipuram, Lucknow",
        "zone": "Jankipuram",
        "rating": 4.6,
        "is_available": True,
    },
    {
        "first_name": "Authorized",
        "last_name": "Manager",
        "email": "highwayauto@ottomech.local",
        "phone_number": "+919812345688",
        "workshop_name": "Highway Auto Service",
        "address": "Lucknow-Agra Highway, Lucknow",
        "zone": "Lucknow-Agra Highway",
        "rating": 4.0,
        "is_available": False,
    },
    {
        "first_name": "Authorized",
        "last_name": "Manager",
        "email": "expresscarworkshop@ottomech.local",
        "phone_number": "+919812345689",
        "workshop_name": "Express Car Workshop",
        "address": "Lucknow-Agra Highway, Lucknow",
        "zone": "Lucknow-Agra Highway",
        "rating": 4.8,
        "is_available": True,
    },
]

UPSERT_SQL = """
INSERT INTO mechanics (
    first_name, last_name, display_name, gender, email,
    phone_number, country, workshop_name, address, zone,
    is_available, rating
)
VALUES (
    %s, %s, %s, 'prefer_not_to_say', %s,
    %s, 'IN', %s, %s, %s,
    %s, %s
)
ON CONFLICT (phone_number) DO UPDATE SET
    first_name    = EXCLUDED.first_name,
    last_name     = EXCLUDED.last_name,
    display_name  = EXCLUDED.display_name,
    email         = EXCLUDED.email,
    workshop_name = EXCLUDED.workshop_name,
    address       = EXCLUDED.address,
    zone          = EXCLUDED.zone,
    is_available  = EXCLUDED.is_available,
    rating        = EXCLUDED.rating;
"""


def seed():
    init_db(force_reset=True)

    with get_db() as conn:
        with conn.cursor() as cur:
            for m in MECHANICS:
                display_name = f"{m['first_name']} {m['last_name']}"
                cur.execute(
                    UPSERT_SQL,
                    (
                        m["first_name"],
                        m["last_name"],
                        display_name,
                        m["email"],
                        m["phone_number"],
                        m["workshop_name"],
                        m["address"],
                        m["zone"],
                        m["is_available"],
                        m["rating"],
                    ),
                )

            cur.execute("SELECT COUNT(*) FROM mechanics;")
            total = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM mechanics WHERE is_available = TRUE;")
            available = cur.fetchone()[0]

    print(f"{total} mechanics seeded ({available} available)")


if __name__ == "__main__":
    seed()

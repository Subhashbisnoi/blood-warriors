import math
from datetime import date
from typing import Optional


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def compute_donor_score(
    donations_till_date: int,
    calls_to_donations_ratio: float,
    user_donation_active_status: str,
    latitude: Optional[float],
    longitude: Optional[float],
    donor_type: str,
    next_eligible_date: Optional[date],
    transfusion_date: date,
    patient_lat: float,
    patient_lon: float,
    max_distance_km: float = 50.0,
) -> dict:
    # Reliability: log(n+1) / log(13) — max donations is 12
    reliability = math.log(donations_till_date + 1) / math.log(13) if donations_till_date >= 0 else 0.0

    # Engagement: 1 / (ratio + 0.1) capped at 1.0
    engagement = min(1.0, 1.0 / (calls_to_donations_ratio + 0.1))

    # Active bonus
    active_bonus = 1.0 if user_donation_active_status == "Active" else 0.0

    # Proximity
    if latitude and longitude:
        dist_km = haversine(latitude, longitude, patient_lat, patient_lon)
        proximity = max(0.0, 1.0 - (dist_km / max_distance_km))
    else:
        dist_km = max_distance_km
        proximity = 0.0

    # Type bonus
    type_map = {"Regular Donor": 1.0, "One-Time Donor": 0.6, "Other": 0.3}
    type_bonus = type_map.get(donor_type, 0.3)

    # Timing: 1.0 if next_eligible_date <= transfusion_date
    timing = 1.0 if next_eligible_date and next_eligible_date <= transfusion_date else 0.0

    total = (
        0.25 * reliability
        + 0.20 * engagement
        + 0.20 * active_bonus
        + 0.15 * proximity
        + 0.10 * type_bonus
        + 0.10 * timing
    )

    if total >= 0.60:
        tier = "Tier1"
    elif total >= 0.40:
        tier = "Tier2"
    else:
        tier = "Reserve"

    return {
        "score": round(total, 4),
        "tier": tier,
        "distance_km": round(dist_km, 2),
        "reliability_score": round(reliability, 4),
        "engagement_score": round(engagement, 4),
        "active_bonus": round(active_bonus, 4),
        "proximity_score": round(proximity, 4),
        "type_bonus": round(type_bonus, 4),
        "timing_score": round(timing, 4),
    }

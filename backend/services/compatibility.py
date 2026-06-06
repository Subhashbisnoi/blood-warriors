COMPATIBILITY_MAP: dict[str, list[str]] = {
    "O Negative": [
        "O Negative", "O Positive",
        "A Negative", "A Positive",
        "B Negative", "B Positive",
        "AB Negative", "AB Positive",
    ],
    "O Positive": ["O Positive", "A Positive", "B Positive", "AB Positive"],
    "A Negative": ["A Negative", "A Positive", "AB Negative", "AB Positive"],
    "A Positive": ["A Positive", "AB Positive"],
    "B Negative": ["B Negative", "B Positive", "AB Negative", "AB Positive"],
    "B Positive": ["B Positive", "AB Positive"],
    "AB Negative": ["AB Negative", "AB Positive"],
    "AB Positive": ["AB Positive"],
}

RARE_GROUPS = {"O Negative", "A Negative", "AB Negative", "Bombay Blood Group"}
STANDARD_GROUPS = list(COMPATIBILITY_MAP.keys())


def get_compatible_donor_groups(patient_blood_group: str) -> list[str]:
    compatible = []
    for donor_bg, can_donate_to in COMPATIBILITY_MAP.items():
        if patient_blood_group in can_donate_to:
            compatible.append(donor_bg)
    return compatible


def is_rare(blood_group: str) -> bool:
    return blood_group in RARE_GROUPS


def search_radius_for(blood_group: str) -> int:
    return 100 if is_rare(blood_group) else 50

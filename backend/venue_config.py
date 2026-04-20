VENUE_PRESETS = {
    "stadium_a": {
        "name": "City Stadium A",
        "grid": {"width": 40, "height": 24},
        "user_count": 400,
        "zones": {
            "Gate A": [1, 2, 6, 7],
            "Gate B": [10, 2, 15, 7],
            "Gate C": [20, 2, 25, 7],
            "Gate D": [30, 2, 36, 7],
            "Food Court": [13, 14, 27, 20],
            "Exit": [17, 21, 23, 23],
            "Seating": [1, 8, 38, 12],
        },
    },
    "arena_b": {
        "name": "Indoor Arena B",
        "grid": {"width": 36, "height": 20},
        "user_count": 250,
        "zones": {
            "Gate North": [1, 1, 8, 5],
            "Gate South": [27, 1, 34, 5],
            "Gate East": [1, 14, 8, 19],
            "Gate West": [27, 14, 34, 19],
            "Concession": [12, 8, 24, 14],
            "Exit": [15, 17, 21, 19],
            "Seating": [9, 6, 27, 13],
        },
    },
}


def get_venue(name: str):
    return VENUE_PRESETS.get(name)

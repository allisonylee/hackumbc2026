"""Native-leaning street tree list by size class (written to species.json)."""


def species_list():
    s = lambda name, latin, size, wires, w, native, notes="": dict(
        name=name, latin=latin, size=size, underWires=wires, minWidthFt=w, native=native, notes=notes)
    return [
        s("Eastern redbud", "Cercis canadensis", "small", True, 3, True, "Spring flowers"),
        s("Serviceberry", "Amelanchier canadensis", "small", True, 3, True, "Berries feed birds"),
        s("American hornbeam", "Carpinus caroliniana", "small", True, 3, True),
        s("Hedge maple", "Acer campestre", "small", True, 3, False, "Tolerates urban stress"),
        s("Blackgum", "Nyssa sylvatica", "medium", False, 4, True, "Red fall color"),
        s("American hophornbeam", "Ostrya virginiana", "medium", False, 4, True),
        s("Yellowwood", "Cladrastis kentukea", "medium", False, 4, False),
        s("Willow oak", "Quercus phellos", "large", False, 6, True, "Classic Baltimore street tree"),
        s("Swamp white oak", "Quercus bicolor", "large", False, 6, True),
        s("Red maple", "Acer rubrum", "large", False, 6, True),
        s("London planetree", "Platanus × acerifolia", "large", False, 6, False),
        s("Kentucky coffeetree", "Gymnocladus dioicus", "large", False, 6, False),
    ]

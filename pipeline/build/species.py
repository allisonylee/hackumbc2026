"""Native-leaning street tree list by size class (written to species.json)."""


def species_list():
    """Checked against Baltimore City's Approved Tree Species List (updated 2025-08-29):
    - hedge maple is not listed here: the city lists it as nonnative and invasive, not to be planted;
    - red maple is not listed here: "Overplanted. Do not plant without specific Forestry approval";
    - American hornbeam is medium on the city list (35-50 ft), so not for spots under wires;
    - native = the city list's "Native" status (historically present in the Mid-Atlantic).
    """
    s = lambda name, latin, size, wires, w, native, notes="": dict(
        name=name, latin=latin, size=size, underWires=wires, minWidthFt=w, native=native, notes=notes)
    return [
        s("Eastern redbud", "Cercis canadensis", "small", True, 3, True, "Spring flowers"),
        s("Serviceberry", "Amelanchier canadensis", "small", True, 3, True, "Berries feed birds"),
        s("American hornbeam", "Carpinus caroliniana", "medium", False, 4, True),
        s("Blackgum", "Nyssa sylvatica", "medium", False, 4, True, "Red fall color"),
        s("American hophornbeam", "Ostrya virginiana", "medium", False, 4, True),
        s("Yellowwood", "Cladrastis kentukea", "medium", False, 4, False),
        s("Willow oak", "Quercus phellos", "large", False, 6, True, "Classic Baltimore street tree"),
        s("Swamp white oak", "Quercus bicolor", "large", False, 6, True),
        s("London planetree", "Platanus × acerifolia", "large", False, 6, False),
        s("Kentucky coffeetree", "Gymnocladus dioicus", "large", False, 6, True,
          "Streets: fruitless 'Espresso' cultivar only"),
    ]

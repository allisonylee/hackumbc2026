---
title: "Where the app's data comes from"
url: https://github.com/allisonylee/hackumbc2026
source: A Tree Grows in Baltimore (hackUMBC 2026)
---

The app combines public datasets about Baltimore:

- **Tree canopy and land cover:** the Chesapeake Bay Program's 1-meter land use/land cover maps (2024 edition, covering 2018 and 2021), which classify every square meter as tree canopy, buildings, roads, other pavement, grass or water.
- **Heat:** NOAA and CAPA Strategies' Heat Watch campaign, in which volunteers drove car-mounted sensors across Baltimore on the afternoon of August 29, 2018.
- **Planting sites and existing trees:** Baltimore City's street-tree inventory, which records existing trees and vacant sites where a street tree could go.
- **Neighborhoods:** Baltimore City's neighborhood boundaries.
- **People:** 2020 Census neighborhood population, plus tract-level income and poverty data; CDC PLACES adult asthma estimates; and the CDC Social Vulnerability Index.
- **Redlining:** the 1937 Home Owners' Loan Corporation (HOLC) map of Baltimore, from the Mapping Inequality project.
- **Cooling centers:** cooling center locations from Baltimore's Code Red heat program.
- **Tree benefits:** the U.S. Forest Service Northeast Community Tree Guide, for energy, carbon, air quality and stormwater benefits by tree size.

Neighborhood facts the chat guide quotes (canopy, heat compared with the city median, income, asthma, number of open planting sites, rankings) are computed from these datasets. Social data is joined by where each block's center falls, so it is approximate for blocks that straddle boundaries.

---
title: "What this app does: A Tree Grows in Baltimore"
url: https://github.com/allisonylee/hackumbc2026
source: A Tree Grows in Baltimore (hackUMBC 2026)
---

This app shows where Baltimore is hottest and least shaded, and plans where new street trees would cool the most people for a given budget. It has three tabs.

**Current State** is a map of the city split into small hexagons, each about 66 meters across, roughly one city block. For each hexagon it shows tree canopy, afternoon heat, pavement and buildings, and who lives there, including income, asthma rates and whether the area was redlined in 1937. You can compare neighborhoods and see how heat and canopy line up.

**Plan** lets you set a budget and choose who the trees should benefit most. An optimizer then picks specific vacant planting sites from the city's street-tree inventory and shows the expected cooling, the residents reached, and benefits like carbon and stormwater. Clicking a site explains why it was chosen.

**Learn** tells the story of heat, redlining and trees in Baltimore through a scrolling map, lists ways to help (requesting a street tree, volunteering, donating), and includes this chat guide.

The heat estimates come from a machine-learning model trained on real temperature measurements. The planner itself is plain math, not AI. The chat guide is the only part that uses a language model, and it runs on a small local model rather than a cloud service.

---
title: "How is the Tree Equity Score calculated? (American Forests)"
url: https://www.treeequityscore.org/methodology
source: American Forests, Tree Equity Score methodology
---

**Key takeaway:** Tree Equity Score, made by the nonprofit American Forests, rates every urban neighborhood in the US from 0 to 100. It combines how far a neighborhood is below its tree canopy goal with how much its residents need trees. A lower score means a higher priority for planting; 100 means the neighborhood has enough trees.

## Scale
Scores are calculated for each Census block group (a neighborhood-sized area). The score covers every urban block group in the US, including Hawai'i, Alaska, Puerto Rico and the US Virgin Islands.

## Step 1: A canopy goal for each neighborhood
Each block group gets a tree canopy goal. It starts from a baseline for the natural biome: Forest 40%, Grassland 20%, Mediterranean 20%, Desert 15%. The goal is then adjusted for building density, because buildings limit where trees can go (Goal = baseline × building density adjustment factor).

## Step 2: Existing canopy and the gap
Existing canopy mostly comes from Google Environmental Insights Explorer high-resolution tree canopy data (canopy % = tree area ÷ land area × 100). The **canopy gap** is the goal minus existing canopy. If a neighborhood already beats its goal, the gap is set to 0.

## Step 3: The priority index
The priority index uses seven equally weighted indicators:
- **Income:** share of people below 200% of the federal poverty line
- **Employment:** unemployment rate
- **Race:** share of people of color
- **Age:** ratio of children (0–17) and seniors (65+) to working-age adults
- **Language:** linguistic isolation (households with limited English)
- **Health:** poor mental health, poor physical health, asthma and heart disease (CDC PLACES 2022)
- **Heat:** how much hotter the block group's summer surface temperature is than the urban area average, from Landsat 8 data for summer 2022

Most of the social data come from the American Community Survey 2017–2021.

## Step 4: The score
The gap is scaled from 0 to 1 by dividing by the largest gap in the urban area. Then:
**Tree Equity Score = 100 × (1 − gap score × priority index).**
So a neighborhood scores low when it has a big canopy gap *and* high need.

## City scores
A city's composite score averages neighborhoods below 100 and gives extra credit when high-need neighborhoods already reach 100, so cities raise their score fastest by planting first where scores are low and need is high.

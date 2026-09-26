---
title: "How the Plan tab chooses where to plant trees"
url: https://github.com/allisonylee/hackumbc2026
source: Baltimore Tree Planting Planner (hackUMBC 2026)
---

The Plan tab picks specific vacant planting sites from Baltimore's street-tree inventory to get the most benefit for a budget. It does not use AI; it's an optimizer that runs in your browser in a fraction of a second.

Every candidate site gets a score of value per dollar. A site's value is the cooling its tree would bring, measured in degrees times the number of residents on that block, plus a smaller credit for benefits like carbon storage and stormwater. That value is multiplied by the tree's chance of surviving, because a tree that dies delivers nothing. The optimizer repeatedly buys the best-scoring site that still fits the budget, then re-scores that block, since each extra tree on the same block cools a little less than the one before. It stops when the money runs out.

Each site has a suggested species based on the space available and whether there are overhead power lines. Sites where the sidewalk must be cut cost more than sites with an existing empty tree pit.

Results show the number of trees, how many are expected to survive, money spent, average cooling in the targeted blocks, residents reached, the share of benefit going to low-income and historically redlined blocks, and yearly carbon, stormwater and dollar benefits. The app also compares the plan with planting the same number of trees at random, or in the blocks with the least canopy, so you can see what careful placement adds.
